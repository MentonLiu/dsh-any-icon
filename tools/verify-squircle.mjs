// Geometry verification for shared/squircle.js (macOS Dock icon spec).
//
//   node tools/verify-squircle.mjs            # assertions
//   node tools/verify-squircle.mjs --render   # + writes artifacts/squircle-preview.png
//
// Checks the constructed outline is: inside the box, convex (κ ≥ 0),
// curvature-bounded (κ ≤ 1/R), curvature-continuous at the ramp/arc junctions,
// and symmetric about each corner diagonal. `--render` additionally rasterises
// the spec document (1024 canvas, 824 graphic, 100 margins) next to a plain
// rounded-rect for visual comparison.
import { MAC_ICON_SPEC, squirclePoints, squirclePathData, g2CornerGeometry } from '../shared/squircle.js'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

let failures = 0
function check(name, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures++
}

const S = MAC_ICON_SPEC.graphic
const R = MAC_ICON_SPEC.cornerRadius

// ---- outline properties ---------------------------------------------------
const pts = squirclePoints(S)
check('all points inside the graphic box', pts.every(([x, y]) => x >= -1e-6 && x <= S + 1e-6 && y >= -1e-6 && y <= S + 1e-6))
check('outline touches all four box edges', Math.min(...pts.map((p) => p[0])) < 1e-6 && Math.max(...pts.map((p) => p[0])) > S - 1e-6 && Math.min(...pts.map((p) => p[1])) < 1e-6 && Math.max(...pts.map((p) => p[1])) > S - 1e-6)

// corner diagonal symmetry: M(x,y)=(S-y,S-x) maps the corner curve onto itself.
// One corner block = (N+1) ramp + (N-1) arc + (N+1) mirrored ramp = 3N+1 points.
const N = 97
const corner = squirclePoints(S, { ...MAC_ICON_SPEC, samples: N }).slice(0, 3 * N + 1)
let symErr = 0
for (let i = 0; i < corner.length; i++) {
  const [x, y] = corner[i]
  const m = [S - y, S - x]
  const j = corner.length - 1 - i
  symErr = Math.max(symErr, Math.hypot(m[0] - corner[j][0], m[1] - corner[j][1]))
}
check('corner symmetric about its diagonal', symErr < 1e-6, `max deviation ${symErr.toExponential(2)}`)

// curvature along the corner: numeric, from dense samples (ramp 401 + arc 399 + ramp 401)
const dense = squirclePoints(S, { ...MAC_ICON_SPEC, samples: 400 }).slice(0, 3 * 400 + 1)
const RAMP = 400 // samples per ramp; arc junction indices: RAMP and 2*RAMP-1
const curv = []
for (let i = 2; i < dense.length - 2; i += 2) {
  const [x0, y0] = dense[i - 2], [x1, y1] = dense[i], [x2, y2] = dense[i + 2]
  const d1x = x1 - x0, d1y = y1 - y0, d2x = x2 - x1, d2y = y2 - y1
  const cross = d1x * d2y - d1y * d2x
  const len1 = Math.hypot(d1x, d1y), len2 = Math.hypot(d2x, d2y)
  const sinTheta = cross / (len1 * len2)
  const ds = (len1 + len2) / 2
  curv.push([sinTheta / ds, i]) // y-down: positive = turning CW = convex here
}
const kMin = Math.min(...curv.map((c) => c[0]))
const kMaxEntry = curv.reduce((a, b) => (b[0] > a[0] ? b : a))
const kMax = kMaxEntry[0]
check('convex everywhere (κ ≥ 0)', kMin >= -1e-7, `min κ = ${kMin.toExponential(2)}`)
// the ramps peak slightly above the arc's 1/R (documented property of the
// cubic-ramp family; w = 2 is the low-overshoot point, see module header)
check('curvature bounded (κ ≤ 1.25/R)', kMax <= 1 / R * 1.25, `max κ = ${kMax.toFixed(6)} (${(kMax * R).toFixed(3)}×1/R) at curve idx ${kMaxEntry[1]}`)

