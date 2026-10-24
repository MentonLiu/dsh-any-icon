// The anyIcon Remote contract — single source of truth shared by both halves.
//
// The Host imports this module directly; tools/build-client.mjs bundles it
// (together with zod) into the client half. `makeBridge` receives the zod v4
// module namespace so both faces use one schema/descriptor definition.
//
// App icons are applied only through NSWorkspace's Finder custom-icon API.
// The signed app bundle contents remain untouched, preserving updater
// signature validation.

export function makeBridge(ZOD) {
  const { z } = ZOD;

  // ---- wire schemas -------------------------------------------------
  // Masters are data URLs produced by the client canvas; Chromium exports
  // WebP, WebKit falls back to PNG — both are accepted (sips reads either).
  const IconDataUrl = z.string().regex(/^data:image\/(?:png|webp);base64,[A-Za-z0-9+/=\r\n]+$/, 'must be a base64 PNG or WebP data URL');
  const PngDataUrl = IconDataUrl;
  const ApplyResult = z.object({
    ok: z.literal(true),
    appPath: z.string(),
    method: z.string(),
    appliedAt: z.number(),
    live: z.boolean(),
    dockRefreshed: z.boolean(),
    elapsedMs: z.number(),
  });
  const ResetResult = z.object({
    ok: z.literal(true),
    appPath: z.string(),
    removed: z.boolean(),
    live: z.boolean(),
    signature: z.string(),
    signatureRepairRequired: z.boolean(),
    dockRefreshed: z.boolean(),
  });
  const IconState = z.object({
    ok: z.literal(true),
    found: z.boolean(),
    appPath: z.string(),
    customized: z.boolean(),
    running: z.boolean(),
    // Live Finder custom icon — what Finder / the Apps view / the Dock read first.
    customIcon: z.boolean(),
    // CFBundleShortVersionString of the app bundle that is on disk right now.
    bundleVersion: z.string(),
    // 'adhoc' | 'developer-id' | 'signed' | 'unsigned' | 'unknown'
    signature: z.string(),
    signatureRepairRequired: z.boolean(),
    signatureRepairAvailable: z.boolean(),
  });

  function strictCodec(typeSymbol, schema) {
    return { mode: 'strict', typeSymbol, create: () => schema };
  }

  function jsonParam(name, typeSymbol, schema) {
    return { name, wire: name, source: 'json', codec: strictCodec(typeSymbol, schema) };
  }

  // ---- invocation descriptors (positional args on the client proxy) --
  const APPLY_DESCRIPTOR = {
    id: 'dsh-any-icon#anyIcon/applyDshIcon',
    service: 'anyIcon',
    namespace: 'anyIcon',
    method: 'applyDshIcon',
    invocation: { kind: 'direct' },
    parameters: [
      jsonParam('pngDataUrl', 'dsh-any-icon#PngDataUrl', PngDataUrl),
    ],
    cancellation: { parameter: 'signal' },
    result: strictCodec('dsh-any-icon#ApplyResult', ApplyResult),
  };

  const RESET_DESCRIPTOR = {
    id: 'dsh-any-icon#anyIcon/resetDshIcon',
    service: 'anyIcon',
    namespace: 'anyIcon',
    method: 'resetDshIcon',
    invocation: { kind: 'direct' },
    parameters: [],
    cancellation: { parameter: 'signal' },
    result: strictCodec('dsh-any-icon#ResetResult', ResetResult),
  };

  const STATE_DESCRIPTOR = {
    id: 'dsh-any-icon#anyIcon/getDshIconState',
    service: 'anyIcon',
    namespace: 'anyIcon',
    method: 'getDshIconState',
    invocation: { kind: 'direct' },
    parameters: [],
    cancellation: { parameter: 'signal' },
    result: strictCodec('dsh-any-icon#IconState', IconState),
  };

  const TYPERT_REMOTE = {
    package: 'dsh-any-icon',
    descriptors: [APPLY_DESCRIPTOR, RESET_DESCRIPTOR, STATE_DESCRIPTOR],
  };

  return {
    z,
    schemas: { PngDataUrl, ApplyResult, ResetResult, IconState },
    descriptors: [APPLY_DESCRIPTOR, RESET_DESCRIPTOR, STATE_DESCRIPTOR],
    TYPERT_REMOTE,
  };
}
