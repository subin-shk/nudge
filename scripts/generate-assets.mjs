/**
 * generate-assets.mjs
 * ---------------------------------------------------------------------------
 * Nudge ships ZERO binary art in source control. Every raster asset the OS
 * requires (installer icon, taskbar icon, tray glyph) is rendered here from
 * code, so the brand can be re-skinned by editing a few hex values and the
 * repository stays diff-friendly.
 *
 * The in-app mascot is *not* generated here — it is live SVG in the renderer
 * (see src/renderer/src/features/mascot/). This script only covers the handful
 * of places where Windows/macOS/Linux demand a real PNG file on disk.
 *
 * Implementation notes:
 *   • A tiny signed-distance-field rasterizer gives analytic anti-aliasing
 *     without pulling in canvas/sharp (both of which need native compilation).
 *   • PNGs are encoded by hand: IHDR + IDAT(zlib) + IEND, filter type 0.
 *
 * Run:  npm run assets
 */

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/* ========================================================================== */
/* Brand palette                                                              */
/* ========================================================================== */

const BRAND = {
  gradientFrom: '#3DD6C0', // mint  — "wellness"
  gradientTo: '#4F7CFF', // indigo — "focus"
  body: '#FFFFFF',
  bodyShade: '#E7EEFB',
  ink: '#1E2A44',
  blush: '#FF9DB0',
  droplet: '#7FE0FF'
}

/* ========================================================================== */
/* Colour helpers                                                             */
/* ========================================================================== */

/** '#RRGGBB' | '#RRGGBBAA' -> [r,g,b,a] with components in 0..1 */
function hex(color, alpha = 1) {
  const h = color.replace('#', '')
  const n = parseInt(h.slice(0, 6), 16)
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a * alpha]
}

function mix(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    a[3] + (b[3] - a[3]) * t
  ]
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

/* ========================================================================== */
/* SDF rasterizer                                                             */
/* ========================================================================== */

/**
 * A float RGBA raster with premultiplied-free straight alpha compositing.
 * Shapes are described as signed distance functions; coverage is derived as
 * `clamp(0.5 - distance)`, which yields ~1px analytic anti-aliasing.
 */
class Raster {
  constructor(width, height) {
    this.w = width
    this.h = height
    this.px = new Float32Array(width * height * 4) // r,g,b,a straight alpha
  }

  /** Composite `color` over pixel (x,y) with coverage `cov` (0..1). */
  blend(x, y, color, cov) {
    if (cov <= 0) return
    const a = color[3] * cov
    if (a <= 0) return
    const i = (y * this.w + x) * 4
    const p = this.px
    const dstA = p[i + 3]
    const outA = a + dstA * (1 - a)
    if (outA <= 0) return
    // Straight-alpha "source over".
    for (let c = 0; c < 3; c++) {
      p[i + c] = (color[c] * a + p[i + c] * dstA * (1 - a)) / outA
    }
    p[i + 3] = outA
  }

  /**
   * Fill every pixel whose SDF value is negative.
   * @param sdf   (x,y) => signed distance in pixels (negative = inside)
   * @param shade (x,y) => RGBA colour for that pixel
   * @param bbox  optional [x0,y0,x1,y1] to limit the scan
   */
  fill(sdf, shade, bbox) {
    const [x0, y0, x1, y1] = bbox ?? [0, 0, this.w, this.h]
    const ix0 = Math.max(0, Math.floor(x0))
    const iy0 = Math.max(0, Math.floor(y0))
    const ix1 = Math.min(this.w, Math.ceil(x1))
    const iy1 = Math.min(this.h, Math.ceil(y1))
    for (let y = iy0; y < iy1; y++) {
      for (let x = ix0; x < ix1; x++) {
        const d = sdf(x + 0.5, y + 0.5)
        const cov = clamp01(0.5 - d)
        if (cov > 0) this.blend(x, y, shade(x + 0.5, y + 0.5), cov)
      }
    }
  }

  toPNG() {
    return encodePNG(this.w, this.h, this.px)
  }
}

/* --- shape SDFs ----------------------------------------------------------- */

const sdCircle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r

const sdEllipse = (cx, cy, rx, ry) => (x, y) => {
  // Cheap but visually clean approximation: scale into circle space and
  // re-scale the distance by the smaller radius.
  const dx = (x - cx) / rx
  const dy = (y - cy) / ry
  return (Math.hypot(dx, dy) - 1) * Math.min(rx, ry)
}

