import { lensMap, type LensShape } from './lens';

/** what happens to the backdrop besides the bending */
export interface Optics {
  /** frosting, px */
  blur: number;
  /** color fringes along the rim, 0–1 */
  dispersion: number;
  saturation: number;
  brightness: number;
}

const NS = 'http://www.w3.org/2000/svg';
/** the largest side of a map, in pixels: bigger panes get a smoother, scaled up map */
const MAX_MAP = 512;

interface Filter {
  id: string;
  node: SVGFilterElement;
  uses: number;
}

let host: SVGSVGElement | null = null;
let canvas: HTMLCanvasElement | null = null;
let next = 0;
const filters = new Map<string, Filter>();

function make<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.append(node);
  return node;
}

/** the <svg> that holds every filter: in the page (filters can't be referenced from elsewhere) */
function mount(): SVGSVGElement {
  if (host?.isConnected) return host;
  host = make('svg', { 'aria-hidden': 'true', focusable: 'false', 'data-vitre': '' });
  host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  for (const f of filters.values()) host.append(f.node);
  document.body.append(host);
  return host;
}

function encode(width: number, height: number, data: Uint8ClampedArray): string {
  canvas ??= document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.putImageData(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
  return canvas.toDataURL();
}

/** keeps one color channel */
const CHANNELS = [
  '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
  '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
  '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
];

function build(id: string, shape: LensShape, optics: Optics): SVGFilterElement {
  const { width: w, height: h } = shape;
  const map = lensMap(shape, Math.min(1, MAX_MAP / Math.max(w, h)));
  const f = make('filter', {
    id,
    x: 0,
    y: 0,
    width: w,
    height: h,
    filterUnits: 'userSpaceOnUse',
    primitiveUnits: 'userSpaceOnUse',
    // the map holds numbers, not colors: no gamma conversion
    'color-interpolation-filters': 'sRGB',
  });
  let src = 'SourceGraphic';
  if (optics.blur > 0) {
    make('feGaussianBlur', { in: src, stdDeviation: optics.blur, edgeMode: 'duplicate', result: 'frost' }, f);
    src = 'frost';
  }
  make('feImage', { href: encode(map.width, map.height, map.data), x: 0, y: 0, width: w, height: h, preserveAspectRatio: 'none', result: 'lens' }, f);
  const shift = (scale: number, result: string) =>
    make('feDisplacementMap', { in: src, in2: 'lens', scale, xChannelSelector: 'R', yChannelSelector: 'G', result }, f);
  if (optics.dispersion > 0) {
    // red bends a little less than green, blue a little more: fringes where the rim is steep
    const spread = Math.min(1, optics.dispersion) * 0.14;
    [1 - spread, 1, 1 + spread].forEach((k, i) => {
      shift(map.scale * k, `bent${i}`);
      make('feColorMatrix', { in: `bent${i}`, type: 'matrix', values: CHANNELS[i], result: `ch${i}` }, f);
    });
    make('feBlend', { in: 'ch0', in2: 'ch1', mode: 'screen', result: 'ch01' }, f);
    make('feBlend', { in: 'ch01', in2: 'ch2', mode: 'screen', result: 'bent' }, f);
  } else {
    shift(map.scale, 'bent');
  }
  make('feColorMatrix', { in: 'bent', type: 'saturate', values: optics.saturation, result: 'vivid' }, f);
  if (optics.brightness !== 1) {
    const transfer = make('feComponentTransfer', { in: 'vivid' }, f);
    for (const c of ['R', 'G', 'B'] as const) make(`feFunc${c}`, { type: 'linear', slope: optics.brightness }, transfer);
  }
  return f;
}

const round = (v: number, step: number) => Math.round(v / step) * step;

/** a filter for this lens: shared by every pane of the same shape. Returns its key. */
export function acquire(shape: LensShape, optics: Optics): { key: string; id: string } {
  const lens: LensShape = {
    width: Math.max(1, Math.round(shape.width)),
    height: Math.max(1, Math.round(shape.height)),
    radius: round(shape.radius, 0.5),
    bezel: round(shape.bezel, 0.5),
    thickness: round(shape.thickness, 0.5),
    ior: round(shape.ior, 0.01),
    magnify: round(shape.magnify, 0.01),
  };
  const o: Optics = {
    blur: round(optics.blur, 0.1),
    dispersion: round(optics.dispersion, 0.01),
    saturation: round(optics.saturation, 0.01),
    brightness: round(optics.brightness, 0.01),
  };
  const key = JSON.stringify([lens, o]);
  let f = filters.get(key);
  if (!f) {
    const id = `vitre-${++next}`;
    f = { id, node: build(id, lens, o), uses: 0 };
    filters.set(key, f);
    mount().append(f.node);
  }
  f.uses++;
  return { key, id: f.id };
}

export function release(key: string): void {
  const f = filters.get(key);
  if (!f || --f.uses > 0) return;
  f.node.remove();
  filters.delete(key);
}

/** how many filters exist (for tests and stats) */
export const filterCount = (): number => filters.size;
