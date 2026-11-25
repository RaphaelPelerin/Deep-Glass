export const sum = (list: number[]) => list.reduce((a, b) => a + b, 0);

/** what column `i` and its neighbors become when its edge moves by `delta`; `room` is what the table has */
export function resizeColumn(widths: number[], mins: number[], fixed: boolean[], i: number, delta: number, room: number): number[] {
  const out = [...widths];
  const total = sum(widths);
  out[i] = Math.max(Math.min(mins[i], widths[i]), widths[i] + delta);
  const change = out[i] - widths[i];
  if (change > 0 && total <= room + 1) {
    // a table that fits keeps fitting: the next columns make room, then it grows
    let need = change;
    for (let j = i + 1; j < out.length && need > 0; j++) {
      if (fixed[j]) continue;
      const given = Math.min(need, Math.max(0, out[j] - mins[j]));
      out[j] -= given;
      need -= given;
    }
  } else if (change < 0) {
    // it does not get narrower than its place: the next column takes what is left
    const gap = Math.min(-change, room - total - change);
    if (gap > 0) {
      const next = out.findIndex((_, j) => j > i && !fixed[j]);
      out[next < 0 ? i : next] += gap;
    }
  }
  return out;
}

/** the columns brought to `room`, in proportion, none under its minimum */
export function fitColumns(widths: number[], mins: number[], fixed: boolean[], room: number): number[] {
  const out = [...widths];
  let free = out.map((_, j) => j).filter((j) => !fixed[j]);
  while (free.length) {
    const rest = room - sum(out.filter((_, j) => !free.includes(j)));
    const ratio = rest / sum(free.map((j) => widths[j]));
    const short = free.filter((j) => widths[j] * ratio < mins[j]);
    if (!short.length) {
      for (const j of free) out[j] = widths[j] * ratio;
      break;
    }
    for (const j of short) out[j] = mins[j];
    free = free.filter((j) => !short.includes(j));
  }
  return out;
}

/** px, unless the header has a `min-width` of its own */
const MIN = 80;

interface Saved {
  widths: number[];
  room: number;
}

/**
 * An edge to drag on every column of a `data-resize` table (or the arrow keys on it; a double click
 * fits what the column holds). Until one is used, the browser lays the columns out.
 */
