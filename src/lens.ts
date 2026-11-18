/**
 * The lens: how a pane of glass with a rounded rim bends what is behind it.
 *
 * The pane is a rounded rectangle, flat in the middle; across the `bezel` its top rounds down to
 * the edge. A ray from the eye goes straight down and bends where it enters the glass (Snell's
 * law): the steeper the surface, the more it tilts, and over the pane's `thickness` it lands
 * further inwards. So the rim shows what lies a little inside it, stretched out to the edge, the
 * way a shop window's edge does; the flat middle shows the backdrop as is. That offset, pixel by
 * pixel, is a displacement map for `feDisplacementMap`.
 */

export interface LensShape {
  /** size, CSS px */
  width: number;
  height: number;
  /** corner radius, px (a pill at most) */
  radius: number;
  /** width of the rounded rim, px */
  bezel: number;
  /** how far below the surface bent rays land, px: the strength of the bending */
  thickness: number;
  /** index of refraction (glass: 1.5) */
  ior: number;
  /** magnification of the whole pane, 1 = none (a loupe, for thumbs) */
  magnify: number;
}

export interface LensMap {
  /** map size, pixels */
  width: number;
  height: number;
  /** RGBA: R and G hold the x and y offsets around 128 */
  data: Uint8ClampedArray<ArrayBuffer>;
  /** `scale` of feDisplacementMap: offset = scale × (channel / 255 − 0.5), CSS px */
  scale: number;
}

/** the rim's profile: between a circle (2) and a squircle (4) */
const ROUNDNESS = 2.6;

/** height of the surface across the rim, as a fraction of the rim width: 0 at the edge, 1 flat */
export const surface = (t: number): number => Math.pow(1 - Math.pow(1 - t, ROUNDNESS), 1 / ROUNDNESS);

/** slope of `surface`: vertical at the very edge, flat at the end of the rim */
export const slope = (t: number): number => {
  const u = Math.max(0, 1 - t);
  return Math.pow(u, ROUNDNESS - 1) * Math.pow(Math.max(1e-9, 1 - Math.pow(u, ROUNDNESS)), 1 / ROUNDNESS - 1);
};

/** how far inwards a ray entering at `t` across the rim (0 edge, 1 flat) lands, px */
export function bend(t: number, lens: Pick<LensShape, 'thickness' | 'ior'>): number {
  const incidence = Math.atan(slope(t));
  const refracted = Math.asin(Math.sin(incidence) / Math.max(1, lens.ior));
  return lens.thickness * Math.tan(incidence - refracted);
}

/**
 * The offset across the rim, from the edge (index 0) to where it turns flat: physical, then
 * tamed so the view never folds back on itself (no mirrored copies) nor reaches past the rim.
 */
export function rimProfile(lens: Pick<LensShape, 'bezel' | 'thickness' | 'ior'>, steps = 512): Float32Array {
  const out = new Float32Array(steps + 1);
  for (let i = 0; i <= steps; i++) out[i] = bend(i / steps, lens);
  // the edge shows at most 80% of the rim's width inwards
  const fit = Math.min(1, (lens.bezel * 0.8) / Math.max(1e-6, out[0]));
  const step = lens.bezel / steps;
  // what each point shows (its depth + offset) must keep moving inwards: at least 18% as fast
  let seen = -Infinity;
  for (let i = 0; i <= steps; i++) {
    out[i] *= fit;
    const depth = i * step;
    seen = Math.max(depth + out[i], seen + step * 0.18);
    out[i] = seen - depth;
  }
  // and it lands smoothly on the flat middle
  for (let i = 0; i <= steps; i++) out[i] *= 1 - Math.pow(i / steps, 6);
  return out;
}

/** the displacement map of a lens, `resolution` map pixels per CSS px */
export function lensMap(shape: LensShape, resolution = 1): LensMap {
  const width = Math.max(1, Math.round(shape.width * resolution));
  const height = Math.max(1, Math.round(shape.height * resolution));
  const hw = shape.width / 2;
  const hh = shape.height / 2;
  const radius = Math.max(0, Math.min(shape.radius, hw, hh));
  const bezel = Math.max(0.5, Math.min(shape.bezel, hw, hh));
  const STEPS = 512;
  const rim = rimProfile({ bezel, thickness: shape.thickness, ior: shape.ior }, STEPS);
  // the bending turns around corners more gradually than the outline does: no seams where the
  // flat middle's own corner would be sharp
  const turn = Math.min(Math.max(radius, bezel * 1.6), hw, hh);
  // a loupe samples closer to the center
  const zoom = 1 - 1 / Math.max(1, shape.magnify);
  // without a loupe, the flat middle stays still: no need to look at it
  const flatX = hw - Math.max(bezel, radius);
  const flatY = hh - Math.max(bezel, radius);

  const ox = new Float32Array(width * height);
  const oy = new Float32Array(width * height);
  let max = 0;
  for (let j = 0, k = 0; j < height; j++) {
    const y = (j + 0.5) / resolution - hh;
    for (let i = 0; i < width; i++, k++) {
      const x = (i + 0.5) / resolution - hw;
      const ax = Math.abs(x);
      const ay = Math.abs(y);
      if (!zoom && ((ax < flatX && ay < hh - bezel) || (ay < flatY && ax < hw - bezel))) continue;
      // signed distance to the rounded rectangle (negative inside)
      const qx = Math.abs(x) - hw + radius;
      const qy = Math.abs(y) - hh + radius;
      const d =
        qx > 0 && qy > 0 ? Math.hypot(qx, qy) - radius : Math.max(qx, qy) - radius;
      // just outside the outline (clipped away anyway), the edge's own bending carries on: a coarse
      // map, stretched smoothly, then keeps a full-strength, unbroken rim
      const depth = Math.max(0, -d);
      // the direction of the bending: outward, around the rounder corner
      const tx = Math.abs(x) - hw + turn;
      const ty = Math.abs(y) - hh + turn;
      let nx = 0;
      let ny = 0;
      if (tx > 0 && ty > 0) {
        const l = Math.hypot(tx, ty);
        nx = tx / l;
        ny = ty / l;
      } else if (tx > ty) nx = 1;
      else ny = 1;
      let dx = 0;
      let dy = 0;
      if (depth < bezel) {
        const s = rim[Math.round((depth / bezel) * STEPS)];
        dx = -Math.sign(x) * nx * s;
        dy = -Math.sign(y) * ny * s;
      }
      if (zoom) {
        dx -= x * zoom;
        dy -= y * zoom;
      }
      ox[k] = dx;
      oy[k] = dy;
      max = Math.max(max, Math.abs(dx), Math.abs(dy));
    }
  }

  // offsets as colors: 128 is still, the full range spans ±scale/2
  const scale = max > 0 ? max * 2.02 : 1;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let k = 0; k < ox.length; k++) {
    data[k * 4] = Math.round(255 * (0.5 + ox[k] / scale));
    data[k * 4 + 1] = Math.round(255 * (0.5 + oy[k] / scale));
    data[k * 4 + 2] = 128;
    data[k * 4 + 3] = 255;
  }
  return { width, height, data, scale };
}
