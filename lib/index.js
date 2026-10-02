// Host half of dsh-any-icon.
//
// Provides the `anyIcon` Remote service. v2.1 scope: the App-icon feature
// targets ONLY the dsh desktop app itself. The mechanism is the native one —
// replace <app>/Contents/Resources/icon.icns with an icns generated from the
// cropped PNG, then re-sign the bundle ad-hoc and bounce the Dock. This rides
// the real icon pipeline, so Finder/Dock/Launchpad all pick it up (unlike the
// legacy NSWorkspace custom-icon path, which macOS 26 no longer honors for
// apps).
//
// Byte-level reversibility: the first apply backs up icon.icns, icon.png, the
// main executable (which carries the embedded original signature) and
// _CodeSignature/CodeResources into ~/.dsh/any-icon/backup/. Restoring those
// four files makes the ORIGINAL Developer ID signature valid again.
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

async function run(file, args) {
  const { stdout } = await execFileAsync(file, args)
  return stdout
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
  for (const [name, edge] of sizes) {
    await run('/usr/bin/sips', ['-s', 'format', 'png', '-z', String(edge), String(edge), src, '--out', path.join(iconset, name)])
  }
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
  await new Promise((resolve) => {
    execFile('/usr/bin/xattr', ['-d', 'com.apple.quarantine', appPath], () => resolve())
  })
}

// macOS caches rendered app icons aggressively; a replaced icns stays
// invisible until every layer is dropped:
//   1. the on-disk iconservices store + the Dock's own iconcache,
//   2. the iconservicesagent daemon — it keeps rendered bitmaps IN MEMORY
//      and serves a stale image (one apply behind!) until killed; launchd
//      restarts it on demand,
//   3. the Dock/Finder processes themselves.
// All user-level — no sudo required.
async function bustIconCaches(appPath) {
  const rm = async (p) => {
    if (!p) return
    await fsp.rm(p, { recursive: true, force: true }).catch(() => {})
  }
  await rm(path.join(os.homedir(), 'Library/Caches/com.apple.iconservices.store'))
  await rm(path.join(os.homedir(), 'Library/Caches/com.apple.iconservices'))
  const dirs = new Set()
  for (const cmd of ['getconf DARWIN_USER_DIR', 'getconf DARWIN_USER_CACHE_DIR']) {
    try {
      const dir = (await run('/bin/sh', ['-c', cmd])).trim()
      if (dir.startsWith('/var/folders/')) dirs.add(dir)
    } catch { /* skip */ }
  }
  for (const dir of dirs) {
    await rm(path.join(dir, 'C', 'com.apple.dock.iconcache'))
    await rm(path.join(dir, 'C', 'com.apple.iconservices'))
    await rm(path.join(dir, 'C', 'com.apple.iconservicesagent'))
  }
  // The daemon holds stale renders in memory — killing it is what actually
  // un-sticks the Dock (a bare cache delete + Dock restart stays one apply
  // behind). launchd relaunches it on the next icon request.
  for (const target of ['iconservicesagent', 'iconservicesd']) {
    await new Promise((resolve) => {
      execFile('/bin/killall', [target], () => resolve())
    })
  }
  // Re-register the bundle so LaunchServices re-reads its metadata.
  await run('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', appPath]).catch(() => {})
  for (const target of ['Dock', 'Finder']) {
    await new Promise((resolve) => {
      execFile('/bin/killall', [target], () => resolve())
    })
  }
}

// Schedule a fully detached immediate restart: the Dock shows a running
// app's launch-time icon, so the only way to make the change visible in
// real time is to bounce the app. The watcher survives the harness dying.
function scheduleImmediateRestart(appPath) {
  const execName = path.basename(appPath, '.app')
  const script = [
    'sleep 2',
    `/usr/bin/pkill -x ${JSON.stringify(execName)} 2>/dev/null || true`,
    'sleep 3',
    `/usr/bin/open ${JSON.stringify(appPath)}`,
  ].join('; ')
  const child = execFile('/bin/sh', ['-c', script], { detached: true }, () => {})
  child.unref()
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
  return err
}

export class AnyIconService {
  async getDshIconState(signal) {
    assertNotAborted(signal)
    const appPath = await findDshApp()
    const manifest = loadManifest()
    const icnsPath = appPath ? path.join(appPath, 'Contents', 'Resources', 'icon.icns') : undefined
    const customized = Boolean(appPath && manifest.applied && manifest.appPath === appPath && fs.existsSync(icnsPath))
    const running = await new Promise((resolve) => {
      execFile('/usr/bin/pgrep', ['-f', `${BUNDLE_ID}|DeepSeek Harness.app`], (err) => resolve(!err))
    })
    return { ok: true, found: Boolean(appPath), appPath: appPath || '', customized, running }
  }

