// Host half of dsh-any-icon.
//
// Provides the `anyIcon` Remote service. App icons are set only through
// NSWorkspace's Finder custom-icon mechanism (`Icon\r` + FinderInfo at the
// bundle root). Applying a new icon never modifies the signed Contents/ tree
// or re-signs dsh. A one-time migration can restore exact-version files from
// an older plugin backup to repair its previous signature change.
//
// macOS caches rendered icons in three places: iconservices and the Dock's
// icon cache. We clear those caches, re-register the bundle with LaunchServices,
// and ask the Dock to rebuild its icon cache. No app relaunch is needed.
//
// The reset path retains migration support for backups created by older
// dsh-any-icon versions. It restores those files only when the backed-up app
// version exactly matches the installed version; it never downgrades dsh.
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
// Bundle-root custom icon (classic Finder custom icon: the data fork is empty,
// the image lives in the com.apple.ResourceFork extended attribute).
const ICON_FILE_NAME = 'Icon\r'
const RESOURCE_FORK_XATTR = 'com.apple.ResourceFork'
const FINDER_INFO_XATTR = 'com.apple.FinderInfo'
// kHasCustomIcon lives in the Finder flags word (FinderInfo bytes 8-9).
const HAS_CUSTOM_ICON_BYTE = 8
const HAS_CUSTOM_ICON_MASK = 0x04

const XATTR_MAX_BUFFER = 64 * 1024 * 1024

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

async function toPng(sourceBuffer) {
  // Normalize any accepted master to PNG before passing it to NSImage.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-any-icon-'))
  const src = path.join(work, 'master')
  const out = path.join(work, 'master.png')
  await fsp.writeFile(src, sourceBuffer)
  await run('/usr/bin/sips', ['-s', 'format', 'png', src, '--out', out])
  const png = await fsp.readFile(out)
  await fsp.rm(work, { recursive: true, force: true })
  return png
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

// macOS caches rendered app icons aggressively; a new custom icon may stay
// invisible until every layer is dropped:
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

function restoreOriginals(appPath) {
  // Byte-identical restore for backups created by older plugin releases.
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

function hasMatchingLegacyBackup(manifest, bundleVersion) {
  if (!manifest.bundledVersion || manifest.bundledVersion !== bundleVersion) return false
  if (manifest.native !== 'done' && manifest.native !== 'failed') return false
  const backupMacOS = path.join(BACKUP_DIR, 'Contents', 'MacOS')
  return fs.existsSync(path.join(BACKUP_DIR, 'Contents', 'Resources', 'icon.icns')) &&
    fs.existsSync(path.join(BACKUP_DIR, 'Contents', '_CodeSignature', 'CodeResources')) &&
    fs.existsSync(backupMacOS) && fs.readdirSync(backupMacOS).length > 0
}

async function restoreLegacyBundleIfSafe(appPath, manifest, bundleVersion) {
  const signature = await readSignature(appPath)
  if ((signature !== 'adhoc' && await verifySignature(appPath)) || !hasMatchingLegacyBackup(manifest, bundleVersion)) return false

  // Only undo files the old plugin changed when its backup is for this exact
  // installed app version. Never use an older backup to replace a newer app.
  await clearCustomIcon(appPath)
  restoreOriginals(appPath)
  if (!await verifySignature(appPath)) {
    throw new Error('any-icon: restored the saved app files, but dsh\'s original signature still does not validate. Reinstall the current official dsh version to repair it.')
  }
  manifest.native = 'restored'
  manifest.nativeError = ''
  return true
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
      `any-icon: macOS 拒绝设置应用自定义图标（App Management 权限）。请在 系统设置 → 隐私与安全性 → App 管理 中允许${appPath ? `「${path.basename(appPath, '.app')}」` : ' dsh 桌面端'}，然后重试。` +
      ` (macOS blocked setting the custom app icon: grant App Management permission and retry)`,
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
    const customIcon = appPath ? await customIconPresent(appPath) : false
    const running = await pgrepRunning()
    const signature = appPath ? await readSignature(appPath) : 'unknown'
    const signatureValid = Boolean(appPath && await verifySignature(appPath))
    const signatureRepairRequired = Boolean(appPath && (signature === 'adhoc' || !signatureValid))
    return {
      ok: true,
      found: Boolean(appPath),
      appPath: appPath || '',
      customized: customIcon,
      running,
      customIcon,
      bundleVersion: bundleVersion || '',
      signature,
      signatureRepairRequired,
      signatureRepairAvailable: Boolean(signatureRepairRequired && hasMatchingLegacyBackup(manifest, bundleVersion)),
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
    const pngBuffer = format === 'png' ? imageBuffer : await toPng(imageBuffer)

    const manifest = loadManifest()
    const bundleVersion = await readBundleVersion(appPath)
    assertNotAborted(signal)

    // Migrate safely if an older plugin release ad-hoc signed this exact dsh
    // version and its byte-level original backup is available.
    await restoreLegacyBundleIfSafe(appPath, manifest, bundleVersion)
    assertNotAborted(signal)

    let live
    try {
      live = await setCustomIconLive(appPath, pngBuffer)
    } catch (err) {
      throw mapWriteError(err, appPath)
    }
    if (!live) throw new Error('any-icon: Finder did not save the custom app icon')

    const surfaces = await refreshIconSurfaces(appPath)

    manifest.applied = true
    manifest.appPath = appPath
    manifest.appliedAt = Date.now()
    saveManifest(manifest)

    return {
      ok: true,
      appPath,
      method: 'finder-custom-icon',
      appliedAt: manifest.appliedAt,
      live,
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
    const backupApplies = fs.existsSync(backupIcns) && hasMatchingLegacyBackup(manifest, bundleVersion)

    if (!manifest.applied && !hadCustomIcon && !backupApplies) {
      const signature = await readSignature(appPath)
      const signatureValid = await verifySignature(appPath)
      return {
        ok: true, appPath, removed: false, live: false, signature,
        signatureRepairRequired: signature === 'adhoc' || !signatureValid, dockRefreshed: false,
      }
    }

    // Remove the Finder override before restoring files from an older plugin.
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
      signature = await readSignature(appPath)
    }

    const surfaces = await refreshIconSurfaces(appPath)
    manifest.applied = false
    manifest.appPath = appPath
    manifest.appliedAt = undefined
    if (backupApplies) {
      manifest.native = 'restored'
      manifest.nativeError = ''
    }
    saveManifest(manifest)
    return {
      ok: true,
      appPath,
      removed,
      live: false,
      signature,
      signatureRepairRequired: signature === 'adhoc' || !await verifySignature(appPath),
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
