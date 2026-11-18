import { defineControl, refresh } from './runtime';
import { prefersReducedMotion } from './support';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const span = (className: string) => {
  const el = document.createElement('span');
  el.className = className;
  return el;
};

/** an item's box in its group's coordinates */
function boxOf(item: Element, root: HTMLElement): Box {
  const r = item.getBoundingClientRect();
  const o = root.getBoundingClientRect();
  return { x: r.left - o.left - root.clientLeft, y: r.top - o.top - root.clientTop, w: r.width, h: r.height };
}

/** an under-damped spring: it overshoots a little and settles, like a drop of water */
class Spring {
  v = 0;
  constructor(
    public x: number,
    private readonly k = 520,
    private readonly damping = 0.6,
  ) {}
  step(target: number, dt: number) {
    const a = this.k * (target - this.x) - 2 * Math.sqrt(this.k) * this.damping * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
  }
  settled(target: number) {
    return Math.abs(target - this.x) < 0.25 && Math.abs(this.v) < 6;
  }
  snap(x: number) {
    this.x = x;
    this.v = 0;
  }
}

/**
 * The glass drop that marks the selected (or hovered) item of a group and slides between them:
 * it stretches with its speed, and lifts into a magnifying lens while it is dragged.
 */
export class Droplet {
  readonly el = span('dg dg-droplet');
  private readonly px = new Spring(0);
  private readonly py = new Spring(0);
  private readonly pw = new Spring(0);
  private readonly ph = new Spring(0);
  private target: Box | null = null;
  /** layout size: scaling covers the rest while it moves, the size is set once it rests */
  private base = { w: 0, h: 0 };
  private frame = 0;
  private last = 0;
  private lifted = false;

  constructor(root: HTMLElement) {
    this.el.setAttribute('aria-hidden', 'true');
    this.el.toggleAttribute('data-hidden', true);
    // last: it lies over the items, and bends them
    root.append(this.el);
  }

  get shown(): boolean {
    return !!this.target;
  }

  to(box: Box | null, immediate = false): void {
    const appearing = !this.target;
    this.target = box;
    this.el.toggleAttribute('data-hidden', !box);
    if (!box) return;
    if (immediate || appearing || prefersReducedMotion()) {
      this.px.snap(box.x);
      this.py.snap(box.y);
      this.pw.snap(box.w);
      this.ph.snap(box.h);
      this.rest();
      return;
    }
    this.run();
  }

  lift(on: boolean): void {
    if (this.lifted === on) return;
    this.lifted = on;
    this.el.toggleAttribute('data-lifted', on);
    refresh(this.el);
    this.render();
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.el.remove();
  }

  private run() {
    if (this.frame) return;
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number) => {
    this.frame = 0;
    const t = this.target;
    if (!t) return;
    const dt = Math.min(1 / 30, (now - this.last) / 1000);
    this.last = now;
    for (let i = 0; i < 3; i++) {
      this.px.step(t.x, dt / 3);
      this.py.step(t.y, dt / 3);
      this.pw.step(t.w, dt / 3);
      this.ph.step(t.h, dt / 3);
    }
    if (this.px.settled(t.x) && this.py.settled(t.y) && this.pw.settled(t.w) && this.ph.settled(t.h)) {
      this.px.snap(t.x);
      this.py.snap(t.y);
      this.pw.snap(t.w);
      this.ph.snap(t.h);
      this.rest();
      return;
    }
    this.render();
    this.frame = requestAnimationFrame(this.tick);
  };

  /** at rest: the real size, no scaling (the lens map is made for it) */
  private rest() {
    const w = Math.round(this.pw.x);
    const h = Math.round(this.ph.x);
    if (w !== this.base.w || h !== this.base.h) {
      this.base = { w, h };
      this.el.style.width = `${w}px`;
      this.el.style.height = `${h}px`;
    }
    this.render();
  }

  private render() {
    const { w: bw, h: bh } = this.base;
    if (!bw || !bh) return;
    // longer along the motion and thinner across it: the faster, the softer
    const vx = this.px.v + this.pw.v / 2;
    const vy = this.py.v + this.ph.v / 2;
    const stretch = Math.min(0.32, Math.hypot(vx, vy) / 2400);
    let kx = this.pw.x / bw;
    let ky = this.ph.x / bh;
    if (Math.abs(vx) >= Math.abs(vy)) {
      kx *= 1 + stretch;
      ky *= 1 - stretch * 0.4;
    } else {
      ky *= 1 + stretch;
      kx *= 1 - stretch * 0.4;
    }
    const lift = this.lifted ? 1.16 : 1;
    const cx = this.px.x + this.pw.x / 2;
    const cy = this.py.x + this.ph.x / 2;
    this.el.style.transform = `translate(${(cx - bw / 2).toFixed(2)}px, ${(cy - bh / 2).toFixed(2)}px) scale(${(kx * lift).toFixed(4)}, ${(ky * lift).toFixed(4)})`;
  }
}