const sdRoundRect = (x0, y0, w, h, r) => (x, y) => {
  const cx = x0 + w / 2
  const cy = y0 + h / 2
  const qx = Math.abs(x - cx) - (w / 2 - r)
  const qy = Math.abs(y - cy) - (h / 2 - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

/** Arc stroke with round caps — used for the mascot's smile. */
const sdArc = (cx, cy, r, a0, a1, width) => (x, y) => {
  const dx = x - cx
  const dy = y - cy
  let ang = Math.atan2(dy, dx)
  if (ang < 0) ang += Math.PI * 2
  let start = a0
  let end = a1
  if (end < start) end += Math.PI * 2
  let a = ang
  if (a < start) a += Math.PI * 2
  const inSweep = a >= start && a <= end
  const ring = Math.abs(Math.hypot(dx, dy) - r) - width / 2
  if (inSweep) return ring
  // Outside the sweep: fall back to distance from the nearer round cap.
  const capDist = (ca) => Math.hypot(x - (cx + Math.cos(ca) * r), y - (cy + Math.sin(ca) * r)) - width / 2
  return Math.min(capDist(start), capDist(end))
}

/** Union of SDFs (min) — lets us weld a droplet's ball and tip together. */
const sdUnion =
  (...fns) =>
  (x, y) => {
    let m = Infinity
    for (const f of fns) m = Math.min(m, f(x, y))
    return m
  }

/** Triangle SDF (used for the droplet tip). */
const sdTriangle = (ax, ay, bx, by, cx, cy) => (x, y) => {
  const sign = (x1, y1, x2, y2, x3, y3) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3)
  const d1 = sign(x, y, ax, ay, bx, by)
  const d2 = sign(x, y, bx, by, cx, cy)
  const d3 = sign(x, y, cx, cy, ax, ay)
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  const inside = !(hasNeg && hasPos)
  // Distance to the closest edge, signed by containment.
  const seg = (px, py, qx, qy) => {
    const vx = qx - px
    const vy = qy - py
    const t = clamp01(((x - px) * vx + (y - py) * vy) / (vx * vx + vy * vy))
    return Math.hypot(x - (px + vx * t), y - (py + vy * t))
  }
  const d = Math.min(seg(ax, ay, bx, by), seg(bx, by, cx, cy), seg(cx, cy, ax, ay))
  return inside ? -d : d
}

/* --- shaders -------------------------------------------------------------- */

const solid = (color) => () => color

/** 45° linear gradient across a square of side `size`. */
const diagonalGradient = (from, to, size) => (x, y) => mix(from, to, clamp01((x + y) / (2 * size)))

/* ========================================================================== */
/* PNG encoder                                                                */
/* ========================================================================== */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePNG(width, height, floatPixels) {
  // Float RGBA (straight alpha) -> 8-bit RGBA scanlines with filter byte 0.
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1)
    raw[rowStart] = 0 // filter: None
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4
      const dst = rowStart + 1 + x * 4
      for (let c = 0; c < 4; c++) {
        raw[dst + c] = Math.round(clamp01(floatPixels[src + c]) * 255)
      }
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: truecolour + alpha
  ihdr[10] = 0 // deflate
  ihdr[11] = 0 // adaptive filtering
  ihdr[12] = 0 // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/* ========================================================================== */
/* Artwork                                                                    */
/* ========================================================================== */

/**
 * The full app icon: a rounded "squircle" tile with the mascot peeking out and
 * a water droplet above its head — the two halves of what Nudge does.
 */
function drawAppIcon(size) {
  const r = new Raster(size, size)
  const s = size / 512 // design was authored at 512px

  // Tile + gradient.
  r.fill(
    sdRoundRect(0, 0, size, size, 116 * s),
    diagonalGradient(hex(BRAND.gradientFrom), hex(BRAND.gradientTo), size)
  )

  // Soft inner highlight so the tile does not read as flat.
  r.fill(sdCircle(size * 0.28, size * 0.22, size * 0.42), solid(hex('#FFFFFF', 0.14)))

  // Water droplet (ball + tip welded with a union).
  const dropCx = 256 * s
  r.fill(
    sdUnion(
      sdCircle(dropCx, 150 * s, 40 * s),
      sdTriangle(dropCx - 30 * s, 138 * s, dropCx + 30 * s, 138 * s, dropCx, 82 * s)
    ),
    solid(hex(BRAND.droplet)),
    [dropCx - 60 * s, 60 * s, dropCx + 60 * s, 210 * s]
  )
  r.fill(sdCircle(dropCx - 12 * s, 142 * s, 11 * s), solid(hex('#FFFFFF', 0.75)))

  // Mascot body — a soft bean.
  const bodyCx = 256 * s
  const bodyCy = 320 * s
  r.fill(sdEllipse(bodyCx, bodyCy, 148 * s, 132 * s), solid(hex(BRAND.body)))
  // Bottom shading, clipped to the body by intersecting via a second pass.
  r.fill(
    (x, y) => Math.max(sdEllipse(bodyCx, bodyCy, 148 * s, 132 * s)(x, y), sdCircle(bodyCx, bodyCy + 190 * s, 170 * s)(x, y)),
    solid(hex(BRAND.bodyShade, 0.85))
  )

  // Blush.
  r.fill(sdEllipse(bodyCx - 96 * s, 336 * s, 26 * s, 17 * s), solid(hex(BRAND.blush, 0.55)))
  r.fill(sdEllipse(bodyCx + 96 * s, 336 * s, 26 * s, 17 * s), solid(hex(BRAND.blush, 0.55)))

  // Eyes + catchlights.
  for (const dx of [-52, 52]) {
    r.fill(sdEllipse(bodyCx + dx * s, 296 * s, 21 * s, 26 * s), solid(hex(BRAND.ink)))
    r.fill(sdCircle(bodyCx + (dx + 7) * s, 288 * s, 7 * s), solid(hex('#FFFFFF', 0.9)))
  }

  // Smile.
  r.fill(sdArc(bodyCx, 330 * s, 40 * s, 0.28 * Math.PI, 0.72 * Math.PI, 13 * s), solid(hex(BRAND.ink)))

  // Sparkles.
  r.fill(sdCircle(112 * s, 132 * s, 13 * s), solid(hex('#FFFFFF', 0.85)))
  r.fill(sdCircle(410 * s, 200 * s, 9 * s), solid(hex('#FFFFFF', 0.7)))
  r.fill(sdCircle(388 * s, 118 * s, 6 * s), solid(hex('#FFFFFF', 0.55)))

  return r.toPNG()
}

/**
 * Tray glyph: the mascot silhouette only, on transparency. Filled with the
 * brand indigo and given white eyes so it stays legible on both light and dark
 * Windows taskbars (Electron does not auto-invert non-template images).
 */
function drawTrayIcon(size) {
  const r = new Raster(size, size)
  const s = size / 32
  const cx = size / 2
  const cy = size * 0.56

  r.fill(sdEllipse(cx, cy, 13 * s, 11.5 * s), solid(hex(BRAND.gradientTo)))
  // Droplet crown so the glyph reads as "wellness" even at 16px.
  r.fill(
    sdUnion(sdCircle(cx, 8 * s, 3.6 * s), sdTriangle(cx - 2.6 * s, 7.2 * s, cx + 2.6 * s, 7.2 * s, cx, 2.6 * s)),
    solid(hex(BRAND.droplet))
  )
  for (const dx of [-4.6, 4.6]) {
    r.fill(sdEllipse(cx + dx * s, cy - 1.6 * s, 1.9 * s, 2.4 * s), solid(hex('#FFFFFF')))
  }
  r.fill(sdArc(cx, cy + 1.2 * s, 3.6 * s, 0.3 * Math.PI, 0.7 * Math.PI, 1.5 * s), solid(hex('#FFFFFF')))

  return r.toPNG()
}

/* ========================================================================== */
/* Emit                                                                       */
/* ========================================================================== */

const targets = [
  ['resources/icon.png', () => drawAppIcon(512)],
  ['resources/tray.png', () => drawTrayIcon(32)],
  ['resources/tray@2x.png', () => drawTrayIcon(64)]
]

mkdirSync(resolve(ROOT, 'resources'), { recursive: true })

for (const [relPath, render] of targets) {
  const out = resolve(ROOT, relPath)
  writeFileSync(out, render())
  console.log(`  ✓ ${relPath}`)
}

console.log('Assets generated.')
