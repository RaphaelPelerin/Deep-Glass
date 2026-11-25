/** what can be picked in a menu or a list */
export const ITEMS = '[role^="menuitem"], [role="option"], button, a';
const CHECKABLE = '[role="menuitemcheckbox"], [role="menuitemradio"]';
/** between the menu and its trigger, and the edges of the screen, px */
const GAP = 8;
/** between a menu and its submenu, px */
const SUB_GAP = 4;

export const canPopover = (): boolean =>
  typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function';

/** the menu (or toolbar) an item belongs to: submenus may be nested in their parent's markup */
export const ownerOf = (el: Element | null | undefined): HTMLElement | null =>
  el?.closest<HTMLElement>('.dg-menu, .dg-toolbar') ?? null;
/** the parent menu of a submenu's trigger */
const parentOf = (trigger: Element | null | undefined): HTMLElement | null =>
  trigger?.closest<HTMLElement>('.dg-menu[popover]') ?? null;
/** the submenu a row opens */
const subOf = (item: Element | null | undefined): HTMLElement | null => {
  const id = item?.getAttribute('popovertarget');
  const el = id ? document.getElementById(id) : null;
  return el?.matches('.dg-menu[popover]') ? el : null;
};

/** what opened each menu */
const openers = new WeakMap<HTMLElement, HTMLElement>();
/** which side a submenu opened on: its own submenus go on the same way, not back over the first menu */
const sides = new WeakMap<HTMLElement, 'left' | 'right'>();
/** where the focus goes once a menu is open: its first or last item, or nowhere (opened by hovering) */
const intents = new WeakMap<HTMLElement, 'first' | 'last' | 'stay'>();

let sources: boolean | null = null;
/** can a popover be opened from code as the child of a menu (showPopover({ source }))? */
function canSource(): boolean {
  if (sources !== null) return sources;
  sources = false;
  const probe = document.createElement('div');
  probe.setAttribute('popover', 'manual');
  probe.style.display = 'none';
  document.body.append(probe);
  const options = {
    get source() {
      sources = true;
      return undefined;
    },
  };
  (probe.showPopover as (o?: object) => void)(options);
  probe.remove();
  return sources;
}

/** opens a submenu from its row, its parent stays open */
function openSub(sub: HTMLElement, from: HTMLElement, intent: 'first' | 'stay'): void {
  if (sub.matches(':popover-open')) return;
  const nested = parentOf(from)?.contains(sub);
  // without it, only a real click tells the browser whose child it is
  if (!nested && !canSource() && intent === 'stay') return;
  intents.set(sub, intent);
  openers.set(sub, from);
  if (nested || canSource()) (sub.showPopover as (o?: object) => void)({ source: from });
  else from.click();
}

let nextId = 0;
const idOf = (el: HTMLElement) => (el.id ||= `dg-menu-${++nextId}`);
const usable = (item: HTMLElement) =>
  !item.matches(':disabled, [aria-disabled="true"]') && item.getClientRects().length > 0;

/**
 * A menu with the `popover` attribute, opened by a button with `popovertarget`. The browser opens
 * and closes it (click outside, Escape) and keeps it above the page; this places it by its button,
 * moves the focus and the arrow keys through it, and ticks its checkable items. Opened by a row of
 * another menu, it is a submenu: it opens beside it, on hover too.
 */
