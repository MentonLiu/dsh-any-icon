// Host half of dsh-any-icon.
//
// Provides the `anyIcon` Remote service. Scope: the App-icon feature targets
// ONLY the dsh desktop app itself. Two complementary layers make the change
// visible *immediately* on every macOS surface:
//
//   1. NATIVE layer — replace <app>/Contents/Resources/icon.icns with an icns
//      generated from the cropped PNG, then re-sign the bundle ad-hoc. This is
//      the icon the bundle itself carries (About panel, dialogs, and anything
//      that reads bundle metadata).
//   2. LIVE layer — write the same image as the bundle's Finder custom icon
//      (root `Icon\r` + the FinderInfo kHasCustomIcon bit) through
//      NSWorkspace.setIcon:forFile:options:. Finder, Spotlight, the Apps view
//      and the Dock all read that one first, so it is what changes *now*.
//
// Replacing the icns invalidates the code signature, so an apply runs in this
// order: drop the live icon -> write icns -> ad-hoc re-sign -> write the live
// icon again -> refresh the icon caches. `codesign` refuses a bundle that
// carries a custom icon ("resource fork, Finder information, or similar
// detritus not allowed"), which is exactly why the live layer is removed before
// signing and restored afterwards.
//
// macOS caches rendered icons in three places: the iconservices store/daemon
// and the Dock's own icon cache (which freezes a *running* app's icon at
// launch). We therefore SIGKILL iconservicesagent, drop the on-disk caches,
// re-register the bundle with LaunchServices, and finally ask the Dock to
// rebuild its icon cache through the same private "icon appearance"
// notification System Settings sends (`SLSIconAppearanceConfiguration`). No
// Dock/Finder restart, no app relaunch, no Launchpad layout reset.
//
// Byte-level reversibility: the first apply backs up icon.icns, icon.png, the
// main executable (which carries the embedded original signature) and
// _CodeSignature/CodeResources into ~/.dsh/any-icon/backup/. Restoring those
// files makes the ORIGINAL Developer ID signature valid again.
// Note: a dsh auto-update replaces the whole bundle and reverts the icon —
// just re-apply from the workshop.
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const BUNDLE_ID = 'com.deepseek.dsh'
const APP_NAMES = ['DeepSeek Harness.app']
const SEARCH_DIRS = ['/Applications', path.join(os.homedir(), 'Applications')]
// Test hook: pin the target app path explicitly (also lets CI/dev exercise
// the pipeline against an app copy outside /Applications, where macOS App
// Management TCC would otherwise gate writes).
const APP_PATH_OVERRIDE = process.env.DSH_ANY_ICON_APP_PATH || undefined
const MAX_PNG_BYTES = 3 * 1024 * 1024
const STATE_DIR = path.join(os.homedir(), '.dsh', 'any-icon')
const BACKUP_DIR = path.join(STATE_DIR, 'backup')
const MANIFEST_PATH = path.join(STATE_DIR, 'dsh-icon.json')
const BACKUP_FILES = [
  'Contents/Resources/icon.icns',
  'Contents/Resources/icon.png',
]
const EXECUTABLE_NAMES = ['DeepSeek Harness', 'DeepSeek']

// Bundle-root custom icon (classic Finder custom icon: the data fork is empty,
// the image lives in the com.apple.ResourceFork extended attribute).
const ICON_FILE_NAME = 'Icon\r'
const RESOURCE_FORK_XATTR = 'com.apple.ResourceFork'
const FINDER_INFO_XATTR = 'com.apple.FinderInfo'
// kHasCustomIcon lives in the Finder flags word (FinderInfo bytes 8-9).
const HAS_CUSTOM_ICON_BYTE = 8
const HAS_CUSTOM_ICON_MASK = 0x04

const XATTR_MAX_BUFFER = 64 * 1024 * 1024

// Executable + CodeResources carry the original embedded signature; back them
// up so a restore brings back the byte-identical bundle.
function executableNameFor(appPath) {
  for (const name of EXECUTABLE_NAMES) {
    if (fs.existsSync(path.join(appPath, 'Contents', 'MacOS', name))) return name
  }
  const entries = fs.existsSync(path.join(appPath, 'Contents', 'MacOS'))
    ? fs.readdirSync(path.join(appPath, 'Contents', 'MacOS'))
    : []
  return entries[0]
}