/**
 * A group with one selected item, marked by a droplet: segmented controls (role="radio") and tab
 * bars (role="tab"). Click, arrow keys, or grab the droplet and drag it along.
 */
function choiceGroup(role: 'radio' | 'tab') {
  const attr = role === 'radio' ? 'aria-checked' : 'aria-selected';
  return (root: HTMLElement) => {
    const items = () => [...root.querySelectorAll<HTMLElement>(`[role="${role}"]`)];
    const current = () => items().find((i) => i.getAttribute(attr) === 'true') ?? null;
    const drop = new Droplet(root);
    const place = (immediate = false) => {
      const cur = current();
      drop.to(cur ? boxOf(cur, root) : null, immediate);
    };

    const all = items();
    if (!current() && all[0]) all[0].setAttribute(attr, 'true');
    for (const i of all) {
      if (!i.hasAttribute(attr)) i.setAttribute(attr, 'false');
      i.tabIndex = i.getAttribute(attr) === 'true' ? 0 : -1;
    }

    const select = (item: HTMLElement, focus = false) => {
      if (focus) item.focus();
      if (item.getAttribute(attr) === 'true') {
        place();
        return;
      }
      for (const i of items()) {
        i.setAttribute(attr, String(i === item));
        i.tabIndex = i === item ? 0 : -1;
      }
      place();
      root.dispatchEvent(
        new CustomEvent('dg:change', {
          bubbles: true,
          detail: { index: items().indexOf(item), value: item.dataset.value ?? item.textContent?.trim() ?? '' },
        }),
      );
    };

    let dragged = false;
    const onClick = (e: MouseEvent) => {
      if (dragged) {
        dragged = false;
        return;
      }
      const item = (e.target as Element).closest<HTMLElement>(`[role="${role}"]`);
      if (item && root.contains(item)) select(item);
    };

    const onKey = (e: KeyboardEvent) => {
      const list = items();
      const i = list.indexOf(e.target as HTMLElement);
      if (i < 0) return;
      const next =
        e.key === 'ArrowRight' || e.key === 'ArrowDown'
          ? list[(i + 1) % list.length]
          : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
            ? list[(i - 1 + list.length) % list.length]
            : e.key === 'Home'
              ? list[0]
              : e.key === 'End'
                ? list[list.length - 1]
                : null;
      if (!next) return;
      e.preventDefault();
      select(next, true);
    };

    // dragging the droplet: it follows the finger as a lens, and selects where it is let go
    let drag: { id: number; x: number; on: boolean } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, on: false };
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.on) {
        if (Math.abs(e.clientX - drag.x) < 6) return;
        drag.on = true;
        root.setPointerCapture(e.pointerId);
        root.toggleAttribute('data-dragging', true);
        drop.lift(true);
      }
      const ref = boxOf(current() ?? items()[0], root);
      const first = boxOf(items()[0], root);
      const last = boxOf(items()[items().length - 1], root);
      const x = e.clientX - root.getBoundingClientRect().left - root.clientLeft - ref.w / 2;
      drop.to({ ...ref, x: Math.max(first.x, Math.min(last.x + last.w - ref.w, x)) });
    };
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const was = drag.on;
      drag = null;
      if (!was) return;
      dragged = true;
      setTimeout(() => (dragged = false));
      root.removeAttribute('data-dragging');
      drop.lift(false);
      const at = e.clientX - root.getBoundingClientRect().left - root.clientLeft;
      let best = items()[0];
      let gap = Infinity;
      for (const i of items()) {
        const b = boxOf(i, root);
        const d = Math.abs(b.x + b.w / 2 - at);
        if (d < gap) [best, gap] = [i, d];
      }
      select(best);
    };

    const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => place(true));
    resized?.observe(root);
    // the selection changed from outside (a framework re-rendering the attribute)
    const changed = new MutationObserver(() => place());
    changed.observe(root, { attributes: true, attributeFilter: [attr], subtree: true });

    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    requestAnimationFrame(() => place(true));
    return () => {
      resized?.disconnect();
      changed.disconnect();
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKey);
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onUp);
      drop.destroy();
    };
  };
}

/** toolbars and menus: a droplet glides under the hovered item, and swells into a lens on press */
function hoverGroup(itemSelector: string) {
  return (root: HTMLElement) => {
    const drop = new Droplet(root);
    const itemOf = (t: EventTarget | null) => {
      const item = (t as Element | null)?.closest?.<HTMLElement>(itemSelector);
      return item && root.contains(item) && !item.matches(':disabled') ? item : null;
    };
    const show = (e: Event) => {
      const item = itemOf(e.target);
      if (item) drop.to(boxOf(item, root));
    };
    const hide = () => drop.to(null);
    const down = (e: PointerEvent) => itemOf(e.target) && drop.lift(true);
    const up = () => drop.lift(false);
    const blur = (e: FocusEvent) => {
      if (!root.contains(e.relatedTarget as Node | null)) hide();
    };
    root.addEventListener('pointerover', show);
    root.addEventListener('pointerleave', hide);
    root.addEventListener('focusin', show);
    root.addEventListener('focusout', blur);
    root.addEventListener('pointerdown', down);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    return () => {
      root.removeEventListener('pointerover', show);
      root.removeEventListener('pointerleave', hide);
      root.removeEventListener('focusin', show);
      root.removeEventListener('focusout', blur);
      root.removeEventListener('pointerdown', down);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      drop.destroy();
    };
  };
}

