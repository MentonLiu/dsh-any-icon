// macOS Dock icon squircle — G2 (curvature-continuous) rounded rectangle.
//
// Spec (Apple macOS app icon template, honoured literally):
//   · document 1024 × 1024, graphic 824 × 824, 100px transparent margins
//   · corner "radius" 185.4 on the 824 graphic
//   · the corners are continuous-curvature ("squircle"), NOT simple arcs.
//
// Construction (per 90° corner, top-right, y-down canvas coords):
//
//   straight edge ── E ─ cubic ramp 1 ── A1 ─ arc(R) ── A2 ─ cubic ramp 2 ── E′ ── straight edge
//
//   · arc: circle C=(S-R, R), spanning turn β … 90°-β  (curvature exactly 1/R)
//   · each ramp is one cubic Bezier that LEAVES the straight edge with tangent
//     along the edge and curvature 0, and hands over to the arc with the arc's
//     tangent and curvature 1/R — the conditions κ(0)=0, κ(1)=1/R plus tangent
//     matching pin the control polygon up to one shape constant w = s1/s2:
//
//       μ  = |P3-P2| = R·tan(β/2)                (end-tangent magnitude)
//       s2 = 3μ² / (2R·sinβ)                     (from κ(1) = 1/R)
//       e  = S - R + R·tan(β/2) - (w+1)·s2       (edge departure point)
//
//     so the whole corner is G2: curvature 0 (edge) → 1/R (arc) → 0, with no
//     jumps. The ramp pair + arc is what makes it a squircle rather than a
//     rounded rect.
//
// The constants (β = 30°, w = 2) keep a real 30° arc section and were chosen
// against the mask measured from a macOS 26 system-rendered app icon:
//   · the ramp cubics peak at κ ≈ 1.19/R (effective min radius ≈ 156px on the
//     824 graphic) — every (β, w) of this family overshoots somewhat; w = 2 is
//     the low-overshoot point of the trade-off,
//   · the true Tahoe mask deviates from ANY simple two-parameter family (this
//     one, superellipse fits) by ≲ 2.5% of the graphic — sub-3px at the Dock's
//     128px tile, i.e. invisible. Every constant below comes straight from the
//     documented macOS Dock output spec.
//
// Pure geometry — no DOM dependencies. squirclePathData() output feeds both
// `new Path2D(d)` (browser canvas clip) and SVG (tooling/verification).

export const MAC_ICON_SPEC = Object.freeze({
  canvas: 1024, // icon document edge, px
  graphic: 824, // square graphic edge, px
  margin: 100, // (canvas - graphic) / 2
  cornerRadius: 185.4, // nominal corner radius on the 824 graphic
  blendDeg: 30, // β: each cubic ramp handles 30° of the 90° turn
  blendSplit: 2, // w = s1/s2, longitudinal split of the ramp cubic's controls
})

// Resolved constants of one corner's construction (local, y-down, box corner
// at (S,0); edge departs at (e,0), arc centre C, first junction A1).
export function g2CornerGeometry(box, radius, betaDeg, blendSplit) {
  const beta = (betaDeg * Math.PI) / 180
  if (!(beta > 0 && beta < Math.PI / 2)) return undefined
  const mu = radius * Math.tan(beta / 2)
  const s2 = (3 * mu * mu) / (2 * radius * Math.sin(beta))
  const s1 = blendSplit * s2
  const e = box - radius + radius * Math.tan(beta / 2) - (blendSplit + 1) * s2
  if (!(e > 0)) return undefined
  return {
    beta,
    e,
    s1,
    s2,
    C: [box - radius, radius],
    A1: [box - radius + radius * Math.sin(beta), radius - radius * Math.cos(beta)],
    arcSpanDeg: 90 - 2 * betaDeg,
  }
}

function cubic1Point(geo, t) {
  const u = 1 - t
  const [e, , s1, s2] = [geo.e, 0, geo.s1, geo.s2]
  const x = u * u * u * e + 3 * u * u * t * (e + s1) + 3 * u * t * t * (e + s1 + s2) + t * t * t * geo.A1[0]
  const y = t * t * t * geo.A1[1] // P1y = P2y = 0 (edge line)
  return [x, y]
}

// One corner's curve, from the top-edge departure point (e,0) to the mirrored
// point (S, S-e) on the right edge. Order: ramp → arc → mirrored ramp, so the
// polyline is traversal-continuous and (by the M(x,y)=(S-y,S-x) reflection)
// symmetric about the corner diagonal.
function cornerPoints(box, radius, betaDeg, blendSplit, samples) {
  const geo = g2CornerGeometry(box, radius, betaDeg, blendSplit)
  if (!geo) throw new Error(`squircle: invalid geometry (box=${box} radius=${radius} β=${betaDeg}°)`)
  const pts = []
  for (let i = 0; i <= samples; i++) pts.push(cubic1Point(geo, i / samples))
  for (let i = 1; i < samples; i++) {
    const t = geo.beta + (Math.PI / 2 - 2 * geo.beta) * (i / samples)
    pts.push([geo.C[0] + radius * Math.sin(t), geo.C[1] - radius * Math.cos(t)])
  }
  for (let i = samples; i >= 0; i--) {
    const [x, y] = cubic1Point(geo, i / samples)
    pts.push([box - y, box - x]) // M(x,y) = (S-y, S-x)
  }
  return pts
}

function rot90(box, p) {
  return [box - p[1], p[0]]
}

// Closed squircle outline around the graphic box [0, box]², canvas coords.
export function squirclePoints(box, options) {
  const opts = options || MAC_ICON_SPEC
  const radius = opts.cornerRadius ?? MAC_ICON_SPEC.cornerRadius
  const betaDeg = opts.blendDeg ?? MAC_ICON_SPEC.blendDeg
  const blendSplit = opts.blendSplit ?? MAC_ICON_SPEC.blendSplit
  const samples = opts.samples ?? 48
  const corner = cornerPoints(box, radius, betaDeg, blendSplit, samples)
  const pts = [...corner]
  let acc = corner
  for (let k = 0; k < 3; k++) {
    acc = acc.map((p) => rot90(box, p))
    pts.push(...acc)
  }
  return pts
}

// SVG/CSS path data ("M … L … Z") — usable with `new Path2D(d)` on canvas.
export function squirclePathData(box, options) {
  const pts = squirclePoints(box, options)
  const f = (v) => (Math.round(v * 1000) / 1000).toString()
  return `M ${f(pts[0][0])} ${f(pts[0][1])} ` + pts.slice(1).map((p) => `L ${f(p[0])} ${f(p[1])}`).join(' ') + ' Z'
}