function assertNotAborted(signal) {
  if (signal && signal.aborted) {
    const err = new Error('aborted')
    err.name = 'AbortError'
    throw err
  }
}

async function run(file, args, options) {
  const { stdout } = await execFileAsync(file, args, options)
  return stdout
}

function runQuiet(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, (err, stdout) => resolve(err ? undefined : stdout))
  })
}

// ---- locating the dsh app ---------------------------------------------

async function findDshApp() {
  if (APP_PATH_OVERRIDE) {
    try {
      const infoPlist = path.join(APP_PATH_OVERRIDE, 'Contents', 'Info.plist')
      const bundleId = (await run('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', infoPlist])).trim()
      if (bundleId === BUNDLE_ID) return APP_PATH_OVERRIDE
    } catch { /* fall through to standard search */ }
  }
  for (const dir of SEARCH_DIRS) {
    for (const name of APP_NAMES) {
      const candidate = path.join(dir, name)
      try {
        const infoPlist = path.join(candidate, 'Contents', 'Info.plist')
        const bundleId = (await run('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', infoPlist])).trim()
        if (bundleId === BUNDLE_ID) return candidate
      } catch { /* not here */ }
    }
  }
  return undefined
}

// ---- manifest -----------------------------------------------------------

function loadManifest() {
  try {
    const parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
    if (parsed && parsed.version === 1) return parsed
  } catch { /* first run */ }
  return { version: 1, applied: false, appPath: undefined, appliedAt: undefined }
}

function saveManifest(manifest) {
  fs.mkdirSync(STATE_DIR, { recursive: true })
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
}

// CFBundleShortVersionString — the version the backup belongs to. A dsh
// auto-update swaps the whole bundle; restoring an executable from a different
// version would downgrade the app, so the version gates the byte-level restore.
async function readBundleVersion(appPath) {
  try {
    const infoPlist = path.join(appPath, 'Contents', 'Info.plist')
    return (await run('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', infoPlist])).trim()
  } catch {
    return undefined
  }
}

// ---- png → icns ---------------------------------------------------------

async function buildIcns(sourceBuffer) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-any-icon-'))
  const iconset = path.join(work, 'icon.iconset')
  fs.mkdirSync(iconset)
  const src = path.join(work, 'master')
  await fsp.writeFile(src, sourceBuffer)
  const sizes = [
    ['icon_16x16.png', 16], ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32], ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128], ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256], ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
  ]
  // sips is one process per size; running them concurrently keeps the whole
  // build well under a second instead of serialising ten launches.
  await Promise.all(sizes.map(([name, edge]) =>
    run('/usr/bin/sips', ['-s', 'format', 'png', '-z', String(edge), String(edge), src, '--out', path.join(iconset, name)]),
  ))
  const out = path.join(work, 'icon.icns')
  await run('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', out])
  const icns = await fsp.readFile(out)
  await fsp.rm(work, { recursive: true, force: true })
  return icns
}

async function toPng(sourceBuffer) {
  // The bundle also carries a plain icon.png; normalize any master to PNG.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-any-icon-'))
  const src = path.join(work, 'master')
  const out = path.join(work, 'master.png')
  await fsp.writeFile(src, sourceBuffer)
  await run('/usr/bin/sips', ['-s', 'format', 'png', src, '--out', out])
  const png = await fsp.readFile(out)
  await fsp.rm(work, { recursive: true, force: true })
  return png
}

// ---- signing ------------------------------------------------------------

async function resignAdHoc(appPath) {
  await run('/usr/bin/codesign', ['--force', '--sign', '-', appPath])
  // Verify the new seal actually validates.
  await execFileAsync('/usr/bin/codesign', ['--verify', appPath])
}

async function clearQuarantine(appPath) {
  await runQuiet('/usr/bin/xattr', ['-d', 'com.apple.quarantine', appPath])
}

// 'adhoc' | 'developer-id' | 'signed' | 'unsigned' | 'unknown'
async function readSignature(appPath) {
  const { stdout, stderr } = await execFileAsync('/usr/bin/codesign', ['-dvv', appPath])
    .catch((err) => ({ stdout: err.stdout || '', stderr: err.stderr || '' }))
  const text = `${stderr}${stdout}`
  if (/Signature=adhoc/.test(text)) return 'adhoc'
  if (/Authority=Developer ID/.test(text)) return 'developer-id'
  if (/Signature=/.test(text)) return 'signed'
  if (/code object is not signed/.test(text)) return 'unsigned'
  return 'unknown'
}