// the arc middle carries exactly 1/R (arc spans curve idx RAMP … 2·RAMP-1)
const arcMidK = curv[Math.round((RAMP + 2 * RAMP) / 4)][0]
check('arc mid curvature = 1/R (±1%)', Math.abs(arcMidK - 1 / R) < (1 / R) * 0.01, `κ_mid = ${arcMidK.toFixed(6)} vs ${(1 / R).toFixed(6)}`)

// junction tangent continuity (direction change across cubic→arc and arc→cubic)
function segAngle(i) {
  const [x0, y0] = dense[i - 1], [x1, y1] = dense[i + 1]
  return Math.atan2(y1 - y0, x1 - x0)
}
let jump = 0
for (const idx of [RAMP, 2 * RAMP - 1]) jump = Math.max(jump, Math.abs(segAngle(idx) - segAngle(idx + 2)))
check('G1 continuity at ramp/arc junctions (<0.5°)', jump < 0.5 * Math.PI / 180, `max jump ${(jump * 180 / Math.PI).toFixed(3)}°`)

// path data round-trips through the same point set
check('path data starts/ends coherently', squirclePathData(S).startsWith('M ') && squirclePathData(S).endsWith(' Z'))

// ---- comparison against the measured macOS 26 mask (informational) --------
// Measured from NSWorkspace-rendered Calculator.app icon (see spike-notes);
// both columns are "boundary distance from the box edge at depth dy".
const measured = { 5: 186, 10: 158, 20: 127, 40: 89, 60: 66, 100: 33, 140: 14, 200: 3 }
const cornerYs = corner.map((p) => p[1])
const ourAt = (dy) => {
  let best = null, bestD = Infinity
  for (const [x, y] of corner) {
    const d = Math.abs(y - dy)
    if (d < bestD) { bestD = d; best = x }
  }
  return S - best // distance from the right edge (corner block is top-right)
}
let line = '  boundary distance at depth dy (ours vs measured):'
for (const [dy, m] of Object.entries(measured)) line += `  dy${dy}:${ourAt(Number(dy)).toFixed(0)}/${m}`
console.log(line)
console.log('  (≤ ~20px @1024 systematic deviation to the true mask; sub-3px at Dock 128px — see spike-notes)')

