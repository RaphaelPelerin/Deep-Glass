import { acquire, release } from './filters';
import { canRefract, prefersReducedMotion } from './support';

/** the glass material: these refract (or frost) what is behind them */
export const GLASS = '.dg';
/** lit by the pointer too, without glass of their own (tiles inside a card) */
const LIT = '.dg, .dg-tile';
/** squish, stretch towards the finger and spring back */
const PRESSABLE = '.dg-button, .dg-icon, .dg-chip, [data-dg-press]';

interface Pane {
  el: HTMLElement;
  /** the filter in use */
  key: string | null;
  w: number;
  h: number;
}

/** a component's behavior: set up on an element, returns its cleanup */
export type Setup = (el: HTMLElement) => (() => void) | void;

export interface RuntimeOptions {
  refraction: boolean;
  light: boolean;
}

const panes = new Map<HTMLElement, Pane>();
const lit = new Set<HTMLElement>();
const onScreen = new Set<HTMLElement>();
const cleanups = new Map<HTMLElement, () => void>();
const controls: [string, Setup][] = [];
const roots = new Set<ParentNode>();
let options: RuntimeOptions = { refraction: true, light: true };
let refract = false;
let started = false;

// ---------- refraction ----------

const queued = new Set<Pane>();
let frame = 0;

const num = (cs: CSSStyleDeclaration, name: string, fallback: number) => {
  const v = parseFloat(cs.getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
};

/** the corner radius in px, from a computed `border-radius` (px or %) */
function radiusOf(value: string, w: number, h: number): number {
  const first = value.split(' ')[0];
  const v = parseFloat(first);
  if (!Number.isFinite(v)) return 0;
  return Math.min(first.endsWith('%') ? (v / 100) * Math.min(w, h) : v, w / 2, h / 2);
}

function updatePane(pane: Pane) {
  const { el, w, h } = pane;
  if (!el.isConnected) return;
  const cs = getComputedStyle(el);
  const strength = num(cs, '--dg-refraction', 1);
  let next: { key: string; id: string } | null = null;
  if (refract && strength > 0 && w >= 2 && h >= 2) {
    const bezel = num(cs, '--dg-bezel', 24);
    next = acquire(
      {
        width: w,
        height: h,
        radius: radiusOf(cs.borderTopLeftRadius, w, h),
        bezel,
        thickness: num(cs, '--dg-thickness', bezel * 0.5) * strength,
        ior: num(cs, '--dg-ior', 1.5),
        magnify: num(cs, '--dg-magnify', 1),
      },
      {
        blur: num(cs, '--dg-blur', 1.5) + num(cs, '--dg-frost', 0),
        dispersion: num(cs, '--dg-dispersion', 0.5),
        saturation: num(cs, '--dg-saturation', 1.7),
        brightness: num(cs, '--dg-brightness', 1.05),
      },
    );
  }
  if (pane.key) release(pane.key);
  pane.key = next?.key ?? null;
  if (next) {
    el.style.setProperty('--dg-filter', `url(#${next.id})`);
    el.dataset.dgRefracts = '';
  } else {
    el.style.removeProperty('--dg-filter');
    delete el.dataset.dgRefracts;
  }
}

function flush() {
  frame = 0;
  for (const pane of queued) updatePane(pane);
  queued.clear();
}

function queue(pane: Pane) {
  queued.add(pane);
  frame ||= requestAnimationFrame(flush);
}

/** re-reads a pane's settings now (after a state that changes `--dg-*` values) */
export function refresh(el: HTMLElement): void {
  const pane = panes.get(el);
  if (pane) updatePane(pane);
}

const resizes = ResizeObserverLike((entries) => {
  for (const e of entries) {
    const pane = panes.get(e.target as HTMLElement);
    if (!pane) continue;
    const box = e.borderBoxSize?.[0];
    const w = box ? box.inlineSize : (e.target as HTMLElement).offsetWidth;
    const h = box ? box.blockSize : (e.target as HTMLElement).offsetHeight;
    if (Math.round(w) === Math.round(pane.w) && Math.round(h) === Math.round(pane.h) && pane.key) continue;
    pane.w = w;
    pane.h = h;
    queue(pane);
  }
});

// ---------- light: highlights face the pointer, glare follows it ----------

let pointer: { x: number; y: number } | null = null;
let tilt: { x: number; y: number } | null = null;
let lightFrame = 0;

function lightUp() {
  lightFrame = 0;
  for (const el of onScreen) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let lx: number;
    let ly: number;
    let near = 0;
    if (pointer) {
      lx = pointer.x - cx;
      ly = pointer.y - cy;
      // 1 over the pane, fading out within a pane size around it
      const gap = Math.hypot(
        Math.max(r.left - pointer.x, 0, pointer.x - r.right),
        Math.max(r.top - pointer.y, 0, pointer.y - r.bottom),
      );
      near = Math.max(0, 1 - gap / Math.max(120, Math.min(r.width, r.height)));
      el.style.setProperty('--dg-mx', `${(pointer.x - r.left).toFixed(1)}px`);
      el.style.setProperty('--dg-my', `${(pointer.y - r.top).toFixed(1)}px`);
    } else if (tilt) {
      lx = tilt.x;
      ly = tilt.y;
    } else continue;
    const l = Math.hypot(lx, ly) || 1;
    lx /= l;
    ly /= l;
    el.style.setProperty('--dg-lx', lx.toFixed(3));
    el.style.setProperty('--dg-ly', ly.toFixed(3));
    // a gradient pointing away from the light starts bright on the lit side
    el.style.setProperty('--dg-angle', `${((Math.atan2(-lx, ly) * 180) / Math.PI).toFixed(1)}deg`);
    el.style.setProperty('--dg-near', near.toFixed(3));
  }
}