async function verifySignature(appPath) {
  try {
    await execFileAsync('/usr/bin/codesign', ['--verify', appPath])
    return true
  } catch {
    return false
  }
}

// ---- Finder custom icon (the LIVE layer) --------------------------------

function iconFilePath(appPath) {
  return path.join(appPath, ICON_FILE_NAME)
}

async function readXattrHex(file, name) {
  try {
    const { stdout } = await execFileAsync('/usr/bin/xattr', ['-px', name, file], { maxBuffer: XATTR_MAX_BUFFER })
    return stdout.replace(/[^0-9a-fA-F]/g, '')
  } catch {
    return undefined
  }
}

async function hasCustomIconFlag(appPath) {
  const hex = await readXattrHex(appPath, FINDER_INFO_XATTR)
  if (!hex || hex.length < 32) return false
  const bytes = Buffer.from(hex, 'hex')
  return (bytes[HAS_CUSTOM_ICON_BYTE] & HAS_CUSTOM_ICON_MASK) !== 0
}

async function clearCustomIconFlag(appPath) {
  // Remove the custom-icon flag, preserving colour labels and other FinderInfo
  // bits; drop the attribute entirely when nothing else is left in it.
  const hex = await readXattrHex(appPath, FINDER_INFO_XATTR)
  if (!hex || hex.length < 32) return false
  const bytes = Buffer.from(hex, 'hex')
  bytes[HAS_CUSTOM_ICON_BYTE] &= ~HAS_CUSTOM_ICON_MASK
  if (bytes.every((b) => b === 0)) {
    await runQuiet('/usr/bin/xattr', ['-d', FINDER_INFO_XATTR, appPath])
    return true
  }
  return (await runQuiet('/usr/bin/xattr', ['-wx', FINDER_INFO_XATTR, bytes.toString('hex'), appPath])) !== undefined
}

// Bytes of the live custom icon (data fork + resource fork). 0 = absent.
async function customIconBytes(appPath) {
  const file = iconFilePath(appPath)
  let bytes = 0
  try {
    bytes += (await fsp.stat(file)).size
  } catch {
    return 0
  }
  const hex = await readXattrHex(file, RESOURCE_FORK_XATTR)
  if (hex) bytes += Math.floor(hex.length / 2)
  return bytes
}

async function customIconPresent(appPath) {
  if (await customIconBytes(appPath) > 0) return true
  return hasCustomIconFlag(appPath)
}

// Drop the live icon: `Icon\r` (with its resource fork) and the Finder flag.
// Required before `codesign`, and the way back to the bundle's own icns.
async function clearCustomIcon(appPath) {
  const file = iconFilePath(appPath)
  let touched = false
  try {
    await fsp.rm(file, { force: true })
    touched = true
  } catch { /* keep going: the flag still has to go */ }
  const cleared = await clearCustomIconFlag(appPath)
  return touched || cleared
}

// NSWorkspace's custom-icon mechanism is what Finder / Spotlight / the Apps
// view / the Dock read first, and it updates them without touching the bundle's
// (signed) contents: the image rides in the bundle root, outside Contents/.
async function setCustomIconLive(appPath, pngBuffer) {
  const tmpPng = path.join(os.tmpdir(), `dsh-any-icon-live-${process.pid}-${Date.now()}.png`)
  await fsp.writeFile(tmpPng, pngBuffer)
  try {
    const jxa = [
      'ObjC.import("AppKit")',
      `const img = $.NSImage.alloc.initWithContentsOfFile(${JSON.stringify(tmpPng)})`,
      'if (img.isNil()) { "image-unreadable" }',
      `else { $.NSWorkspace.sharedWorkspace.setIconForFileOptions(img, ${JSON.stringify(appPath)}, 0).toString() }`,
    ].join('\n')
    const { stdout } = await execFileAsync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', jxa])
    const answer = stdout.trim()
    if (answer !== 'true') {
      throw new Error(`any-icon: could not set the Finder icon (${answer || 'no output from osascript'})`)
    }
    // Trust but verify: the icon must have landed as a non-empty custom icon.
    return (await customIconBytes(appPath)) > 0
  } finally {
    fsp.rm(tmpPng, { force: true }).catch(() => {})
  }
}

