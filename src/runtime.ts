import { acquire, release, repaint } from './filters';
import { canRefract, prefersReducedMotion } from './support';

/** the glass material: these refract (or frost) what is behind them */
export const GLASS = '.dg';
/** lit by the pointer */
const LIT = GLASS;
/** squish, stretch towards the finger and spring back */
const PRESSABLE = '.dg-button, .dg-icon, .dg-chip, [data-dg-press]';

interface Pane {
  el: HTMLElement;
  /** the filter in use */
  key: string | null;
  w: number;
  h: number;
  /** the size its filter was made for */
  made?: { w: number; h: number };
}

/** a component's behavior: set up on an element, returns its cleanup */
export type Setup = (el: HTMLElement) => (() => void) | void;

export interface RuntimeOptions {
  refraction: boolean;
  light: boolean;
  adaptive: boolean;
}

const panes = new Map<HTMLElement, Pane>();
const lit = new Set<HTMLElement>();
const onScreen = new Set<HTMLElement>();
const cleanups = new Map<HTMLElement, () => void>();
const controls: [string, Setup][] = [];
const roots = new Set<ParentNode>();
let options: RuntimeOptions = { refraction: true, light: true, adaptive: true };
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
  // slow device, last step: small panes stay frosted (see adapt)
  const small = quality >= 3 && Math.min(w, h) <= SMALL;
  const strength = small ? 0 : num(cs, '--dg-refraction', 1);
  let next: { key: string; id: string } | null = null;
  if (refract && strength > 0 && w >= 2 && h >= 2) {
    const bezel = num(cs, '--dg-bezel', 24);
    next = acquire(
      {
        width: w,
        height: h,
        radius: radiusOf(el.style.getPropertyValue('--dg-corner') || cs.borderTopLeftRadius, w, h),
        bezel,
        thickness: num(cs, '--dg-thickness', bezel * 0.5) * strength,
        ior: num(cs, '--dg-ior', 1.5),
        magnify: num(cs, '--dg-magnify', 1),
      },
      {
        blur: num(cs, '--dg-blur', 1.5) + num(cs, '--dg-frost', 0),
        dispersion: quality >= 1 ? 0 : num(cs, '--dg-dispersion', 0.5),
        saturation: num(cs, '--dg-saturation', 1.7),
        brightness: num(cs, '--dg-brightness', 1.05),
      },
      () => queue(pane),
    );
    // its lens is being made: it keeps the one it has meanwhile, and comes back when it's ready
    // (a drop that grew would show where the old lens ends: it goes without for a frame or two)
    const grew = pane.made && (w > pane.made.w + 1 || h > pane.made.h + 1);
    if (!next && !(grew && el.matches('.dg-droplet'))) return;
  }
  pane.made = next ? { w, h } : undefined;
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

/** the light as a CSS gradient angle, rounded so tiny moves change nothing */
function direction(angle: number): Record<string, string> {
  const step = Math.PI / 24;
  const a = Math.round(angle / step) * step;
  // a gradient pointing away from the light starts bright on the lit side
  return { '--dg-angle': `${Math.round((Math.atan2(-Math.cos(a), Math.sin(a)) * 180) / Math.PI)}deg` };
}

/*
 * The glare: a spot of light drawn once, then only moved and faded, which the GPU does without
 * painting the pane again. Made for a pane the first time the light reaches it.
 */
const glares = new WeakMap<HTMLElement, HTMLElement>();
/** these can't hold a glare */
const CHILDLESS = 'input, textarea, select, img, video, canvas, iframe, svg';

function glareIn(el: HTMLElement): HTMLElement | null {
  const made = glares.get(el);
  if (made?.parentElement?.parentElement === el) return made;
  if (el.matches(CHILDLESS)) return null;
  const clip = document.createElement('span');
  clip.className = 'dg-glare';
  clip.setAttribute('aria-hidden', 'true');
  const spot = document.createElement('span');
  clip.append(spot);
  el.append(clip);
  glares.set(el, spot);
  return spot;
}

