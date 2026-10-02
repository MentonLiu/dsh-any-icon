// Host-face Typert reflection for dsh-any-icon.
//
// Auto-discovered by @deepseek-ai/dsh-typert-loader through the package's
// "./typert" export; validates against the loader's manifest contract.
import { bridge } from './remote.js'

const APPLY_DOC = 'Apply a cropped PNG as the dsh desktop app icon: write Contents/Resources/icon.icns, re-sign the bundle ad-hoc, then set the live Finder custom icon and refresh the icon caches so Finder / the Apps view / the Dock all update immediately (no app restart). The original icon is backed up for reset.'
const RESET_DOC = 'Restore the original dsh app icon: drop the live custom icon, put the byte-level backup of icon.icns / icon.png / the executable / CodeResources back, re-verify the signature and refresh the icon caches.'
const STATE_DOC = 'Report whether the dsh desktop app was found, whether any-icon currently customizes its icon (live custom icon and/or replaced icns), the bundle signature kind, and whether the app is running.'

export const TYPERT = {
  package: 'dsh-any-icon',
  face: 'host',
  schemas: [
    { name: 'PngDataUrl', create: () => bridge.schemas.PngDataUrl },
    { name: 'ApplyResult', create: () => bridge.schemas.ApplyResult },
    { name: 'ResetResult', create: () => bridge.schemas.ResetResult },
    { name: 'IconState', create: () => bridge.schemas.IconState },
  ],
  invocations: bridge.descriptors,
  model: {
    services: [{
      key: 'anyIcon',
      exportName: 'AnyIconService',
      description: 'Customize the dsh desktop app own icon: apply a cropped PNG (bundle icns + live Finder custom icon + cache refresh), restore the original, and query state. Triggered only from the any-icon workshop panel.',
      summary: 'dsh app icon customization',
      tags: [],
      members: [
        { kind: 'method', name: 'applyDshIcon', signature: 'applyDshIcon(pngDataUrl: string, signal?: AbortSignal): Promise<{ ok: true; appPath: string; method: string; appliedAt: number; live: boolean; native: string; nativeError: string; dockRefreshed: boolean; elapsedMs: number }>', description: APPLY_DOC },
        { kind: 'method', name: 'resetDshIcon', signature: 'resetDshIcon(signal?: AbortSignal): Promise<{ ok: true; appPath: string; removed: boolean; live: boolean; signature: string; dockRefreshed: boolean }>', description: RESET_DOC },
        { kind: 'method', name: 'getDshIconState', signature: 'getDshIconState(signal?: AbortSignal): Promise<{ ok: true; found: boolean; appPath: string; customized: boolean; running: boolean; customIcon: boolean; nativeIcon: boolean; signature: string; native: string; nativeError: string }>', description: STATE_DOC },
      ],
      types: [],
    }],
    events: [],
    objects: [],
  },
}

export default TYPERT