// ---- cache invalidation -------------------------------------------------

// Ask the Dock to rebuild its icon cache: the same private notification System
// Settings sends when the icon appearance changes. This is what makes a
// *running* app's Dock tile — frozen at launch otherwise — pick up the new
// icon, and it is instant (no `killall Dock`).
async function refreshDockIconCache() {
  const jxa = [
    'ObjC.import("Foundation")',
    'ObjC.import("AppKit")',
    'const cls = $.NSClassFromString("SLSIconAppearanceConfiguration")',
    'if (cls.isNil()) { "no-class" }',
    'else {',
    '  const cfg = cls.performSelector("fetchCurrentIconAppearanceConfiguration")',
    '  if (cfg.isNil()) { "no-config" } else { cfg.performSelector("save"); "ok" }',
    '}',
  ].join('\n')
  const stdout = await runQuiet('/usr/bin/osascript', ['-l', 'JavaScript', '-e', jxa])
  return typeof stdout === 'string' && stdout.trim() === 'ok'
}

function restartDock() {
  return new Promise((resolve) => {
    execFile('/bin/killall', ['Dock'], () => resolve(true))
  })
}

// macOS caches rendered app icons aggressively; a replaced icns or a new
// custom icon stays invisible until every layer is dropped:
//   1. the on-disk iconservices store + the Dock's own iconcache,
//   2. the iconservicesagent daemon — it keeps rendered bitmaps IN MEMORY and
//      serves a stale image until killed; launchd restarts it on demand.
// All user-level — no sudo required, and neither Finder nor the Dock is killed.
async function dropIconCaches() {
  const rm = async (p) => {
    if (!p) return
    await fsp.rm(p, { recursive: true, force: true }).catch(() => {})
  }
  // 1. Kill the renderer first: it rewrites its on-disk store from memory as it
  //    dies, so deleting the caches before it is gone resurrects stale icons.
  //    iconservicesagent ignores SIGTERM — only SIGKILL works.
  await runQuiet('/bin/killall', ['-9', 'iconservicesagent'])
  await runQuiet('/bin/killall', ['-9', 'iconservicesd'])
  // 2. Drop every user-level on-disk icon cache.
  await rm(path.join(os.homedir(), 'Library/Caches/com.apple.iconservices.store'))
  await rm(path.join(os.homedir(), 'Library/Caches/com.apple.iconservices'))
  const dirs = new Set()
  for (const cmd of ['getconf DARWIN_USER_DIR', 'getconf DARWIN_USER_CACHE_DIR']) {
    const dir = (await runQuiet('/bin/sh', ['-c', cmd]))?.trim()
    if (dir && dir.startsWith('/var/folders/')) dirs.add(dir)
  }
  for (const dir of dirs) {
    await rm(path.join(dir, 'C', 'com.apple.iconservices'))
    await rm(path.join(dir, 'C', 'com.apple.iconservicesagent'))
    await rm(path.join(dir, 'com.apple.iconservices'))
    await rm(path.join(dir, 'com.apple.iconservicesagent'))
  }
  return true
}

async function registerWithLaunchServices(appPath) {
  const lsregister = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
  const done = await runQuiet(lsregister, ['-f', appPath])
  return done !== undefined
}

// Refresh every surface that renders the app icon.
async function refreshIconSurfaces(appPath) {
  // 1. Bump the bundle mtime (FSEvents watchers key on it) and tell
  //    LaunchServices to re-read the bundle.
  const now = new Date()
  await fsp.utimes(appPath, now, now).catch(() => {})
  const registered = await registerWithLaunchServices(appPath)
  // 2. Throw away rendered-bitmap caches.
  await dropIconCaches()
  // 3. Finally let the Dock rebuild its icon cache — last, so it reads the
  //    fresh state. Falls back to a Dock relaunch only if the private
  //    notification is unavailable (future macOS).
  let dockCache = await refreshDockIconCache()
  let dockRestarted = false
  if (!dockCache) {
    dockRestarted = await restartDock()
    dockCache = dockRestarted
  }
  return { dockCache, dockRestarted, registered }
}