export function dropdown(root: HTMLElement): () => void {
  if (!canPopover()) return () => {};
  if (!root.hasAttribute('role')) root.setAttribute('role', 'menu');
  root.tabIndex = -1;
  const id = idOf(root);
  const triggers = () => [...document.querySelectorAll<HTMLElement>(`[popovertarget="${CSS.escape(id)}"]`)];
  const items = () => [...root.querySelectorAll<HTMLElement>(ITEMS)].filter((i) => ownerOf(i) === root && usable(i));
  let trigger: HTMLElement | null = null;
  let typed = '';
  let typedAt = 0;
  let frame = 0;
  let lastDown: Node | null = null;

  const describe = () => {
    for (const t of triggers()) {
      t.setAttribute('aria-haspopup', root.getAttribute('role') === 'listbox' ? 'listbox' : 'menu');
      const was = t.getAttribute('aria-expanded') === 'true';
      const is = t === trigger && root.matches(':popover-open');
      t.setAttribute('aria-expanded', String(is));
      if (!parentOf(t)) continue;
      // hovering its row opened it: the click must not close it
      t.setAttribute('popovertargetaction', 'show');
      // its row was held by the drop of the parent menu
      if (was && !is) t.dispatchEvent(new Event('dg:collapse'));
    }
  };

  /** below its button, above it when there is no room, always inside the screen */
  const place = () => {
    if (!trigger?.isConnected) return;
    const r = trigger.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = innerHeight;
    if (root.hasAttribute('data-dg-match')) root.style.minWidth = `${Math.round(r.width)}px`;
    const parent = parentOf(trigger);
    if (parent) {
      beside(r, parent, vw, vh);
      return;
    }
    const below = vh - r.bottom - GAP * 2;
    const above = r.top - GAP * 2;
    root.style.setProperty('--dg-menu-max', `${Math.max(below, above, 120)}px`);
    const flip = root.offsetHeight > below && above > below;
    root.style.setProperty('--dg-menu-max', `${Math.max(flip ? above : below, 120)}px`);
    const w = root.offsetWidth;
    const h = root.offsetHeight;
    const rtl = getComputedStyle(trigger).direction === 'rtl';
    const align = root.dataset.align ?? 'start';
    const toLeft = (align === 'start') !== rtl;
    let x = align === 'center' ? r.left + (r.width - w) / 2 : toLeft ? r.left : r.right - w;
    x = Math.max(GAP, Math.min(x, vw - w - GAP));
    let y = flip ? r.top - GAP - h : r.bottom + GAP;
    y = Math.max(GAP, Math.min(y, vh - h - GAP));
    root.style.left = `${Math.round(x)}px`;
    root.style.top = `${Math.round(y)}px`;
    // it grows out of its button
    root.style.transformOrigin = `${Math.round(r.left + r.width / 2 - x)}px ${flip ? '100%' : '0'}`;
  };
  /** a submenu: beside its parent, its first row facing the row that opened it */
  const beside = (r: DOMRect, parent: HTMLElement, vw: number, vh: number) => {
    const p = parent.getBoundingClientRect();
    root.style.setProperty('--dg-menu-max', `${vh - GAP * 2}px`);
    const w = root.offsetWidth;
    const h = root.offsetHeight;
    const right = p.right + SUB_GAP;
    const left = p.left - SUB_GAP - w;
    const fitsRight = right + w <= vw - GAP;
    const fitsLeft = left >= GAP;
    const side = sides.get(parent) ?? (getComputedStyle(root).direction === 'rtl' ? 'left' : 'right');
    const toRight = side === 'left' ? !fitsLeft && fitsRight : fitsRight || !fitsLeft;
    sides.set(root, toRight ? 'right' : 'left');
    // no room on either side (phones): over its parent, under the row
    const over = !fitsRight && !fitsLeft;
    let x = over ? p.left + 20 : toRight ? right : left;
    x = Math.max(GAP, Math.min(x, vw - w - GAP));
    let y = over ? r.bottom + 2 : r.top - (parseFloat(getComputedStyle(root).paddingTop) || 0);
    y = Math.max(GAP, Math.min(y, vh - h - GAP));
    root.style.left = `${Math.round(x)}px`;
    root.style.top = `${Math.round(y)}px`;
    root.style.transformOrigin = over ? '30% 0' : `${toRight ? '0' : '100%'} ${Math.round(r.top + r.height / 2 - y)}px`;
  };
  const follow = (e: Event) => {
    if (e.target instanceof Node && root.contains(e.target)) return;
    if (trigger) {
      const r = trigger.getBoundingClientRect();
      const clip = trigger.closest('.dg-menu__scroll')?.getBoundingClientRect();
      // its button scrolled away: it has nothing to hang from any more
      if (r.bottom < (clip?.top ?? 0) || r.top > (clip?.bottom ?? innerHeight)) {
        root.hidePopover();
        return;
      }
    }
    place();
  };
  const unfollow = () => {
    cancelAnimationFrame(frame);
    removeEventListener('scroll', follow, true);
    removeEventListener('resize', follow);
  };

  const before = (e: Event) => {
    if (e.target !== root || (e as ToggleEvent).newState !== 'open') return;
    const all = triggers();
    const hint = openers.get(root);
    trigger =
      (e as ToggleEvent & { source?: HTMLElement | null }).source ??
      all.find((t) => t === hint) ??
      all.find((t) => t.contains(lastDown)) ??
      all.find((t) => t === document.activeElement) ??
      all[0] ??
      null;
    if (trigger) openers.set(root, trigger);
    addEventListener('scroll', follow, true);
    addEventListener('resize', follow);
    // displayed by then, and not painted yet
    frame = requestAnimationFrame(() => {
      if (!root.matches(':popover-open')) return;
      place();
      describe();
      const list = items();
      for (const item of list) item.tabIndex = -1;
      const intent = intents.get(root);
      intents.delete(root);
      const chosen = list.find((i) => i.getAttribute('aria-selected') === 'true');
      const first = chosen ?? (intent === 'last' ? list.at(-1) : intent === 'first' ? list[0] : null);
      if (first) first.focus();
      // a submenu opened with the pointer leaves the focus in its parent
      else if (intent !== 'stay' && !parentOf(trigger)) root.focus({ preventScroll: true });
    });
  };
  const after = (e: Event) => {
    if (e.target !== root) return;
    if ((e as ToggleEvent).newState === 'closed') {
      unfollow();
      clearTimeout(timer);
      // its row, or when the whole chain closes, the button that opened the first menu
      let back = trigger;
      for (let p = parentOf(back); p && !p.matches(':popover-open'); p = parentOf(back)) back = openers.get(p) ?? null;
      openers.delete(root);
      const focused = document.activeElement;
      if (!focused || focused === document.body || root.contains(focused)) back?.focus({ preventScroll: true });
    }
    describe();
  };

  /** picking an item closes the whole chain of menus */
  const closeAll = () => {
    let top = root;
    for (let p = parentOf(trigger); p && p !== top; p = parentOf(openers.get(p))) top = p;
    if (top.matches(':popover-open')) top.hidePopover();
  };
  /** the submenu that is open, and its row */
  const opened = () => {
    for (const row of root.querySelectorAll<HTMLElement>('[popovertarget]')) {
      const sub = ownerOf(row) === root ? subOf(row) : null;
      if (sub?.matches(':popover-open')) return { row, sub };
    }
    return null;
  };
  const closeSub = (except?: Element | null) => {
    const o = opened();
    if (o && o.row !== except) o.sub.hidePopover();
  };

  const move = (e: KeyboardEvent) => {
    if (ownerOf(e.target as Element) !== root) return;
    const list = items();
    if (!list.length) return;
    const at = list.indexOf(document.activeElement as HTMLElement);
    const rtl = getComputedStyle(root).direction === 'rtl';
    if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) {
      const sub = subOf(list[at]);
      if (!sub) return;
      e.preventDefault();
      if (sub.matches(':popover-open')) {
        [...sub.querySelectorAll<HTMLElement>(ITEMS)].find((i) => ownerOf(i) === sub && usable(i))?.focus();
      } else {
        openSub(sub, list[at], 'first');
      }
      return;
    }
    if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) {
      if (!parentOf(trigger)) return;
      e.preventDefault();
      trigger?.focus();
      root.hidePopover();
      return;
    }
    let to: HTMLElement | undefined;
    if (e.key === 'ArrowDown') to = list[(at + 1) % list.length];
    else if (e.key === 'ArrowUp') to = list[at <= 0 ? list.length - 1 : at - 1];
    else if (e.key === 'Home') to = list[0];
    else if (e.key === 'End') to = list.at(-1);
    else if (e.key === 'Tab') {
      closeAll();
      return;
    } else if ((e.key === 'Enter' || e.key === ' ') && at >= 0) {
      // buttons click on their own
      if (list[at].tagName === 'BUTTON' || (e.key === 'Enter' && list[at].tagName === 'A')) return;
      e.preventDefault();
      list[at].click();
      return;
    } else if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // type the start of a label to reach it
      if (e.timeStamp - typedAt > 600) typed = '';
      typedAt = e.timeStamp;
      typed += e.key.toLowerCase();
      const from = typed.length === 1 ? at + 1 : Math.max(at, 0);
      to = [...list.slice(from), ...list.slice(0, from)].find((i) =>
        (i.textContent ?? '').trim().toLowerCase().startsWith(typed),
      );
    }
    if (!to) return;
    e.preventDefault();
    to.focus();
    closeSub(to);
  };

  // ---------- submenus open under the pointer ----------

  let timer: ReturnType<typeof setTimeout> | undefined;
  let hovered: HTMLElement | null = null;
  let px = 0;
  let py = 0;
  const hover = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const x = e.clientX;
    const y = e.clientY;
    const fromX = px;
    const fromY = py;
    px = x;
    py = y;
    if (ownerOf(e.target as Element) !== root) {
      // in a submenu nested in this one
      clearTimeout(timer);
      hovered = null;
      return;
    }
    const at = (e.target as Element).closest<HTMLElement>(ITEMS);
    const item = at && usable(at) ? at : null;
    const o = opened();
    // on its way to the open submenu, across other rows: let it through
    let aiming = false;
    if (o && item !== o.row) {
      const s = o.sub.getBoundingClientRect();
      const dir = s.left + s.width / 2 > x ? 1 : -1;
      const edge = dir > 0 ? s.left : s.right;
      const dx = (x - fromX) * dir;
      if (dx > 0) {
        const hit = fromY + ((edge - fromX) * dir * (y - fromY)) / dx;
        aiming = hit > s.top - 24 && hit < s.bottom + 24;
      }
    }
    if (item === hovered && !aiming) return;
    hovered = item;
    clearTimeout(timer);
    if (o && item === o.row) return;
    if (!item && !aiming) return;
    timer = setTimeout(
      () => {
        if (!root.matches(':popover-open') || !hovered?.matches(':hover')) return;
        closeSub(hovered);
        const sub = subOf(hovered);
        if (sub) openSub(sub, hovered, 'stay');
      },
      aiming ? 320 : 110,
    );
  };
  const leave = () => {
    clearTimeout(timer);
    hovered = null;
  };

  const pick = (e: MouseEvent) => {
    const item = (e.target as Element).closest<HTMLElement>(ITEMS);
    if (!item || ownerOf(item) !== root) return;
    if (item.getAttribute('aria-disabled') === 'true') {
      e.preventDefault();
      return;
    }
    // the row of a submenu: the browser opens it
    if (subOf(item)) {
      clearTimeout(timer);
      return;
    }
    const role = item.getAttribute('role');
    if (item.matches(CHECKABLE)) {
      const was = item.getAttribute('aria-checked') === 'true';
      if (role === 'menuitemradio') {
        // a radio group: the radios next to it, up to a separator
        for (const dir of ['previousElementSibling', 'nextElementSibling'] as const) {
          for (let s = item[dir]; s?.getAttribute('role') === 'menuitemradio'; s = s[dir]) {
            s.setAttribute('aria-checked', 'false');
          }
        }
      }
      const checked = role === 'menuitemradio' || !was;
      item.setAttribute('aria-checked', String(checked));
      if (checked !== was) {
        const value = item.dataset.value ?? item.textContent?.trim() ?? '';
        root.dispatchEvent(new CustomEvent('dg:change', { bubbles: true, detail: { value, checked } }));
      }
    }
    const keep = item.closest('[data-dg-keep]');
    if (role !== 'menuitemcheckbox' && !(keep && root.contains(keep))) closeAll();
  };

  const key = (e: KeyboardEvent) => {
    const t = (e.target as Element | null)?.closest?.<HTMLElement>('[popovertarget]');
    if (!t || t.getAttribute('popovertarget') !== id || root.matches(':popover-open')) return;
    lastDown = t;
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !parentOf(t)) {
      e.preventDefault();
      intents.set(root, e.key === 'ArrowUp' ? 'last' : 'first');
      t.click();
    } else if (e.key === 'Enter' || e.key === ' ') {
      intents.set(root, 'first');
    }
  };
  const down = (e: PointerEvent) => {
    lastDown = e.target as Node | null;
    if (!root.matches(':popover-open')) intents.delete(root);
  };

  root.addEventListener('beforetoggle', before);
  root.addEventListener('toggle', after);
  root.addEventListener('keydown', move);
  root.addEventListener('click', pick);
  root.addEventListener('pointermove', hover);
  root.addEventListener('pointerleave', leave);
  document.addEventListener('keydown', key);
  document.addEventListener('pointerdown', down, true);
  describe();
  return () => {
    unfollow();
    root.removeEventListener('beforetoggle', before);
    root.removeEventListener('toggle', after);
    root.removeEventListener('keydown', move);
    clearTimeout(timer);
    root.removeEventListener('click', pick);
    root.removeEventListener('pointermove', hover);
    root.removeEventListener('pointerleave', leave);
    document.removeEventListener('keydown', key);
    document.removeEventListener('pointerdown', down, true);
  };
}