function drawGlare(el: HTMLElement, l: Light) {
  // cards and tables: no glare over what they hold
  if (el.matches('.dg-card, .dg-table, .dg-table .dg-droplet')) return;
  const on = l.near > 0 || pressed?.el === el;
  const spot = on ? glareIn(el) : glares.get(el);
  if (!spot) return;
  set(spot, {
    ...(on ? { transform: `translate(${Math.round(l.x)}px, ${Math.round(l.y)}px)` } : null),
    opacity: (Math.round(l.near * 25) / 25).toString(),
  });
  spot.toggleAttribute('data-on', on);
}

function dropGlare(el: HTMLElement) {
  glares.get(el)?.parentElement?.remove();
  glares.delete(el);
  moving.delete(el);
}

// ---------- quality: lighter on devices that can't keep up ----------

/** 0: everything, 1: no color fringes, 2: light on one pane at a time, 3: no refraction on small panes */
let quality = 0;
/** panes this small (their short side, px) stop refracting at the last step */
const SMALL = 56;
/** frames that take longer than this on average are too slow: 45 a second */
const SLOW = 1 / 45;
/** frames measured before a decision */
const SAMPLE = 40;
let sampled = 0;
let sampledTime = 0;
/** slow samples in a row: one is bad luck */
let slow = 0;
/** good frames since the last change, and how many it takes to try a step back up */
let good = 0;
let patience = 400;
/** the last change was a step up */
let trying = false;

/** called for every frame that follows another while the light moves: the moments that lag */
function adapt(dt: number) {
  // a longer one is a tab coming back or the page busy with something else; lenses being made are
  // no measure of what showing them costs
  if (!options.adaptive || dt > 0.2 || queued.size) return;
  sampled++;
  sampledTime += dt;
  if (sampled < SAMPLE) return;
  const mean = sampledTime / sampled;
  sampled = 0;
  sampledTime = 0;
  if (mean > SLOW) {
    if (++slow < 2 || quality === 3) return;
    // tried, and too much for this device: longer before the next try
    if (trying) patience *= 4;
    trying = false;
    slow = good = 0;
    setQuality(quality + 1);
    return;
  }
  slow = 0;
  if (quality === 0 || mean > 1 / 50) return;
  good += SAMPLE;
  if (good < patience) return;
  good = 0;
  trying = true;
  setQuality(quality - 1);
}

function setQuality(level: number) {
  quality = level;
  if (level) document.documentElement.dataset.dgQuality = String(level);
  else delete document.documentElement.dataset.dgQuality;
  retarget = true;
  refreshAll();
}

export const qualityLevel = (): number => quality;

/** where the light of a pane is, and where it goes: it has inertia, it never jumps */
interface Light {
  /** direction of the rim light */
  angle: number;
  toAngle: number;
  /** strength of the glare */
  near: number;
  toNear: number;
  /** the glare */
  x: number;
  y: number;
  toX: number;
  toY: number;
  /** when the glare went out */
  outAt: number;
}

/** the light at rest, as in the stylesheet: from the top left */
const REST = Math.atan2(-0.8, -0.6);
/** how long the light takes to turn, the glare to move, and to brighten or fade, s */
const TURN = 0.12;
const SLIDE = 0.045;
const FADE = 0.09;
/** a glare out for this long starts again where the pointer is (its fade has ended by then), ms */
const OUT = 250;
/** the light reaches this many panes at once, the nearest ones */
const REACH = 4;
/** and turns the rim of this many: a rim that turns is painted again, a glare is only moved */
const TURNS = 2;

const lights = new WeakMap<HTMLElement, Light>();
/** panes whose light is on its way */
const moving = new Set<HTMLElement>();
/** the pointer, the scroll or the panes changed: where each light goes is to be worked out again */
let retarget = true;
let lightAt = 0;
let lightTick = 0;
/** the frame before this one lit panes too: the time between them is a real frame time */
let following = false;

