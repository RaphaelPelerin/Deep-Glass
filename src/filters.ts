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
/**
 * Map pixels across the rim. The browser draws every map on every frame the glass moves or its
 * backdrop changes, at a cost that grows with its size; the field is smooth, and the GPU stretches
 * it with bilinear filtering, so a few pixels across the rim are all it needs.
 */
const MAP_PX_PER_RIM = 8;
/** and never more than this on a side */
const MAX_MAP = 256;
/** fringes are 3 passes instead of 1: only where they show, on clear glass (frosting hides them) */
const FRINGES_UP_TO_BLUR = 3;
/** the widest a color fringe gets, px */
const MAX_FRINGE = 1.5;
/** lenses no pane uses any more stay ready for a while (a thumb let go, a drop at rest…) */
const SPARE = 40;

interface Filter {
  id: string;
  node: SVGFilterElement;
  map: string;
  uses: number;
}

interface Map_ {
  url: string;
  scale: number;
  uses: number;
}

let host: SVGSVGElement | null = null;
let next = 0;
const filters = new Map<string, Filter>();
const maps = new Map<string, Map_>();
/** maps being made, and who waits for them */
const pending = new Map<string, Set<() => void>>();

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
  host = make('svg', { 'aria-hidden': 'true', focusable: 'false', 'data-deep-glass': '' });
  host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  for (const f of filters.values()) host.append(f.node);
  document.body.append(host);
  return host;
}

/**
 * Makes a lens's displacement map, then calls `ready`. The image is encoded off the main thread
 * (toBlob), so a page full of glass, or a setting dragged live, never stalls a frame.
 */
function makeMap(key: string, shape: LensShape, ready: () => void) {
  const waiting = pending.get(key);
  if (waiting) {
    waiting.add(ready);
    return;
  }
  const all = new Set([ready]);
  pending.set(key, all);
  const m = lensMap(
    shape,
    Math.min(1, MAP_PX_PER_RIM / Math.max(1, shape.bezel), MAX_MAP / Math.max(shape.width, shape.height)),
  );
  const canvas = document.createElement('canvas');
  canvas.width = m.width;
  canvas.height = m.height;
  canvas.getContext('2d')!.putImageData(new ImageData(m.data, m.width, m.height), 0, 0);
  const done = (url: string) => {
    maps.set(key, { url, scale: m.scale, uses: 0 });
    pending.delete(key);
    for (const f of all) f();
  };
  if (typeof canvas.toBlob === 'function') {
    canvas.toBlob((blob) => done(blob ? URL.createObjectURL(blob) : canvas.toDataURL()));
  } else {
    done(canvas.toDataURL());
  }
}

function dropMap(key: string) {
  const map = maps.get(key);
  if (!map || --map.uses > 0) return;
  maps.delete(key);
  if (map.url.startsWith('blob:')) URL.revokeObjectURL(map.url);
}

/** keeps one color channel */
const CHANNELS = [
  '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
  '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
  '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
];

/** saturation then brightness, as one color matrix */
function tone(s: number, b: number): string {
  const rows = [
    [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
  ];
  return [...rows.map((r) => [...r.map((v) => +(v * b).toFixed(4)), 0, 0]), [0, 0, 0, 1, 0]].flat().join(' ');
}

function build(id: string, shape: LensShape, map: Map_, optics: Optics): SVGFilterElement {
  const { width: w, height: h } = shape;
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
  make('feImage', { href: map.url, x: 0, y: 0, width: w, height: h, preserveAspectRatio: 'none', result: 'lens' }, f);
  const shift = (scale: number, result: string) =>
    make('feDisplacementMap', { in: src, in2: 'lens', scale, xChannelSelector: 'R', yChannelSelector: 'G', result }, f);
  // red bends a little less than green, blue a little more: fringes where the rim is steep. They
  // cost 3 passes instead of 1, so only where they show: wider than a pixel, on clear glass
  const spread = Math.min(1, optics.dispersion) * 0.14;
  if ((map.scale / 2) * spread >= 1 && optics.blur < FRINGES_UP_TO_BLUR) {
    // and never more than a fine line: a loupe moves its backdrop a lot, and wide fringes would
    // split what it magnifies into three colored copies
    const s = Math.min(spread, MAX_FRINGE / (map.scale / 2));
    [1 - s, 1, 1 + s].forEach((k, i) => {
      shift(map.scale * k, `bent${i}`);
      make('feColorMatrix', { in: `bent${i}`, type: 'matrix', values: CHANNELS[i], result: `ch${i}` }, f);
    });
    make('feBlend', { in: 'ch0', in2: 'ch1', mode: 'screen', result: 'ch01' }, f);
    make('feBlend', { in: 'ch01', in2: 'ch2', mode: 'screen', result: 'bent' }, f);
  } else {
    shift(map.scale, 'bent');
  }
  if (optics.saturation !== 1 || optics.brightness !== 1) {
    make('feColorMatrix', { in: 'bent', type: 'matrix', values: tone(optics.saturation, optics.brightness) }, f);
  }
  return f;
}

const round = (v: number, step: number) => Math.round(v / step) * step;

/** drops the oldest unused lenses beyond the spare ones */
function prune() {
  let spare = 0;
  for (const [key, f] of [...filters].reverse()) {
    if (f.uses > 0 || ++spare <= SPARE) continue;
    f.node.remove();
    filters.delete(key);
    dropMap(f.map);
  }
}

/**
 * A filter for this lens, shared by every pane of the same shape and optics. Null while its map is
 * being made: `ready` is called once it can be asked again (the pane keeps its previous look).
 */
export function acquire(shape: LensShape, optics: Optics, ready: () => void): { key: string; id: string } | null {
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
  if (f) {
    // most recently used last
    filters.delete(key);
    filters.set(key, f);
  } else {
    const mapKey = JSON.stringify(lens);
    const map = maps.get(mapKey);
    if (!map) {
      makeMap(mapKey, lens, ready);
      return null;
    }
    map.uses++;
    const id = `dg-${++next}`;
    f = { id, node: build(id, lens, map, o), map: mapKey, uses: 0 };
    filters.set(key, f);
    mount().append(f.node);
  }
  f.uses++;
  return { key, id: f.id };
}

export function release(key: string): void {
  const f = filters.get(key);
  if (!f) return;
  f.uses = Math.max(0, f.uses - 1);
  if (f.uses === 0) prune();
}

/** how many filters exist (for tests and stats) */
export const filterCount = (): number => filters.size;
