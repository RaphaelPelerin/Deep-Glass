/** what can be picked in a menu or a list */
export const ITEMS = '[role^="menuitem"], [role="option"], button, a';
const CHECKABLE = '[role="menuitemcheckbox"], [role="menuitemradio"]';
/** between the menu and its trigger, and the edges of the screen, px */
const GAP = 8;

export const canPopover = (): boolean =>
  typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function';

let nextId = 0;
const idOf = (el: HTMLElement) => (el.id ||= `dg-menu-${++nextId}`);
const usable = (item: HTMLElement) =>
  !item.matches(':disabled, [aria-disabled="true"]') && item.getClientRects().length > 0;

/**
 * A menu with the `popover` attribute, opened by a button with `popovertarget`. The browser opens
 * and closes it (click outside, Escape) and keeps it above the page; this places it by its button,
 * moves the focus and the arrow keys through it, and ticks its checkable items.
 */
export function dropdown(root: HTMLElement): () => void {
  if (!canPopover()) return () => {};
  if (!root.hasAttribute('role')) root.setAttribute('role', 'menu');
  root.tabIndex = -1;
  const id = idOf(root);
  const triggers = () => [...document.querySelectorAll<HTMLElement>(`[popovertarget="${CSS.escape(id)}"]`)];
  const items = () => [...root.querySelectorAll<HTMLElement>(ITEMS)].filter(usable);
  let trigger: HTMLElement | null = null;
  let typed = '';
  let typedAt = 0;
  let frame = 0;
  /** opened from the keyboard: the first (or last) item gets the focus */
  let fromKey: 'first' | 'last' | null = null;
  let lastDown: Node | null = null;

  const describe = () => {
    for (const t of triggers()) {
      t.setAttribute('aria-haspopup', root.getAttribute('role') === 'listbox' ? 'listbox' : 'menu');
      t.setAttribute('aria-expanded', String(t === trigger && root.matches(':popover-open')));
    }
  };

  /** below its button, above it when there is no room, always inside the screen */
  const place = () => {
    if (!trigger?.isConnected) return;
    const r = trigger.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = innerHeight;
    if (root.hasAttribute('data-dg-match')) root.style.minWidth = `${Math.round(r.width)}px`;
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
  const follow = (e: Event) => {
    if (e.target instanceof Node && root.contains(e.target)) return;
    if (trigger) {
      const r = trigger.getBoundingClientRect();
      // its button scrolled away: it has nothing to hang from any more
      if (r.bottom < 0 || r.top > innerHeight) {
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
    trigger =
      (e as ToggleEvent & { source?: HTMLElement | null }).source ??
      all.find((t) => t.contains(lastDown)) ??
      all.find((t) => t === document.activeElement) ??
      all[0] ??
      null;
    addEventListener('scroll', follow, true);
    addEventListener('resize', follow);
    // displayed by then, and not painted yet
    frame = requestAnimationFrame(() => {
      if (!root.matches(':popover-open')) return;
      place();
      const list = items();
      for (const item of list) item.tabIndex = -1;
      const chosen = list.find((i) => i.getAttribute('aria-selected') === 'true');
      const first = chosen ?? (fromKey === 'last' ? list.at(-1) : fromKey ? list[0] : null);
      fromKey = null;
      if (first) first.focus();
      else root.focus({ preventScroll: true });
    });
  };
  const after = (e: Event) => {
    if (e.target !== root) return;
    if ((e as ToggleEvent).newState === 'closed') {
      unfollow();
      const focused = document.activeElement;
      if (!focused || focused === document.body || root.contains(focused)) trigger?.focus({ preventScroll: true });
    }
    describe();
  };

  const move = (e: KeyboardEvent) => {
    const list = items();
    if (!list.length) return;
    const at = list.indexOf(document.activeElement as HTMLElement);
    let to: HTMLElement | undefined;
    if (e.key === 'ArrowDown') to = list[(at + 1) % list.length];
    else if (e.key === 'ArrowUp') to = list[at <= 0 ? list.length - 1 : at - 1];
    else if (e.key === 'Home') to = list[0];
    else if (e.key === 'End') to = list.at(-1);
    else if (e.key === 'Tab') {
      root.hidePopover();
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
  };

  const pick = (e: MouseEvent) => {
    const item = (e.target as Element).closest<HTMLElement>(ITEMS);
    if (!item || !root.contains(item)) return;
    if (item.getAttribute('aria-disabled') === 'true') {
      e.preventDefault();
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
    if (role !== 'menuitemcheckbox' && !item.closest('[data-dg-keep]') && root.matches(':popover-open')) {
      root.hidePopover();
    }
  };

  const key = (e: KeyboardEvent) => {
    const t = (e.target as Element | null)?.closest?.<HTMLElement>('[popovertarget]');
    if (!t || t.getAttribute('popovertarget') !== id || root.matches(':popover-open')) return;
    lastDown = t;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      fromKey = e.key === 'ArrowUp' ? 'last' : 'first';
      t.click();
    } else if (e.key === 'Enter' || e.key === ' ') {
      fromKey = 'first';
    }
  };
  const down = (e: PointerEvent) => {
    lastDown = e.target as Node | null;
    fromKey = null;
  };

  root.addEventListener('beforetoggle', before);
  root.addEventListener('toggle', after);
  root.addEventListener('keydown', move);
  root.addEventListener('click', pick);
  document.addEventListener('keydown', key);
  document.addEventListener('pointerdown', down, true);
  describe();
  return () => {
    unfollow();
    root.removeEventListener('beforetoggle', before);
    root.removeEventListener('toggle', after);
    root.removeEventListener('keydown', move);
    root.removeEventListener('click', pick);
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