/** the shortest way from an angle to another */
const turn = (from: number, to: number) => {
  const d = (to - from) % (2 * Math.PI);
  return d > Math.PI ? d - 2 * Math.PI : d < -Math.PI ? d + 2 * Math.PI : d;
};

function lightOf(el: HTMLElement): Light {
  let l = lights.get(el);
  if (!l) {
    l = { angle: REST, toAngle: REST, near: 0, toNear: 0, x: 0, y: 0, toX: 0, toY: 0, outAt: -OUT };
    lights.set(el, l);
  }
  return l;
}

/** where each light goes, for the panes near the pointer and the ones it just left */
function aim(now: number) {
  const els = [...onScreen];
  const boxes = els.map((el) => el.getBoundingClientRect());
  const nears = boxes.map((r) => {
    if (!pointer) return 0;
    // 1 over the pane, fading out within a pane size around it
    const gap = Math.hypot(
      Math.max(r.left - pointer.x, 0, pointer.x - r.right),
      Math.max(r.top - pointer.y, 0, pointer.y - r.bottom),
    );
    return Math.max(0, 1 - gap / Math.max(120, Math.min(r.width, r.height)));
  });
  const reach = quality >= 2 ? 1 : REACH;
  const reached = els.map((_, i) => i).filter((i) => nears[i] > 0);
  const turns = new Set(reached);
  if (reached.length > TURNS) {
    // the nearest; among those under the pointer, the smallest: a button before the card it is in
    reached.sort((a, b) => nears[b] - nears[a] || boxes[a].width * boxes[a].height - boxes[b].width * boxes[b].height);
    for (const i of reached.slice(reach)) nears[i] = 0;
    for (const i of reached.slice(TURNS)) turns.delete(i);
  }
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    const r = boxes[i];
    if (pressed?.el === el) {
      // held: lit until it is let go
      lightOf(el).toNear = 1;
      continue;
    }
    if (tilt && !pointer) {
      const l = lightOf(el);
      l.toAngle = Math.atan2(tilt.y, tilt.x);
      l.toNear = 0;
      moving.add(el);
      continue;
    }
    const near = nears[i];
    if (near <= 0 || !pointer) {
      // out of reach: the glare fades where it is, the rim turns back to its light at rest
      const l = lights.get(el);
      if (!l || (l.toNear === 0 && l.toAngle === REST)) continue;
      l.toNear = 0;
      l.toAngle = REST;
      moving.add(el);
      continue;
    }
    const l = lightOf(el);
    // the rim turns towards the pointer as it comes, all the way well before it touches
    const pull = Math.min(1, near * 1.6);
    const facing = Math.atan2(pointer.y - (r.top + r.height / 2), pointer.x - (r.left + r.width / 2));
    l.toAngle = turns.has(i) ? REST + turn(REST, facing) * pull * pull * (3 - 2 * pull) : REST;
    l.toNear = near;
    l.toX = pointer.x - r.left;
    l.toY = pointer.y - r.top;
    // the glare was out: it comes back here, it doesn't cross the pane from where it was
    if (l.near === 0 && now - l.outAt > OUT) {
      l.x = l.toX;
      l.y = l.toY;
    }
    moving.add(el);
  }
}