/**
 * <label class="dg-switch"><input type="checkbox"> Label</label>: the thumb turns into a glass
 * lens while it is held, and can be dragged across.
 */
function toggleSwitch(label: HTMLElement) {
  const input = label.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!input) return;
  input.setAttribute('role', 'switch');
  let track = label.querySelector<HTMLElement>('.dg-switch__track');
  if (!track) {
    track = span('dg-switch__track');
    track.append(span('dg dg-switch__thumb'));
    input.after(track);
  }
  const thumb = track.querySelector<HTMLElement>('.dg-switch__thumb')!;
  let drag: { id: number; x: number; from: number; pos: number; moved: boolean } | null = null;
  let swallow = false;

  const lift = (on: boolean) => {
    label.toggleAttribute('data-lifted', on);
    refresh(thumb);
  };
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || input.disabled) return;
    drag = { id: e.pointerId, x: e.clientX, from: input.checked ? 1 : 0, pos: 0, moved: false };
    label.setPointerCapture(e.pointerId);
    lift(true);
  };
  const onMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 4) return;
    drag.moved = true;
    label.toggleAttribute('data-dragging', true);
    const travel = Math.max(1, track.clientWidth - thumb.offsetWidth);
    drag.pos = Math.max(0, Math.min(1, drag.from + dx / travel));
    thumb.style.setProperty('--dg-pos', drag.pos.toFixed(3));
  };
  const onUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { moved, pos } = drag;
    drag = null;
    label.removeAttribute('data-dragging');
    thumb.style.removeProperty('--dg-pos');
    lift(false);
    if (!moved) return;
    // dragged: the position decides, and the click that follows must not toggle it back
    swallow = true;
    setTimeout(() => (swallow = false));
    const on = pos > 0.5;
    if (on === input.checked) return;
    input.checked = on;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const onClick = (e: MouseEvent) => {
    if (!swallow) return;
    swallow = false;
    e.preventDefault();
  };
  label.addEventListener('pointerdown', onDown);
  label.addEventListener('pointermove', onMove);
  label.addEventListener('pointerup', onUp);
  label.addEventListener('pointercancel', onUp);
  label.addEventListener('click', onClick);
  return () => {
    label.removeEventListener('pointerdown', onDown);
    label.removeEventListener('pointermove', onMove);
    label.removeEventListener('pointerup', onUp);
    label.removeEventListener('pointercancel', onUp);
    label.removeEventListener('click', onClick);
  };
}

/**
 * <div class="dg-slider"><input type="range"></div>: the native input does the work (pointer,
 * keyboard, forms); the thumb swells into a lens over the track while it is dragged.
 */
function slider(root: HTMLElement) {
  const input = root.querySelector<HTMLInputElement>('input[type="range"]');
  if (!input) return;
  if (!root.querySelector('.dg-slider__track')) {
    const track = span('dg-slider__track');
    track.append(span('dg-slider__fill'));
    input.before(track, span('dg dg-slider__thumb'));
  }
  const thumb = root.querySelector<HTMLElement>('.dg-slider__thumb')!;
  const sync = () => {
    const min = input.min === '' ? 0 : +input.min;
    const max = input.max === '' ? 100 : +input.max;
    root.style.setProperty('--dg-value', String(Math.max(0, Math.min(1, (+input.value - min) / (max - min || 1)))));
  };
  const lift = (on: boolean) => {
    root.toggleAttribute('data-lifted', on);
    refresh(thumb);
  };
  const up = () => {
    lift(false);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', up);
  };
  const down = () => {
    lift(true);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  };
  sync();
  input.addEventListener('input', sync);
  input.addEventListener('change', sync);
  input.addEventListener('pointerdown', down);
  return () => {
    input.removeEventListener('input', sync);
    input.removeEventListener('change', sync);
    input.removeEventListener('pointerdown', down);
    up();
  };
}

let installed = false;

/** registers the components with the runtime (called by deepGlass(): no reliance on import side effects) */
export function installControls(): void {
  if (installed) return;
  installed = true;
  defineControl('.dg-segmented', choiceGroup('radio'));
  defineControl('.dg-tabbar', choiceGroup('tab'));
  defineControl('.dg-toolbar', hoverGroup('button, a, [role="button"]'));
  defineControl('.dg-menu', hoverGroup('[role^="menuitem"], button, a'));
  defineControl('.dg-switch', toggleSwitch);
  defineControl('.dg-slider', slider);
}
