// Host bridge re-export: one place the Host half imports the shared contract from.
import ZOD from './zod.esm.js'
import { makeBridge } from '../shared/bridge.js'

export const bridge = makeBridge(ZOD)
export const TYPERT_REMOTE = bridge.TYPERT_REMOTE
export const descriptors = bridge.descriptors
export const schemas = bridge.schemas