// ---- backup / restore ---------------------------------------------------

async function bundleIconReplaced(appPath) {
  // Ground truth for "did we replace the bundle's own icon": compare the icns
  // on disk with the byte-level backup. Copying the file back restores it.
  try {
    const [backup, current] = await Promise.all([
      fsp.readFile(path.join(BACKUP_DIR, 'Contents', 'Resources', 'icon.icns')),
      fsp.readFile(path.join(appPath, 'Contents', 'Resources', 'icon.icns')),
    ])
    return !backup.equals(current)
  } catch {
    return false
  }
}

async function backupOriginals(appPath) {
  const backupIcns = path.join(BACKUP_DIR, 'Contents', 'Resources', 'icon.icns')
  if (fs.existsSync(backupIcns)) return false // never overwrite the originals
  fs.rmSync(BACKUP_DIR, { recursive: true, force: true })
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  for (const rel of BACKUP_FILES) {
    const from = path.join(appPath, rel)
    if (!fs.existsSync(from)) continue
    const to = path.join(BACKUP_DIR, rel)
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.copyFileSync(from, to)
  }
  const execName = executableNameFor(appPath)
  const execFrom = path.join(appPath, 'Contents', 'MacOS', execName)
  const execTo = path.join(BACKUP_DIR, 'Contents', 'MacOS', execName)
  fs.mkdirSync(path.dirname(execTo), { recursive: true })
  fs.copyFileSync(execFrom, execTo)
  const codeRes = path.join(appPath, 'Contents', '_CodeSignature', 'CodeResources')
  if (fs.existsSync(codeRes)) {
    const codeTo = path.join(BACKUP_DIR, 'Contents', '_CodeSignature', 'CodeResources')
    fs.mkdirSync(path.dirname(codeTo), { recursive: true })
    fs.copyFileSync(codeRes, codeTo)
  }
  return true
}

function restoreOriginals(appPath) {
  // Byte-identical restore: original icns, png, executable and CodeResources
  // make the ORIGINAL Developer ID signature validate again.
  for (const rel of [...BACKUP_FILES, 'Contents/_CodeSignature/CodeResources']) {
    const from = path.join(BACKUP_DIR, rel)
    if (!fs.existsSync(from)) continue
    const to = path.join(appPath, rel)
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.copyFileSync(from, to)
  }
  const backupMacOS = path.join(BACKUP_DIR, 'Contents', 'MacOS')
  for (const execName of fs.existsSync(backupMacOS) ? fs.readdirSync(backupMacOS) : []) {
    const from = path.join(backupMacOS, execName)
    const to = path.join(appPath, 'Contents', 'MacOS', execName)
    if (fs.existsSync(from)) fs.copyFileSync(from, to)
  }
}

// ---- service ------------------------------------------------------------

function decodeIconDataUrl(pngDataUrl) {
  const match = typeof pngDataUrl === 'string' && pngDataUrl.match(/^data:image\/(png|webp);base64,/)
  if (!match) {
    throw new Error('any-icon: icon must be a data:image/png or data:image/webp base64 URL')
  }
  const base64 = pngDataUrl.slice(match[0].length)
  const approxBytes = Math.floor(base64.length * 3 / 4)
  if (approxBytes > MAX_PNG_BYTES) {
    throw new Error(`any-icon: icon image too large (${approxBytes} bytes, limit ${MAX_PNG_BYTES})`)
  }
  const buffer = Buffer.from(base64, 'base64')
  if (buffer.length < 12) {
    throw new Error('any-icon: decoded payload is too small to be an image')
  }
  const isPng = buffer.subarray(1, 4).toString('latin1') === 'PNG'
  const isWebp = buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  if (!isPng && !isWebp) {
    throw new Error('any-icon: decoded payload is neither PNG nor WebP')
  }
  return { buffer, format: isPng ? 'png' : 'webp' }
}