function lightUp(now: number) {
  lightFrame = 0;
  const dt = Math.min(0.05, Math.max(0.001, (now - lightAt) / 1000));
  if (following) adapt((now - lightAt) / 1000);
  lightAt = now;
  if (retarget) {
    retarget = false;
    aim(now);
  }
  const still = prefersReducedMotion();
  const ease = (time: number) => (still ? 1 : 1 - Math.exp(-dt / time));
  const turning = ease(TURN);
  const sliding = ease(SLIDE);
  const fading = ease(FADE);
  lightTick++;
  let nth = 0;
  for (const el of moving) {
    const l = lightOf(el);
    const da = turn(l.angle, l.toAngle);
    const dn = l.toNear - l.near;
    const dx = l.toX - l.x;
    const dy = l.toY - l.y;
    const turned = Math.abs(da) < 0.02;
    const faded = Math.abs(dn) < 0.02;
    const slid = l.toNear === 0 || Math.hypot(dx, dy) < 0.5;
    const before = l.near;
    l.angle = turned ? l.toAngle : l.angle + da * turning;
    l.near = faded ? l.toNear : l.near + dn * fading;
    if (l.near === 0 && before > 0) l.outAt = now;
    if (l.toNear > 0) {
      l.x = slid ? l.toX : l.x + dx * sliding;
      l.y = slid ? l.toY : l.y + dy * sliding;
    }
    // each write repaints a lens: the panes by the pointer on every frame, the ones further away,
    // where the light is faint, one frame in three
    if (Math.max(l.near, l.toNear) < 0.7 && pressed?.el !== el && (lightTick + nth++) % 3) continue;
    set(el, direction(l.angle));
    drawGlare(el, l);
    if (turned && faded && slid) moving.delete(el);
  }
  following = moving.size > 0 || retarget;
  if (following) lightFrame ||= requestAnimationFrame(lightUp);
}

const relight = () => {
  if (!options.light) return;
  retarget = true;
  if (lightFrame) return;
  // idle until now: the time since the last frame is not the light's
  if (!moving.size) lightAt = performance.now() - 16;
  lightFrame = requestAnimationFrame(lightUp);
};

/** the glare is put here at once (a press) */
function glareAt(el: HTMLElement, x: number, y: number) {
  const l = lightOf(el);
  l.x = l.toX = x;
  l.y = l.toY = y;
  drawGlare(el, l);
}

const onPointerMove = (e: PointerEvent) => {
  if (e.pointerType === 'touch' && !pressed) return;
  pointer = { x: e.clientX, y: e.clientY };
  relight();
};
const onPointerLeave = () => {
  if (document.hasFocus()) outside(true);
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
      moving.delete(el);
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
  const l = lightOf(el);
  l.near = l.toNear = 1;
  glareAt(el, e.clientX - r.left, e.clientY - r.top);
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
  });
  glareAt(el, x - left - px, y - top - py);
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
  // a finger lifted lights nothing any more
  if (e.pointerType === 'touch') pointer = null;
  if (options.light) {
    relight();
  } else {
    const l = lightOf(el);
    l.near = l.toNear = 0;
    drawGlare(el, l);
  }
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
    dropGlare(el);
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
    dropGlare(el);
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

/**
 * While the pointer is on the browser's own bar (its tabs and their previews), Chrome may redraw
 * only part of a lens and misplace its map in that part: a seam across the glass. Meanwhile the
 * lenses on screen are kept moving by a hair, so they're always redrawn whole (and not for long).
 */
let outsideTimer: ReturnType<typeof setTimeout> | undefined;
function outside(on: boolean) {
  clearTimeout(outsideTimer);
  document.documentElement.toggleAttribute('data-dg-outside', on && refract);
  if (on) outsideTimer = setTimeout(() => outside(false), 20000);
}
/** back from a hidden tab or from the browser's own bar: the browser may have dropped the lens maps */
const onVisible = () => {
  outside(false);
  if (document.visibilityState === 'visible') repaint();
};
const onAway = () => outside(false);

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
    document.addEventListener('visibilitychange', onVisible);
    addEventListener('pageshow', onVisible);
    addEventListener('focus', onVisible);
    addEventListener('blur', onAway);
    document.documentElement.addEventListener('pointerenter', onVisible);
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
  document.removeEventListener('visibilitychange', onVisible);
  removeEventListener('pageshow', onVisible);
  removeEventListener('focus', onVisible);
  removeEventListener('blur', onAway);
  outside(false);
  document.documentElement.removeEventListener('pointerenter', onVisible);
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
