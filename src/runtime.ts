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
      () => queue(pane),
    );
    // its lens is being made: it keeps the one it has meanwhile, and comes back when it's ready
    if (!next) return;
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

/** main-thread time per frame for new lenses: the rest waits for the next frame, the page stays fluid */
const BUDGET_MS = 6;

function flush() {
  frame = 0;
  const end = performance.now() + BUDGET_MS;
  for (const pane of queued) {
    queued.delete(pane);
    updatePane(pane);
    if (performance.now() > end) break;
  }
  if (queued.size) frame = requestAnimationFrame(flush);
}

/** a pane gets its lens only near the screen: off screen, nothing is made until it comes close */
function queue(pane: Pane) {
  if (!onScreen.has(pane.el)) {
    stale.add(pane);
    return;
  }
  queued.add(pane);
  frame ||= requestAnimationFrame(flush);
}


/** re-reads a pane's settings now (after a state that changes `--dg-*` values) */
export function refresh(el: HTMLElement): void {
  const pane = panes.get(el);
  if (pane) updatePane(pane);
}

/** panes whose settings changed while off screen: updated when they come into view */
const stale = new Set<Pane>();

/** re-reads every pane's settings: the visible ones now, a few per frame, the others when they show */
export function refreshAll(): void {
  for (const pane of panes.values()) {
    if (onScreen.has(pane.el)) queue(pane);
    else stale.add(pane);
  }
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

/*
 * Every value written here repaints its pane, and a repainted pane runs its lens filter again:
 * only the panes near the pointer are touched, with rounded values, and only when they change.
 * All the boxes are read before anything is written, so the layout is computed once per frame.
 */

let pointer: { x: number; y: number } | null = null;
let tilt: { x: number; y: number } | null = null;
let tiltAt = 0;
let lightFrame = 0;
/** what each pane was last given */
const shown = new WeakMap<HTMLElement, Record<string, string>>();

function set(el: HTMLElement, values: Record<string, string>) {
  const last = shown.get(el) ?? {};
  for (const [k, v] of Object.entries(values)) {
    if (last[k] === v) continue;
    last[k] = v;
    el.style.setProperty(k, v);
  }
  shown.set(el, last);
}

/** the light as CSS values: a direction (rounded so tiny moves change nothing) and its angle */
function direction(lx: number, ly: number): Record<string, string> {
  const step = Math.PI / 60;
  const a = Math.round(Math.atan2(ly, lx) / step) * step;
  return {
    '--dg-lx': Math.cos(a).toFixed(2),
    '--dg-ly': Math.sin(a).toFixed(2),
    // a gradient pointing away from the light starts bright on the lit side
    '--dg-angle': `${Math.round((Math.atan2(-Math.cos(a), Math.sin(a)) * 180) / Math.PI)}deg`,
  };
}

function lightUp() {
  lightFrame = 0;
  const els = [...onScreen];
  const boxes = els.map((el) => el.getBoundingClientRect());
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    const r = boxes[i];
    if (tilt && !pointer) {
      set(el, direction(tilt.x, tilt.y));
      continue;
    }
    const was = shown.get(el)?.['--dg-near'];
    if (!pointer) {
      if (was && was !== '0') set(el, { '--dg-near': '0' });
      continue;
    }
    // 1 over the pane, fading out within a pane size around it
    const gap = Math.hypot(
      Math.max(r.left - pointer.x, 0, pointer.x - r.right),
      Math.max(r.top - pointer.y, 0, pointer.y - r.bottom),
    );
    const near = Math.max(0, 1 - gap / Math.max(120, Math.min(r.width, r.height)));
    if (near <= 0) {
      // out of reach: keeps the light it had, the glare fades once
      if (was && was !== '0') set(el, { '--dg-near': '0' });
      continue;
    }
    set(el, {
      ...direction(pointer.x - (r.left + r.width / 2), pointer.y - (r.top + r.height / 2)),
      '--dg-near': (Math.round(near * 20) / 20).toString(),
      '--dg-mx': `${Math.round(pointer.x - r.left)}px`,
      '--dg-my': `${Math.round(pointer.y - r.top)}px`,
    });
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
  relight();
};
// phones: tilting the device moves the light (where the browser allows it without asking), 10 times a second
const onTilt = (e: DeviceOrientationEvent) => {
  if (pointer || e.gamma === null || e.beta === null || e.timeStamp - tiltAt < 100) return;
  tiltAt = e.timeStamp;
  tilt = { x: -e.gamma / 45, y: -(e.beta - 40) / 45 - 0.4 };
  relight();
};

const visibility = IntersectionObserverLike((entries) => {
  for (const e of entries) {
    const el = e.target as HTMLElement;
    if (!e.isIntersecting) {
      // a lens already made stays: off screen it costs nothing, and coming back costs nothing either
      onScreen.delete(el);
      continue;
    }
    onScreen.add(el);
    const pane = panes.get(el);
    if (pane && stale.delete(pane)) queue(pane);
  }
  relight();
});

// ---------- press: squish, follow the finger like a drop of water, spring back ----------

let pressed: {
  el: HTMLElement;
  id: number;
  left: number;
  top: number;
  w: number;
  h: number;
  x: number;
  y: number;
  frame: number;
} | null = null;

/** the further the pull, the harder it gets: like stretching something elastic */
const rubber = (d: number, size: number) => (d * 0.16) / (1 + Math.abs(d) / (size * 1.5));

function onPointerDown(e: PointerEvent) {
  const el = (e.target as Element | null)?.closest?.(PRESSABLE) as HTMLElement | null;
  if (!el || el.matches(':disabled, [aria-disabled="true"]')) return;
  const r = el.getBoundingClientRect();
  pressed = { el, id: e.pointerId, left: r.left, top: r.top, w: r.width, h: r.height, x: e.clientX, y: e.clientY, frame: 0 };
  el.dataset.pressed = '';
  set(el, { '--dg-mx': `${Math.round(e.clientX - r.left)}px`, '--dg-my': `${Math.round(e.clientY - r.top)}px` });
  addEventListener('pointermove', onPressMove, { passive: true });
  addEventListener('pointerup', onPressEnd);
  addEventListener('pointercancel', onPressEnd);
}

/** the pull follows the pointer once per frame, from the box measured at the press: no layout reads */
function pull() {
  if (!pressed) return;
  pressed.frame = 0;
  const { el, left, top, w, h, x, y } = pressed;
  const px = rubber(x - (left + w / 2), w);
  const py = rubber(y - (top + h / 2), h);
  // stretched along the pull, thinner across it
  const sx = 1 + (Math.abs(px) / w) * 1.2 - (Math.abs(py) / h) * 0.5;
  const sy = 1 + (Math.abs(py) / h) * 1.2 - (Math.abs(px) / w) * 0.5;
  set(el, {
    '--dg-pull-x': `${px.toFixed(1)}px`,
    '--dg-pull-y': `${py.toFixed(1)}px`,
    '--dg-sx': sx.toFixed(3),
    '--dg-sy': sy.toFixed(3),
    '--dg-mx': `${Math.round(x - left - px)}px`,
    '--dg-my': `${Math.round(y - top - py)}px`,
  });
}

function onPressMove(e: PointerEvent) {
  if (!pressed || e.pointerId !== pressed.id || prefersReducedMotion()) return;
  pressed.x = e.clientX;
  pressed.y = e.clientY;
  pressed.frame ||= requestAnimationFrame(pull);
}

function onPressEnd(e: PointerEvent) {
  if (!pressed || e.pointerId !== pressed.id) return;
  const { el, frame } = pressed;
  cancelAnimationFrame(frame);
  delete el.dataset.pressed;
  const last = shown.get(el);
  for (const p of ['--dg-pull-x', '--dg-pull-y', '--dg-sx', '--dg-sy']) {
    el.style.removeProperty(p);
    if (last) delete last[p];
  }
  pressed = null;
  removeEventListener('pointermove', onPressMove);
  removeEventListener('pointerup', onPressEnd);
  removeEventListener('pointercancel', onPressEnd);
}

// ---------- discovery ----------

function attach(el: HTMLElement) {
  // a group whose glass is drawn by a surface inside it: the surface is the pane
  if (el.hasAttribute('data-dg-surface')) {
    for (const [selector, setup] of controls) {
      if (el.matches(selector) && !cleanups.has(el)) cleanups.set(el, setup(el) ?? (() => {}));
    }
    return;
  }
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

/**
 * The element stops being a pane (its glass is drawn by a surface inside it now): no lens, no
 * light of its own. Its behavior, if it has one, stays.
 */
export function demote(el: HTMLElement): void {
  el.setAttribute('data-dg-surface', '');
  const pane = panes.get(el);
  if (pane) {
    if (pane.key) release(pane.key);
    queued.delete(pane);
    stale.delete(pane);
    resizes.unobserve(el);
    panes.delete(el);
  }
  if (lit.delete(el)) {
    visibility.unobserve(el);
    onScreen.delete(el);
  }
  el.style.removeProperty('--dg-filter');
  delete el.dataset.dgRefracts;
}

function detach(el: HTMLElement) {
  const pane = panes.get(el);
  if (pane) {
    if (pane.key) release(pane.key);
    queued.delete(pane);
    stale.delete(pane);
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

// ---------- themes: dark glass changes the optics, every lens is made again ----------

const themes = MutationObserverLike(() => refreshAll());
const systemDark = typeof matchMedia === 'undefined' ? null : matchMedia('(prefers-color-scheme: dark)');

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
    themes.observe(document.documentElement, { attributes: true, attributeFilter: ['data-dg-theme'], subtree: true });
    systemDark?.addEventListener('change', refreshAll);
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
  themes.disconnect();
  systemDark?.removeEventListener('change', refreshAll);
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
    : // a little ahead of the screen: lenses are ready before they show
      new IntersectionObserver(cb, { rootMargin: '100% 0px' });
}
function MutationObserverLike(cb: MutationCallback) {
  return typeof MutationObserver === 'undefined'
    ? ({ observe() {}, disconnect() {} } as unknown as MutationObserver)
    : new MutationObserver(cb);
}
