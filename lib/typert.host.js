// Host-face Typert reflection for dsh-any-icon.
//
// Auto-discovered by @deepseek-ai/dsh-typert-loader through the package's
// "./typert" export; validates against the loader's manifest contract.
import { bridge } from './remote.js'

const APPLY_DOC = 'Apply a cropped PNG as the dsh desktop app Finder custom icon and refresh icon caches. The signed app bundle contents are left untouched, preserving updater signature validation.'
const RESET_DOC = 'Remove the Finder custom icon and refresh icon caches. For older plugin backups, restore signed app files only when the saved dsh version exactly matches the installed version.'
const STATE_DOC = 'Report whether dsh was found, whether a Finder custom icon is set, the app signature and version, whether the signature needs repair, and whether a matching legacy backup can restore it.'

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
      description: 'Customize the dsh desktop app Finder icon without modifying its signed bundle, restore the original Finder icon, and query signature state. Triggered only from the any-icon workshop panel.',
      summary: 'dsh app icon customization',
      tags: [],
      members: [
        { kind: 'method', name: 'applyDshIcon', signature: 'applyDshIcon(pngDataUrl: string, signal?: AbortSignal): Promise<{ ok: true; appPath: string; method: string; appliedAt: number; live: boolean; dockRefreshed: boolean; elapsedMs: number }>', description: APPLY_DOC },
        { kind: 'method', name: 'resetDshIcon', signature: 'resetDshIcon(signal?: AbortSignal): Promise<{ ok: true; appPath: string; removed: boolean; live: boolean; signature: string; signatureRepairRequired: boolean; dockRefreshed: boolean }>', description: RESET_DOC },
        { kind: 'method', name: 'getDshIconState', signature: 'getDshIconState(signal?: AbortSignal): Promise<{ ok: true; found: boolean; appPath: string; customized: boolean; running: boolean; customIcon: boolean; bundleVersion: string; signature: string; signatureRepairRequired: boolean; signatureRepairAvailable: boolean }>', description: STATE_DOC },
      ],
      types: [],
    }],
    events: [],
    objects: [],
  },
}

export default TYPERT