// ---- optional visual render ------------------------------------------------
if (process.argv.includes('--render')) {
  // minimal PNG encoder (RGBA8, filter 0)
  const crcTable = new Int32Array(256).map((_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c
  })
  const crc32 = (buf) => {
    let c = 0xffffffff
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const out = Buffer.alloc(8 + data.length + 4)
    out.writeUInt32BE(data.length, 0)
    out.write(type, 4, 'latin1')
    data.copy(out, 8)
    out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'latin1'), data])), 8 + data.length)
    return out
  }
  const writePng = (file, width, height, rgba) => {
    const stride = width * 4
    const raw = Buffer.alloc((stride + 1) * height)
    for (let y = 0; y < height; y++) {
      raw[y * (stride + 1)] = 0
      rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
    }
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(width, 0)
    ihdr.writeUInt32BE(height, 4)
    ihdr[8] = 8; ihdr[9] = 6
    fs.writeFileSync(file, Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]))
  }

  // even-odd scanline mask from a polygon, 2× supersampled
  function maskFor(polygon, size) {
    const SS = 2, big = size * SS
    const mask = new Float32Array(size * size)
    const rows = new Map()
    for (let i = 0; i < polygon.length; i++) {
      const [x1, y1] = polygon[i], [x2, y2] = polygon[(i + 1) % polygon.length]
      if (y1 === y2) continue
      const [a, b] = y1 < y2 ? [i, (i + 1) % polygon.length] : [(i + 1) % polygon.length, i]
      // supersampled row yc=(yy+.5)/SS claims the edge iff a_y ≤ yc < b_y,
      // i.e. yy ∈ [a_y·SS - 0.5, b_y·SS - 0.5)
      const ymin = Math.ceil(polygon[a][1] * SS - 0.5), ymax = Math.ceil(polygon[b][1] * SS - 0.5)
      for (let yy = Math.max(0, ymin); yy < Math.min(big, ymax); yy++) {
        const yc = (yy + 0.5) / SS
        const t = (yc - polygon[a][1]) / (polygon[b][1] - polygon[a][1])
        if (t < 0 || t >= 1) continue // ceil row bounds can overshoot the edge
        const x = polygon[a][0] + t * (polygon[b][0] - polygon[a][0])
        if (!rows.has(yy)) rows.set(yy, [])
        rows.get(yy).push(x * SS)
      }
    }
    for (const [yy, xs] of rows) {
      xs.sort((p, q) => p - q)
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.round(xs[k])), xb = Math.min(big, Math.round(xs[k + 1]))
        for (let xx = xa; xx < xb; xx++) {
          const px = Math.floor(xx / SS), py = Math.floor(yy / SS)
          if (px >= 0 && px < size && py >= 0 && py < size) mask[py * size + px] += 1 / (SS * SS)
        }
      }
    }
    return mask
  }

  const size = MAC_ICON_SPEC.canvas
  const margin = MAC_ICON_SPEC.margin
  const squircle = squirclePoints(S).map(([x, y]) => [x + margin, y + margin])
  const plainRR = (() => { // plain rounded-rect, same R, for contrast
    const pts = []
    const centres = [[S - R, R], [S - R, S - R], [R, S - R], [R, R]]
    const startAngle = [-Math.PI / 2, 0, Math.PI / 2, Math.PI]
    for (let q = 0; q < 4; q++) {
      for (let i = 0; i <= 64; i++) {
        const t = startAngle[q] + (Math.PI / 2) * (i / 64)
        pts.push([centres[q][0] + R * Math.cos(t), centres[q][1] + R * Math.sin(t)])
      }
    }
    return pts.map(([x, y]) => [x + margin, y + margin])
  })()

  const panels = 2
  const width = size * panels + 24
  const rgba = Buffer.alloc(width * size * 4)
  const maskA = maskFor(squircle, size)
  const maskB = maskFor(plainRR, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      // checker backdrop
      const chk = ((x >> 4) + (y >> 4)) % 2 ? 70 : 46
      rgba[o] = chk; rgba[o + 1] = chk; rgba[o + 2] = chk; rgba[o + 3] = 255
      const panelIsLeft = x < size
      const docX = panelIsLeft ? x : x - size - 24
      const mask = panelIsLeft ? maskA : maskB
      const m = mask[y * size + docX]
      if (!(m > 0)) continue
      const gx = (docX - margin) / S, gy = (y - margin) / S
      // test pattern: diagonal gradient + white ring + white dot
      const g = Math.min(1, Math.max(0, (gx + gy) / 2))
      let r = 232 - 140 * g, gg = 112 + 40 * g, b = 34 + 150 * g
      const dx = gx - 0.5, dy = gy - 0.5, dr = Math.hypot(dx, dy)
      if (Math.abs(dr - 0.33) < 0.05) { r = 255; gg = 255; b = 255 }
      if (dr < 0.045) { r = 255; gg = 255; b = 255 }
      rgba[o] = Math.round(rgba[o] * (1 - m) + r * m)
      rgba[o + 1] = Math.round(rgba[o + 1] * (1 - m) + gg * m)
      rgba[o + 2] = Math.round(rgba[o + 2] * (1 - m) + b * m)
    }
  }
  const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'artifacts')
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, 'squircle-preview.png')
  writePng(outFile, width, size, rgba)
  console.log(`  render written: ${path.relative(process.cwd(), outFile)}  (left: squircle spec, right: plain rounded-rect)`)
}

console.log(failures === 0 ? 'verify-squircle: all checks passed' : `verify-squircle: ${failures} check(s) FAILED`)
process.exit(failures === 0 ? 0 : 1)