const relight = () => {
  if (options.light) lightFrame ||= requestAnimationFrame(lightUp);
};

const onPointerMove = (e: PointerEvent) => {
  if (e.pointerType === 'touch' && !pressed) return;
  pointer = { x: e.clientX, y: e.clientY };
  relight();
};
const onPointerLeave = () => {
  pointer = null;
  for (const el of onScreen) el.style.setProperty('--dg-near', '0');
};
// phones: tilting the device moves the light (where the browser allows it without asking)
const onTilt = (e: DeviceOrientationEvent) => {
  if (pointer || e.gamma === null || e.beta === null) return;
  tilt = { x: -e.gamma / 45, y: -(e.beta - 40) / 45 - 0.4 };
  relight();
};

const visibility = IntersectionObserverLike((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) onScreen.add(e.target as HTMLElement);
    else onScreen.delete(e.target as HTMLElement);
  }
  relight();
});

// ---------- press: squish, follow the finger like a drop of liquid, spring back ----------

let pressed: { el: HTMLElement; id: number; cx: number; cy: number; w: number; h: number } | null = null;

/** the further the pull, the harder it gets: like stretching something elastic */
const rubber = (d: number, size: number) => (d * 0.16) / (1 + Math.abs(d) / (size * 1.5));

function onPointerDown(e: PointerEvent) {
  const el = (e.target as Element | null)?.closest?.(PRESSABLE) as HTMLElement | null;
  if (!el || el.matches(':disabled, [aria-disabled="true"]')) return;
  const r = el.getBoundingClientRect();
  pressed = { el, id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
  el.dataset.pressed = '';
  el.style.setProperty('--dg-mx', `${(e.clientX - r.left).toFixed(1)}px`);
  el.style.setProperty('--dg-my', `${(e.clientY - r.top).toFixed(1)}px`);
  addEventListener('pointermove', onPressMove, { passive: true });
  addEventListener('pointerup', onPressEnd);
  addEventListener('pointercancel', onPressEnd);
}

function onPressMove(e: PointerEvent) {
  if (!pressed || e.pointerId !== pressed.id || prefersReducedMotion()) return;
  const { el, cx, cy, w, h } = pressed;
  const px = rubber(e.clientX - cx, w);
  const py = rubber(e.clientY - cy, h);
  el.style.setProperty('--dg-pull-x', `${px.toFixed(2)}px`);
  el.style.setProperty('--dg-pull-y', `${py.toFixed(2)}px`);
  // stretched along the pull, thinner across it
  const sx = 1 + (Math.abs(px) / w) * 1.2 - (Math.abs(py) / h) * 0.5;
  const sy = 1 + (Math.abs(py) / h) * 1.2 - (Math.abs(px) / w) * 0.5;
  el.style.setProperty('--dg-sx', sx.toFixed(4));
  el.style.setProperty('--dg-sy', sy.toFixed(4));
  const r = el.getBoundingClientRect();
  el.style.setProperty('--dg-mx', `${(e.clientX - r.left).toFixed(1)}px`);
  el.style.setProperty('--dg-my', `${(e.clientY - r.top).toFixed(1)}px`);
}

function onPressEnd(e: PointerEvent) {
  if (!pressed || e.pointerId !== pressed.id) return;
  const { el } = pressed;
  delete el.dataset.pressed;
  for (const p of ['--dg-pull-x', '--dg-pull-y', '--dg-sx', '--dg-sy']) el.style.removeProperty(p);
  pressed = null;
  removeEventListener('pointermove', onPressMove);
  removeEventListener('pointerup', onPressEnd);
  removeEventListener('pointercancel', onPressEnd);
}

// ---------- discovery ----------

function attach(el: HTMLElement) {
  if (el.matches(GLASS) && !panes.has(el)) {
    const pane: Pane = { el, key: null, w: el.offsetWidth, h: el.offsetHeight };
    panes.set(el, pane);
    resizes.observe(el);
  }
  if (el.matches(LIT) && !lit.has(el)) {
    lit.add(el);
    visibility.observe(el);
  }
  for (const [selector, setup] of controls) {
    if (!el.matches(selector) || cleanups.has(el)) continue;
    cleanups.set(el, setup(el) ?? (() => {}));
  }
}

function detach(el: HTMLElement) {
  const pane = panes.get(el);
  if (pane) {
    if (pane.key) release(pane.key);
    queued.delete(pane);
    resizes.unobserve(el);
    panes.delete(el);
  }
  if (lit.delete(el)) {
    visibility.unobserve(el);
    onScreen.delete(el);
  }
  const cleanup = cleanups.get(el);
  if (cleanup) {
    cleanups.delete(el);
    cleanup();
  }
}

const SELECTOR = () => [LIT, ...controls.map(([s]) => s)].join(', ');

function scan(node: ParentNode | Element) {
  const all = SELECTOR();
  if (node instanceof HTMLElement && node.matches(all)) attach(node);
  for (const el of node.querySelectorAll<HTMLElement>(all)) attach(el);
}

const mutations = MutationObserverLike((records) => {
  for (const r of records) {
    for (const n of r.addedNodes) if (n instanceof HTMLElement) scan(n);
    for (const n of r.removedNodes) {
      if (!(n instanceof HTMLElement) || n.isConnected) continue;
      for (const el of [...panes.keys(), ...lit, ...cleanups.keys()]) {
        if (!el.isConnected && (el === n || n.contains(el))) detach(el);
      }
    }
  }
});

// ---------- lifecycle ----------

export function defineControl(selector: string, setup: Setup): void {
  controls.push([selector, setup]);
}

export function start(root: ParentNode, opts: RuntimeOptions): void {
  options = opts;
  refract = opts.refraction && canRefract();
  document.documentElement.toggleAttribute('data-dg-refraction', refract);
  if (!started) {
    started = true;
    addEventListener('pointermove', onPointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onPointerLeave);
    addEventListener('pointerdown', onPointerDown, { passive: true });
    addEventListener('scroll', relight, { passive: true, capture: true });
    addEventListener('resize', relight, { passive: true });
    addEventListener('deviceorientation', onTilt, { passive: true });
  }
  if (!roots.has(root)) {
    roots.add(root);
    mutations.observe(root instanceof Document ? root.documentElement : (root as Node), {
      childList: true,
      subtree: true,
    });
  }
  scan(root);
  for (const pane of panes.values()) queue(pane);
}

export function rescan(): void {
  for (const root of roots) scan(root);
  for (const pane of panes.values()) queue(pane);
  relight();
}

export function stop(): void {
  mutations.disconnect();
  roots.clear();
  for (const el of [...panes.keys(), ...lit, ...cleanups.keys()]) detach(el);
  for (const el of document.querySelectorAll<HTMLElement>('[data-dg-refracts]')) {
    el.style.removeProperty('--dg-filter');
    delete el.dataset.dgRefracts;
  }
  removeEventListener('pointermove', onPointerMove);
  document.documentElement.removeEventListener('pointerleave', onPointerLeave);
  removeEventListener('pointerdown', onPointerDown);
  removeEventListener('scroll', relight, { capture: true });
  removeEventListener('resize', relight);
  removeEventListener('deviceorientation', onTilt);
  document.documentElement.removeAttribute('data-dg-refraction');
  started = false;
}

export const refracting = (): boolean => refract;

// observers that don't exist outside the browser (server rendering imports this module)
function ResizeObserverLike(cb: ResizeObserverCallback) {
  return typeof ResizeObserver === 'undefined'
    ? ({ observe() {}, unobserve() {}, disconnect() {} } as unknown as ResizeObserver)
    : new ResizeObserver(cb);
}
function IntersectionObserverLike(cb: IntersectionObserverCallback) {
  return typeof IntersectionObserver === 'undefined'
    ? ({ observe() {}, unobserve() {}, disconnect() {} } as unknown as IntersectionObserver)
    : new IntersectionObserver(cb);
}
function MutationObserverLike(cb: MutationCallback) {
  return typeof MutationObserver === 'undefined'
    ? ({ observe() {}, disconnect() {} } as unknown as MutationObserver)
    : new MutationObserver(cb);
}