function mapWriteError(err, appPath) {
  if (err && (err.code === 'EPERM' || err.code === 'EACCES')) {
    const wrapped = new Error(
      `any-icon: macOS 拒绝写入应用包（App Management 权限）。请在 系统设置 → 隐私与安全性 → App 管理 中允许${appPath ? `「${path.basename(appPath, '.app')}」` : ' dsh 桌面端'}，然后重试。` +
      ` (macOS blocked writing the app bundle: grant App Management permission and retry)`,
    )
    wrapped.cause = err
    return wrapped
  }
  const detail = err && err.message ? err.message : String(err)
  if (/detritus not allowed/.test(detail)) {
    const wrapped = new Error(
      'any-icon: 应用包内仍有自定义图标残留，无法重新签名（codesign: resource fork / Finder information not allowed）。请先点「恢复原始图标」，再重新应用。' +
      ' (the bundle still carries a custom icon; reset it first, then apply again)',
    )
    wrapped.cause = err
    return wrapped
  }
  return err
}

function pgrepRunning() {
  return new Promise((resolve) => {
    execFile('/usr/bin/pgrep', ['-f', `${BUNDLE_ID}|DeepSeek Harness.app`], (err) => resolve(!err))
  })
}

export class AnyIconService {
  async getDshIconState(signal) {
    assertNotAborted(signal)
    const appPath = await findDshApp()
    const manifest = loadManifest()
    const bundleVersion = appPath ? await readBundleVersion(appPath) : undefined
    const versionMatches = !manifest.bundledVersion || manifest.bundledVersion === bundleVersion
    const customIcon = appPath ? await customIconPresent(appPath) : false
    // Only trust the manifest while the bundle version still matches the one
    // the backup belongs to; the icns bytes are the ground truth.
    const nativeIcon = Boolean(appPath && versionMatches && await bundleIconReplaced(appPath))
    const running = await pgrepRunning()
    return {
      ok: true,
      found: Boolean(appPath),
      appPath: appPath || '',
      customized: Boolean(nativeIcon || customIcon),
      running,
      customIcon,
      nativeIcon,
      bundleVersion: bundleVersion || '',
      signature: appPath ? await readSignature(appPath) : 'unknown',
      native: manifest.applied && versionMatches ? (manifest.native || 'done') : 'idle',
      nativeError: versionMatches ? (manifest.nativeError || '') : '',
    }
  }

  async applyDshIcon(pngDataUrl, signal) {
    const startedAt = Date.now()
    assertNotAborted(signal)
    if (process.platform !== 'darwin') {
      throw new Error('any-icon: replacing the dsh app icon is implemented for macOS only right now')
    }
    const appPath = await findDshApp()
    if (!appPath) throw new Error(`any-icon: dsh desktop app (${BUNDLE_ID}) not found in ${SEARCH_DIRS.join(', ')}`)

    const { buffer: imageBuffer, format } = decodeIconDataUrl(pngDataUrl)
    // Build the icns while the rest of the bundle prep runs (ten sips calls).
    const icnsPromise = buildIcns(imageBuffer)
    const pngBuffer = format === 'png' ? imageBuffer : await toPng(imageBuffer)

    const backupCreated = await backupOriginals(appPath)
    const manifest = loadManifest()
    if (backupCreated || !manifest.bundledVersion) {
      // First apply (or a manifest predating this field): pin the backup to the
      // bundle version it was taken from, so a later auto-update cannot be
      // "restored" back to an older binary.
      manifest.bundledVersion = await readBundleVersion(appPath)
      manifest.appPath = appPath
      saveManifest(manifest)
    }
    assertNotAborted(signal)

    const resourcesDir = path.join(appPath, 'Contents', 'Resources')
    const icnsPath = path.join(resourcesDir, 'icon.icns')
    const pngPath = path.join(resourcesDir, 'icon.png')

    let native = 'done'
    let nativeError = ''
    try {
      // codesign refuses a bundle that carries a custom icon, so the live layer
      // goes away before the bundle contents are touched and comes back after
      // the re-sign.
      await clearCustomIcon(appPath)
      const icnsBuffer = await icnsPromise
      await fsp.writeFile(icnsPath, icnsBuffer)
      if (fs.existsSync(pngPath)) await fsp.writeFile(pngPath, pngBuffer)
      assertNotAborted(signal)
      await resignAdHoc(appPath)
      await clearQuarantine(appPath)
    } catch (err) {
      native = 'failed'
      nativeError = mapWriteError(err, appPath).message
    }

    assertNotAborted(signal)

    // The live layer is what every surface reads first: write it last so the
    // user only ever sees the finished state, then refresh the caches.
    let live = false
    let liveError = ''
    try {
      live = await setCustomIconLive(appPath, pngBuffer)
    } catch (err) {
      liveError = mapWriteError(err, appPath).message
    }

    if (!live && native === 'failed') {
      // Nothing landed — surface the underlying reason (usually TCC).
      throw new Error(nativeError || liveError || 'any-icon: could not update the app icon')
    }

    const surfaces = await refreshIconSurfaces(appPath)

    manifest.applied = true
    manifest.appPath = appPath
    manifest.appliedAt = Date.now()
    manifest.native = native
    manifest.nativeError = nativeError || ''
    saveManifest(manifest)

    return {
      ok: true,
      appPath,
      method: 'icns+custom-icon',
      appliedAt: manifest.appliedAt,
      live,
      native,
      nativeError,
      dockRefreshed: surfaces.dockCache,
      elapsedMs: Date.now() - startedAt,
    }
  }

