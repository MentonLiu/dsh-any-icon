// Build script for dsh-any-icon generated artifacts.
//
//   node tools/build-client.mjs
//
// Produces:
//   lib/zod.esm.js              — ESM zod v4 bundle for the Host half
//   src/generated/bridge.iife.js — minified IIFE exposing __DAI_BRIDGE__ for the client half
//   src/generated/squircle.iife.js — minified IIFE exposing __DAI_SQUIRCLE__ (macOS icon geometry)
//   client/client.js            — assembled client module (loader wrapper + bridge + squircle + main)
//
// Requires network for `npx esbuild` on first run; the outputs are committed so
// consumers of the linked package never need to build.

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// esbuild ships a native binary in node_modules (devDependency).
const ESBUILD = [join(root, 'node_modules', 'esbuild', 'bin', 'esbuild')]
// zod is vendored into the committed artifacts; the build resolves it from the
// repo's devDependencies. ZOD_ALIAS overrides for unusual setups.
const ZOD_ALIAS = process.env.ZOD_ALIAS || undefined
const ALIAS = ZOD_ALIAS ? ['--alias:zod=' + ZOD_ALIAS] : []

function run(args, cwd = root) {
  execFileSync(ESBUILD[0], [...ESBUILD.slice(1), ...ALIAS, ...args], { cwd, stdio: 'inherit' })
}

// 1) Host-face zod bundle (ESM).
writeFileSync(join(root, 'tools', 'zod-entry.js'), `import * as zod from 'zod/v4';\nexport default zod;\nexport const { z } = zod;\n`)
run(['tools/zod-entry.js', '--bundle', '--format=esm', '--outfile=lib/zod.esm.js'])

// 2) Client-face bridge bundle (IIFE, exposes window.__DAI_BRIDGE__ = { bridge }).
run([
  'tools/client-bridge-entry.js',
  '--bundle', '--format=iife', '--global-name=__DAI_BRIDGE__', '--minify',
  '--outfile=src/generated/bridge.iife.js',
])

// 2b) Squircle geometry (IIFE, exposes window.__DAI_SQUIRCLE__ = { MAC_ICON_SPEC, … }).
run([
  'shared/squircle.js',
  '--bundle', '--format=iife', '--global-name=__DAI_SQUIRCLE__', '--minify',
  '--outfile=src/generated/squircle.iife.js',
])

// 3) Assemble the client module.
const header = `// dsh-any-icon — client half (ASSEMBLED by tools/build-client.mjs; edit src/client/main.js, not this file).
`
const bridge = readFileSync(join(root, 'src/generated/bridge.iife.js'), 'utf8')
const squircle = readFileSync(join(root, 'src/generated/squircle.iife.js'), 'utf8')
const main = readFileSync(join(root, 'src/client/main.js'), 'utf8')
const assembled = header + 'window.__ModuleLoader__.load({\n  id: "dsh-any-icon",\n  factory: (require) => {\n    var module = { exports: {} };\n    var exports = module.exports;\n' + bridge + '\n' + squircle + '\n' + main + '\n    return module.exports;\n  }\n});\n'
writeFileSync(join(root, 'client/client.js'), assembled)
console.log('build complete: lib/zod.esm.js, src/generated/bridge.iife.js, src/generated/squircle.iife.js, client/client.js')
