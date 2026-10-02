// Host-face Typert reflection for dsh-any-icon.
//
// Auto-discovered by @deepseek-ai/dsh-typert-loader through the package's
// "./typert" export; validates against the loader's manifest contract.
import { bridge } from './remote.js'

const APPLY_DOC = 'Replace the dsh desktop app bundle icon (Contents/Resources/icon.icns) with a cropped PNG, re-sign the bundle ad-hoc and refresh the Dock. The original icon is backed up for reset.'
const RESET_DOC = 'Restore the original dsh app icon from the byte-level backup taken by applyDshIcon and refresh the Dock.'
const STATE_DOC = 'Report whether the dsh desktop app was found, whether any-icon currently customizes its icon, and whether the app is running.'

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
      description: 'Customize the dsh desktop app own icon: apply a cropped PNG as the bundle icon (icns replace + ad-hoc re-sign), restore the original, and query state. Triggered only from the any-icon workshop panel.',
      summary: 'dsh app icon customization',
      tags: [],
      members: [
        { kind: 'method', name: 'applyDshIcon', signature: 'applyDshIcon(pngDataUrl: string, signal?: AbortSignal): Promise<{ ok: true; appPath: string; method: "icns-replace"; appliedAt: number }>', description: APPLY_DOC },
        { kind: 'method', name: 'resetDshIcon', signature: 'resetDshIcon(signal?: AbortSignal): Promise<{ ok: true; appPath: string; removed: boolean }>', description: RESET_DOC },
        { kind: 'method', name: 'getDshIconState', signature: 'getDshIconState(signal?: AbortSignal): Promise<{ ok: true; found: boolean; appPath: string; customized: boolean; running: boolean }>', description: STATE_DOC },
      ],
      types: [],
    }],
    events: [],
    objects: [],
  },
}

export default TYPERT