/**
 * <div class="dg dg-select"><select>…</select></div>: the native select keeps the value (forms,
 * validation, `change` events); a button shows it and opens its options in a glass list.
 */
export function select(root: HTMLElement): () => void {
  const native = root.querySelector<HTMLSelectElement>(':scope > select');
  if (!native || native.multiple || !canPopover()) return () => {};
  const list = document.createElement('div');
  list.className = 'dg dg-menu dg-select__list';
  list.setAttribute('popover', '');
  list.setAttribute('role', 'listbox');
  list.setAttribute('data-dg-match', '');
  const scroll = document.createElement('div');
  scroll.className = 'dg-menu__scroll';
  scroll.setAttribute('role', 'presentation');
  list.append(scroll);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'dg-select__button';
  button.setAttribute('popovertarget', idOf(list));
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  const value = document.createElement('span');
  value.className = 'dg-select__value';
  const chevron = document.createElement('span');
  chevron.className = 'dg-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  button.append(value, chevron);

  const label = () => native.getAttribute('aria-label') ?? native.labels?.[0]?.textContent?.trim() ?? '';
  /** the option each row stands for */
  const options = new Map<Element, HTMLOptionElement>();

  const sync = () => {
    const chosen = native.selectedOptions[0];
    value.textContent = chosen?.label ?? '';
    const name = label();
    if (name) {
      button.setAttribute('aria-label', `${name}: ${chosen?.label ?? ''}`);
      list.setAttribute('aria-label', name);
    }
    button.disabled = native.matches(':disabled');
    for (const [row, o] of options) row.setAttribute('aria-selected', String(o === chosen));
  };
  const fill = () => {
    options.clear();
    scroll.textContent = '';
    const add = (o: HTMLOptionElement) => {
      if (o.hidden) return;
      const row = document.createElement('div');
      row.setAttribute('role', 'option');
      row.tabIndex = -1;
      row.textContent = o.label;
      if (o.matches(':disabled')) row.setAttribute('aria-disabled', 'true');
      options.set(row, o);
      scroll.append(row);
    };
    for (const child of native.children) {
      if (child instanceof HTMLOptionElement) add(child);
      else if (child instanceof HTMLOptGroupElement) {
        const head = document.createElement('div');
        head.className = 'dg-menu__label';
        head.setAttribute('role', 'presentation');
        head.textContent = child.label;
        scroll.append(head);
        for (const o of child.children) if (o instanceof HTMLOptionElement) add(o);
      }
    }
    sync();
  };

  const click = (e: MouseEvent) => {
    const row = (e.target as Element).closest('[role="option"]');
    const o = row && options.get(row);
    if (!o || o.selected || row.getAttribute('aria-disabled') === 'true') return;
    o.selected = true;
    sync();
    native.dispatchEvent(new Event('input', { bubbles: true }));
    native.dispatchEvent(new Event('change', { bubbles: true }));
  };
  // a value set from code fires no event: it is read again as the list opens
  const opening = (e: Event) => {
    if ((e as ToggleEvent).newState === 'open') sync();
  };
  const focus = () => button.focus();
  const reset = () => setTimeout(sync);
  const changes = new MutationObserver(fill);

  list.addEventListener('click', click);
  list.addEventListener('beforetoggle', opening);
  native.addEventListener('change', sync);
  native.addEventListener('focus', focus);
  const form = native.form;
  form?.addEventListener('reset', reset);
  const tab = native.getAttribute('tabindex');
  native.tabIndex = -1;
  native.setAttribute('aria-hidden', 'true');
  changes.observe(native, { childList: true, subtree: true, attributes: true, characterData: true });
  root.append(button, list);
  fill();
  return () => {
    changes.disconnect();
    native.removeEventListener('change', sync);
    native.removeEventListener('focus', focus);
    form?.removeEventListener('reset', reset);
    native.removeAttribute('aria-hidden');
    if (tab === null) native.removeAttribute('tabindex');
    else native.setAttribute('tabindex', tab);
    button.remove();
    list.remove();
  };
}
