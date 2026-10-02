// The anyIcon Remote contract — single source of truth shared by both halves.
//
// The Host imports this module directly; tools/build-client.mjs bundles it
// (together with zod) into the client half. `makeBridge` receives the zod v4
// module namespace so both faces use one schema/descriptor definition.
//
// Field shapes mirror the first-party generated descriptors (see
// @deepseek-ai/dsh-api-remotes client bundle) and the loader-validated
// manifest contract (see @deepseek-ai/dsh-typert-loader).

export function makeBridge(ZOD) {
  const { z } = ZOD;

  // ---- wire schemas -------------------------------------------------
  const AppPath = z.string().min(1).max(1024);
  const PngDataUrl = z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/=\r\n]+$/, 'must be a base64 PNG data URL');
  const ApplyResult = z.object({
    ok: z.literal(true),
    appPath: z.string(),
    method: z.string(),
    appliedAt: z.number(),
  });
  const ResetResult = z.object({
    ok: z.literal(true),
    appPath: z.string(),
    removed: z.boolean(),
  });
  const AppInfo = z.object({ name: z.string(), path: z.string() });
  const ListAppsResult = z.object({
    platform: z.string(),
    supported: z.boolean(),
    apps: z.array(AppInfo),
  });

  function strictCodec(typeSymbol, schema) {
    return { mode: 'strict', typeSymbol, create: () => schema };
  }

  function jsonParam(name, typeSymbol, schema) {
    return { name, wire: name, source: 'json', codec: strictCodec(typeSymbol, schema) };
  }

  // ---- invocation descriptors ---------------------------------------
  const APPLY_DESCRIPTOR = {
    id: 'dsh-any-icon#anyIcon/applyAppIcon',
    service: 'anyIcon',
    namespace: 'anyIcon',
    method: 'applyAppIcon',
    invocation: { kind: 'direct' },
    parameters: [
      jsonParam('appPath', 'dsh-any-icon#AppPath', AppPath),
      jsonParam('pngDataUrl', 'dsh-any-icon#PngDataUrl', PngDataUrl),
    ],
    cancellation: { parameter: 'signal' },
    result: strictCodec('dsh-any-icon#ApplyResult', ApplyResult),
  };

  const RESET_DESCRIPTOR = {
    id: 'dsh-any-icon#anyIcon/resetAppIcon',
    service: 'anyIcon',
    namespace: 'anyIcon',
    method: 'resetAppIcon',
    invocation: { kind: 'direct' },
    parameters: [
      jsonParam('appPath', 'dsh-any-icon#AppPath', AppPath),
    ],
    cancellation: { parameter: 'signal' },
    result: strictCodec('dsh-any-icon#ResetResult', ResetResult),
  };

  const LISTAPPS_DESCRIPTOR = {
    id: 'dsh-any-icon#anyIcon/listApps',
    service: 'anyIcon',
    namespace: 'anyIcon',
    method: 'listApps',
    invocation: { kind: 'direct' },
    parameters: [],
    cancellation: { parameter: 'signal' },
    result: strictCodec('dsh-any-icon#ListAppsResult', ListAppsResult),
  };

  const TYPERT_REMOTE = {
    package: 'dsh-any-icon',
    descriptors: [APPLY_DESCRIPTOR, RESET_DESCRIPTOR, LISTAPPS_DESCRIPTOR],
  };

  return {
    z,
    schemas: { AppPath, PngDataUrl, ApplyResult, ResetResult, AppInfo, ListAppsResult },
    descriptors: [APPLY_DESCRIPTOR, RESET_DESCRIPTOR, LISTAPPS_DESCRIPTOR],
    TYPERT_REMOTE,
  };
}