export function resizable(
  root: HTMLElement,
  el: HTMLTableElement,
  scroller: HTMLElement,
  cells: HTMLTableCellElement[],
  label: (name: string, fallback: string) => string,
  resized: (head: HTMLTableCellElement, widths: number[]) => void,
): () => void {
  if (cells.some((h) => h.colSpan > 1)) return () => {};
  const fixed = cells.map((h) => h.matches('.dg-table__check, [data-resize="none"]'));
  const stop = new AbortController();
  const undo: (() => void)[] = [];
  const handles = new Map<number, HTMLElement>();
  const group = document.createElement('colgroup');
  const theirs = [...el.querySelectorAll(':scope > colgroup')];
  let widths: number[] | null = null;
  let mins: number[] = [];
  /** the widths as they were set, and the room there was: what every other room is fitted from */
  let set: Saved | null = null;
  let room = 0;

  const inside = () => scroller.clientWidth;
  /** the phone layout has no columns */
  const stacked = () => getComputedStyle(el).display === 'block';
  const limits = () =>
    cells.map((h, j) => {
      const own = parseFloat(getComputedStyle(h).minWidth);
      return own > 0 ? own : fixed[j] ? 0 : MIN;
    });
  const place = (...groups: Element[]) => (el.caption ? el.caption.after(...groups) : el.prepend(...groups));

  const draw = () => {
    if (!widths) return;
    const total = sum(widths);
    const cols = [...group.children] as HTMLElement[];
    widths.forEach((w, j) => (cols[j].style.width = `${w}px`));
    root.style.setProperty('--dg-table-width', total > inside() + 1 ? `${total}px` : '100%');
    for (const [j, handle] of handles) {
      handle.setAttribute('aria-valuenow', String(Math.round(widths[j])));
      handle.setAttribute('aria-valuemin', String(Math.round(mins[j])));
    }
  };
  /** from now on the columns are ours */
  const hold = (list?: number[]) => {
    if (widths) return;
    mins = limits();
    widths = list ?? cells.map((h) => h.getBoundingClientRect().width);
    room ||= inside();
    set = { widths, room };
    group.replaceChildren(...cells.map(() => document.createElement('col')));
    for (const g of theirs) g.remove();
    place(group);
    root.setAttribute('data-sized', '');
    draw();
  };
  /** back to the browser */
  const letGo = () => {
    if (!widths) return;
    widths = set = null;
    room = 0;
    group.remove();
    place(...theirs);
    root.removeAttribute('data-sized');
    root.style.removeProperty('--dg-table-width');
  };
  /** how wide a column would be for all it holds */
  const natural = (j: number) => {
    const { scrollLeft, scrollTop } = scroller;
    group.remove();
    root.removeAttribute('data-sized');
    el.style.width = 'max-content';
    const w = Math.ceil(cells[j].getBoundingClientRect().width);
    el.style.width = '';
    place(group);
    root.setAttribute('data-sized', '');
    scroller.scrollTo({ left: scrollLeft, top: scrollTop, behavior: 'instant' });
    return w;
  };

  const key = root.dataset.resize === 'remember' && root.id ? `dg-table:${root.id}` : '';
  const done = (j: number) => {
    if (!widths) return;
    room = inside();
    set = { widths, room };
    if (key) {
      try {
        localStorage.setItem(key, JSON.stringify({ widths: widths.map(Math.round), room } satisfies Saved));
      } catch {
        // no storage: the widths last as long as the page
      }
    }
    resized(cells[j], [...widths]);
  };

  // ---------- the edges ----------

  cells.forEach((head, j) => {
    if (fixed[j]) return;
    // what the header says ends with an ellipsis
    const text = document.createElement('span');
    text.className = 'dg-table__label';
    const holder = head.querySelector(':scope > .dg-table__sort') ?? head;
    text.append(...holder.childNodes);
    holder.append(text);
    // an edge reaches over the next header
    const z = head.style.zIndex;
    head.style.zIndex = String(cells.length - j + 2);

    const handle = document.createElement('span');
    handle.className = 'dg-table__edge';
    handle.tabIndex = 0;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', `${label('resize', 'Resize')} ${text.textContent?.trim() ?? ''}`.trim());
    handle.setAttribute('aria-valuenow', String(Math.round(head.getBoundingClientRect().width)));
    head.append(handle);
    handles.set(j, handle);
    undo.push(() => {
      handle.remove();
      text.replaceWith(...text.childNodes);
      head.style.zIndex = z;
    });
    const on = <E extends Event>(type: string, fn: (e: E) => void) =>
      handle.addEventListener(type, fn as EventListener, { signal: stop.signal });
    const way = () => (getComputedStyle(el).direction === 'rtl' ? -1 : 1);

    let drag: { id: number; x: number; from: number[]; held: boolean; room: number; seen: number } | null = null;
    const move = (delta: number) => {
      const { from, room, seen } = drag!;
      widths = resizeColumn(from, mins, fixed, j, delta, room);
      draw();
      // a narrower table would scroll back under the pointer: it keeps its place until the end
      const pad = seen - sum(widths);
      el.style.borderInlineEnd = pad > 1 ? `${pad}px solid transparent` : '';
      if (pad > 1) root.style.setProperty('--dg-table-width', `${seen}px`);
    };
    const end = (cancel = false) => {
      if (!drag) return;
      const { id, from, held } = drag;
      const changed = !cancel && from.some((w, n) => Math.abs(w - widths![n]) > 0.5);
      drag = null;
      if (handle.hasPointerCapture(id)) handle.releasePointerCapture(id);
      el.style.borderInlineEnd = '';
      root.removeAttribute('data-resizing');
      handle.removeAttribute('data-active');
      if (changed) {
        draw();
        done(j);
      } else if (held) {
        letGo();
      } else {
        widths = from;
        draw();
      }
    };
    on<PointerEvent>('pointerdown', (e) => {
      if (e.button !== 0 || drag) return;
      const held = !widths;
      hold();
      mins = limits();
      const left = Math.abs(scroller.scrollLeft);
      drag = { id: e.pointerId, x: e.clientX, from: widths!, held, room: inside(), seen: left > 0 ? left + inside() : 0 };
      handle.setPointerCapture(e.pointerId);
      // its line goes down to the last row in sight
      const bottom = Math.min(el.getBoundingClientRect().bottom, scroller.getBoundingClientRect().top + scroller.clientHeight);
      handle.style.setProperty('--dg-edge', `${bottom - handle.getBoundingClientRect().top}px`);
      handle.setAttribute('data-active', '');
      root.setAttribute('data-resizing', '');
    });
    on<PointerEvent>('pointermove', (e) => {
      if (drag?.id === e.pointerId) move((e.clientX - drag.x) * way());
    });
    on('pointerup', () => end());
    on('pointercancel', () => end(true));
    on('lostpointercapture', () => end());

    const resize = (to: (width: number) => number) => {
      hold();
      mins = limits();
      const from = widths!;
      widths = resizeColumn(from, mins, fixed, j, to(from[j]) - from[j], inside());
      draw();
      handle.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      done(j);
    };
    on('dblclick', () => resize(() => natural(j)));
    on<KeyboardEvent>('keydown', (e) => {
      if (drag) {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        end(true);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const step = (e.shiftKey ? 64 : 16) * way() * (e.key === 'ArrowRight' ? 1 : -1);
        resize((w) => w + step);
      } else if (e.key === 'Home') {
        resize(() => 0);
      } else if (e.key === 'Enter') {
        resize(() => natural(j));
      } else {
        return;
      }
      e.preventDefault();
    });
  });

  // a table that fitted its place still does when that changes
  const refit = () => {
    if (!widths || root.hasAttribute('data-resizing') || stacked()) return;
    const now = inside();
    if (!now || Math.abs(now - room) < 1) return;
    const total = sum(set!.widths);
    widths = total <= set!.room + 1 || total < now ? fitColumns(set!.widths, mins, fixed, now) : set!.widths;
    room = now;
    draw();
  };
  const watch = new ResizeObserver(refit);
  watch.observe(scroller);

  if (key) {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as Saved | null;
      if (saved?.widths?.length === cells.length && saved.widths.every((w) => w > 0)) {
        room = saved.room;
        hold(saved.widths);
        refit();
      }
    } catch {
      // nothing to bring back
    }
  }

  return () => {
    watch.disconnect();
    stop.abort();
    letGo();
    el.style.borderInlineEnd = '';
    root.removeAttribute('data-resizing');
    for (const f of undo) f();
  };
}