  async resetDshIcon(signal) {
    assertNotAborted(signal)
    if (process.platform !== 'darwin') {
      throw new Error('any-icon: resetting the dsh app icon is implemented for macOS only right now')
    }
    const appPath = await findDshApp()
    if (!appPath) throw new Error(`any-icon: dsh desktop app (${BUNDLE_ID}) not found`)
    const manifest = loadManifest()
    const backupIcns = path.join(BACKUP_DIR, 'Contents', 'Resources', 'icon.icns')
    const hadCustomIcon = await customIconPresent(appPath)
    const bundleVersion = await readBundleVersion(appPath)
    // A dsh auto-update swaps the whole bundle (and drops the icon change with
    // it). Restoring this bundle's own files from an older backup would
    // downgrade the app, so the byte-level restore only runs when the version
    // still matches the one the backup was taken from.
    const backupApplies = fs.existsSync(backupIcns) &&
      (!manifest.bundledVersion || !bundleVersion || manifest.bundledVersion === bundleVersion)

    if (!manifest.applied && !fs.existsSync(backupIcns) && !hadCustomIcon) {
      return { ok: true, appPath, removed: false, live: false, signature: await readSignature(appPath), dockRefreshed: false }
    }

    // Drop the live layer first: it blocks `codesign`, and it would otherwise
    // keep shadowing the restored icns on every surface.
    await clearCustomIcon(appPath)

    let removed = hadCustomIcon
    let signature = await readSignature(appPath)
    if (backupApplies) {
      try {
        restoreOriginals(appPath)
        removed = true
      } catch (err) {
        throw mapWriteError(err, appPath)
      }
      // The restored executable + CodeResources make the original seal valid
      // again; if the bundle had already drifted, keep it launchable with an
      // ad-hoc seal.
      if (!await verifySignature(appPath)) {
        try {
          await resignAdHoc(appPath)
          signature = 'adhoc'
        } catch { /* leave the bundle as restored */ }
      } else {
        signature = await readSignature(appPath)
      }
    } else if (!hadCustomIcon) {
      if (fs.existsSync(backupIcns)) {
        // Backup belongs to another bundle version: the running bundle already
        // carries its own icon again, so there is nothing to undo.
        return { ok: true, appPath, removed: false, live: false, signature, dockRefreshed: false }
      }
      throw new Error('any-icon: no backup found — cannot restore the original icon safely')
    }

    const surfaces = await refreshIconSurfaces(appPath)
    manifest.applied = false
    manifest.appPath = appPath
    manifest.appliedAt = undefined
    manifest.native = undefined
    manifest.nativeError = ''
    saveManifest(manifest)
    return {
      ok: true,
      appPath,
      removed,
      live: false,
      signature,
      dockRefreshed: surfaces.dockCache,
    }
  }
}

export const name = 'any-icon'

export function apply(ctx) {
  const service = new AnyIconService()
  service.typertRemote = Object.freeze({ service, serviceKey: 'anyIcon', namespace: 'anyIcon' })
  ctx.provide('anyIcon', service)
  ctx.effect(() => () => {
    // Disposer runs on plugin stop/update/undefine; on-disk state survives so
    // reset keeps working across restarts.
  }, 'any-icon.mounted')
}