  async applyDshIcon(pngDataUrl, signal) {
    assertNotAborted(signal)
    if (process.platform !== 'darwin') {
      throw new Error('any-icon: replacing the dsh app icon is implemented for macOS only right now')
    }
    const appPath = await findDshApp()
    if (!appPath) throw new Error(`any-icon: dsh desktop app (${BUNDLE_ID}) not found in ${SEARCH_DIRS.join(', ')}`)

    const { buffer: imageBuffer, format } = decodeIconDataUrl(pngDataUrl)
    const icnsBuffer = await buildIcns(imageBuffer)
    const pngBuffer = format === 'png' ? imageBuffer : await toPng(imageBuffer)
    assertNotAborted(signal)

    const manifest = loadManifest()
    const resourcesDir = path.join(appPath, 'Contents', 'Resources')
    const icnsPath = path.join(resourcesDir, 'icon.icns')
    const pngPath = path.join(resourcesDir, 'icon.png')

    // First apply: byte-level backup of everything whose loss could not be
    // undone by copying files back (the executable carries the original
    // embedded signature). NEVER re-backup over the originals on later
    // applies — that would destroy the restore path.
    const backupIcns = path.join(BACKUP_DIR, 'Contents', 'Resources', 'icon.icns')
    if (!fs.existsSync(backupIcns)) {
      fs.rmSync(BACKUP_DIR, { recursive: true, force: true })
      fs.mkdirSync(BACKUP_DIR, { recursive: true })
      const execName = executableNameFor(appPath)
      for (const rel of BACKUP_FILES) {
        const from = path.join(appPath, rel)
        if (fs.existsSync(from)) {
          const to = path.join(BACKUP_DIR, rel)
          fs.mkdirSync(path.dirname(to), { recursive: true })
          fs.copyFileSync(from, to)
        }
      }
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
    }

    assertNotAborted(signal)
    try {
      await fsp.writeFile(icnsPath, icnsBuffer)
      if (fs.existsSync(pngPath)) await fsp.writeFile(pngPath, pngBuffer)

      assertNotAborted(signal)
      await resignAdHoc(appPath)
    } catch (err) {
      throw mapWriteError(err, appPath)
    }
    await clearQuarantine(appPath)
    await bustIconCaches(appPath)
    scheduleImmediateRestart(appPath)

    manifest.applied = true
    manifest.appPath = appPath
    manifest.appliedAt = Date.now()
    saveManifest(manifest)
    return { ok: true, appPath, method: 'icns-replace', appliedAt: manifest.appliedAt }
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
    if (!manifest.applied && !fs.existsSync(backupIcns)) {
      return { ok: true, appPath, removed: false }
    }
    if (!fs.existsSync(backupIcns)) {
      throw new Error('any-icon: no backup found — cannot restore the original icon safely')
    }
    assertNotAborted(signal)
    try {
      // Byte-identical restore: original icns, png, executable and CodeResources
      // make the ORIGINAL Developer ID signature validate again.
      for (const rel of [...BACKUP_FILES, 'Contents/_CodeSignature/CodeResources']) {
        const from = path.join(BACKUP_DIR, rel)
        if (!fs.existsSync(from)) continue
        const to = path.join(appPath, rel)
        fs.mkdirSync(path.dirname(to), { recursive: true })
        fs.copyFileSync(from, to)
      }
      const backupEntries = fs.existsSync(path.join(BACKUP_DIR, 'Contents', 'MacOS'))
        ? fs.readdirSync(path.join(BACKUP_DIR, 'Contents', 'MacOS'))
        : []
      for (const execName of backupEntries) {
        const from = path.join(BACKUP_DIR, 'Contents', 'MacOS', execName)
        const to = path.join(appPath, 'Contents', 'MacOS', execName)
        if (fs.existsSync(from)) fs.copyFileSync(from, to)
      }
    } catch (err) {
      throw mapWriteError(err, appPath)
    }
    await execFileAsync('/usr/bin/codesign', ['--verify', appPath]).catch(async () => {
      // If the original seal still does not validate (e.g. pre-existing
      // drift), fall back to an ad-hoc seal so the app keeps launching.
      await resignAdHoc(appPath)
    })
    await bustIconCaches(appPath)
    manifest.applied = false
    manifest.appPath = appPath
    manifest.appliedAt = undefined
    saveManifest(manifest)
    return { ok: true, appPath, removed: true }
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
