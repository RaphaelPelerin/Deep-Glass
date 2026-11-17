import { acquire, release } from './filters';
import { canRefract, prefersReducedMotion } from './support';

/** the glass material: these refract (or frost) what is behind them */
export const GLASS = '.vitre';
/** lit by the pointer too, without glass of their own (tiles inside a card) */
const LIT = '.vitre, .vitre-tile';
/** squish, stretch towards the finger and spring back */
const PRESSABLE = '.vitre-button, .vitre-icon, .vitre-chip, [data-vitre-press]';

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
  const strength = num(cs, '--vitre-refraction', 1);
  let next: { key: string; id: string } | null = null;
  if (refract && strength > 0 && w >= 2 && h >= 2) {
    const bezel = num(cs, '--vitre-bezel', 24);
    next = acquire(
      {
        width: w,
        height: h,
        radius: radiusOf(cs.borderTopLeftRadius, w, h),
        bezel,
        thickness: num(cs, '--vitre-thickness', bezel * 0.5) * strength,
        ior: num(cs, '--vitre-ior', 1.5),
        magnify: num(cs, '--vitre-magnify', 1),
      },
      {
        blur: num(cs, '--vitre-blur', 1.5) + num(cs, '--vitre-frost', 0),
        dispersion: num(cs, '--vitre-dispersion', 0.5),
        saturation: num(cs, '--vitre-saturation', 1.7),
        brightness: num(cs, '--vitre-brightness', 1.05),
      },
    );
  }
  if (pane.key) release(pane.key);
  pane.key = next?.key ?? null;
  if (next) {
    el.style.setProperty('--vitre-filter', `url(#${next.id})`);
    el.dataset.vitreRefracts = '';
  } else {
    el.style.removeProperty('--vitre-filter');
    delete el.dataset.vitreRefracts;
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

/** re-reads a pane's settings now (after a state that changes `--vitre-*` values) */
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
      el.style.setProperty('--vitre-mx', `${(pointer.x - r.left).toFixed(1)}px`);
      el.style.setProperty('--vitre-my', `${(pointer.y - r.top).toFixed(1)}px`);
    } else if (tilt) {
      lx = tilt.x;
      ly = tilt.y;
    } else continue;
    const l = Math.hypot(lx, ly) || 1;
    lx /= l;
    ly /= l;
    el.style.setProperty('--vitre-lx', lx.toFixed(3));
    el.style.setProperty('--vitre-ly', ly.toFixed(3));
    // a gradient pointing away from the light starts bright on the lit side
    el.style.setProperty('--vitre-angle', `${((Math.atan2(-lx, ly) * 180) / Math.PI).toFixed(1)}deg`);
    el.style.setProperty('--vitre-near', near.toFixed(3));
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
  for (const el of onScreen) el.style.setProperty('--vitre-near', '0');
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
  el.style.setProperty('--vitre-mx', `${(e.clientX - r.left).toFixed(1)}px`);
  el.style.setProperty('--vitre-my', `${(e.clientY - r.top).toFixed(1)}px`);
  addEventListener('pointermove', onPressMove, { passive: true });
  addEventListener('pointerup', onPressEnd);
  addEventListener('pointercancel', onPressEnd);
}

function onPressMove(e: PointerEvent) {
  if (!pressed || e.pointerId !== pressed.id || prefersReducedMotion()) return;
  const { el, cx, cy, w, h } = pressed;
  const px = rubber(e.clientX - cx, w);
  const py = rubber(e.clientY - cy, h);
  el.style.setProperty('--vitre-pull-x', `${px.toFixed(2)}px`);
  el.style.setProperty('--vitre-pull-y', `${py.toFixed(2)}px`);
  // stretched along the pull, thinner across it
  const sx = 1 + (Math.abs(px) / w) * 1.2 - (Math.abs(py) / h) * 0.5;
  const sy = 1 + (Math.abs(py) / h) * 1.2 - (Math.abs(px) / w) * 0.5;
  el.style.setProperty('--vitre-sx', sx.toFixed(4));
  el.style.setProperty('--vitre-sy', sy.toFixed(4));
  const r = el.getBoundingClientRect();
  el.style.setProperty('--vitre-mx', `${(e.clientX - r.left).toFixed(1)}px`);
  el.style.setProperty('--vitre-my', `${(e.clientY - r.top).toFixed(1)}px`);
}

function onPressEnd(e: PointerEvent) {
  if (!pressed || e.pointerId !== pressed.id) return;
  const { el } = pressed;
  delete el.dataset.pressed;
  for (const p of ['--vitre-pull-x', '--vitre-pull-y', '--vitre-sx', '--vitre-sy']) el.style.removeProperty(p);
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
  document.documentElement.toggleAttribute('data-vitre-refraction', refract);
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
  for (const el of document.querySelectorAll<HTMLElement>('[data-vitre-refracts]')) {
    el.style.removeProperty('--vitre-filter');
    delete el.dataset.vitreRefracts;
  }
  removeEventListener('pointermove', onPointerMove);
  document.documentElement.removeEventListener('pointerleave', onPointerLeave);
  removeEventListener('pointerdown', onPointerDown);
  removeEventListener('scroll', relight, { capture: true });
  removeEventListener('resize', relight);
  removeEventListener('deviceorientation', onTilt);
  document.documentElement.removeAttribute('data-vitre-refraction');
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
