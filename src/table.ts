import { Droplet } from './controls';

type Direction = 'ascending' | 'descending';

const collator = typeof Intl === 'undefined' ? null : new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
/** without accents nor case, to search */
const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

/** "1 234,50 €", "$1,234.50", "-3%": the number in a text, NaN when there is none */
export function numberIn(text: string): number {
  let s = text.replace(/[\s  '’]/g, '').replace(/−/g, '-');
  s = s.match(/-?[\d.,]*\d/)?.[0] ?? '';
  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    // the last one is the decimal mark
    s = comma > dot ? s.replaceAll('.', '').replace(',', '.') : s.replaceAll(',', '');
  } else if (comma >= 0) {
    // "1,234" is a thousand, "1,5" one and a half
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replaceAll(',', '') : s.replace(',', '.');
  } else if (s.indexOf('.') !== dot) {
    s = s.replaceAll('.', '');
  }
  return s ? Number(s) : NaN;
}

/** what a cell is sorted by: its `data-value`, else what it shows */
function keyOf(cell: HTMLTableCellElement | undefined, kind: string): string | number {
  const text = cell?.dataset.value ?? cell?.textContent?.trim() ?? '';
  if (kind === 'number') return numberIn(text);
  if (kind === 'date') return Date.parse(cell?.dataset.value ?? cell?.querySelector('time')?.dateTime ?? text);
  return text;
}

function compare(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator ? collator.compare(String(a), String(b)) : String(a) < String(b) ? -1 : 1;
}

/**
 * <div class="dg dg-table"><div class="dg-table__scroll"><table>…</table></div></div>
 *
 * A drop glides under the hovered row. `th[data-sort]` sorts (text, number or date), `data-select`
 * adds a checkbox per row, `data-page-size` splits the rows into pages, and any input with
 * `data-dg-search="<id of the table>"` filters them. Rows added or changed later are picked up.
 */
export function table(root: HTMLElement): (() => void) | void {
  const el = root.querySelector('table');
  const body = el?.tBodies[0];
  if (!el || !body) return;
  const scroller = root.querySelector<HTMLElement>('.dg-table__scroll') ?? root;
  const label = (name: string, fallback: string) => root.getAttribute(`data-label-${name}`) ?? fallback;
  const undo: (() => void)[] = [];
  const on = <E extends Event>(target: EventTarget, type: string, fn: (e: E) => void, capture = false) => {
    target.addEventListener(type, fn as EventListener, capture);
    undo.push(() => target.removeEventListener(type, fn as EventListener, capture));
  };
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string) => {
    const node = document.createElement(tag);
    node.className = className;
    undo.push(() => node.remove());
    return node;
  };
  const emit = (type: string, detail: object, cancelable = false) =>
    root.dispatchEvent(new CustomEvent(type, { bubbles: true, cancelable, detail }));
  const rows = () => [...body.rows];
  const heads = () => [...(el.tHead?.rows[el.tHead.rows.length - 1]?.cells ?? [])];

  // ---------- the row under the pointer ----------

  const drop = new Droplet(scroller);
  undo.push(() => drop.destroy());
  let hovered: HTMLElement | null = null;
  const highlight = (row: HTMLElement | null, immediate = false) => {
    hovered = row;
    if (!row) {
      drop.to(null);
      return;
    }
    const r = row.getBoundingClientRect();
    const o = scroller.getBoundingClientRect();
    // the part of the row below a fixed header
    const top = Math.max(r.top, scroller.scrollTop > 0 && el.tHead ? (el.tHead.rows[0]?.cells[0]?.getBoundingClientRect().bottom ?? r.top) : r.top);
    const h = r.bottom - top;
    drop.to(
      h < 2
        ? null
        : {
            x: r.left - o.left - scroller.clientLeft + scroller.scrollLeft,
            y: top - o.top - scroller.clientTop + scroller.scrollTop,
            w: r.width,
            h,
          },
      immediate,
    );
  };
  /** it must not stay where rows are gone: it would leave room to scroll there */
  const unhighlight = () => {
    hovered = null;
    drop.to({ x: 0, y: 0, w: 1, h: 1 }, true);
    drop.to(null);
  };
  const rowOf = (t: EventTarget | null) => {
    const row = (t as Element | null)?.closest?.('tr');
    return row?.parentElement === body ? row : null;
  };
  on<PointerEvent>(body, 'pointerover', (e) => {
    const row = rowOf(e.target);
    if (row && row !== hovered && e.pointerType !== 'touch') highlight(row);
  });
  on(root, 'pointerleave', () => highlight(null));
  on(el.tHead ?? el, 'pointerenter', () => el.tHead && highlight(null));

  // ---------- rows: filtered, sorted, split into pages ----------

  let query = '';
  let page = 0;
  let sorted: { head: HTMLTableCellElement; direction: Direction } | null = null;
  /** the order the rows came in */
  let order = 0;
  const came = new WeakMap<Element, number>();
  /** the page sorts the rows itself (it prevented dg:sort) */
  let external = false;
  /** our own changes to the rows, not to be picked up again */
  let mine = false;

  const size = () => Math.max(0, Number(root.dataset.pageSize) || 0);
  const matching = () => {
    const words = plain(query).split(/\s+/).filter(Boolean);
    if (!words.length) return rows();
    return rows().filter((row) => {
      const text = plain([...row.cells].map((c) => c.textContent).join(' '));
      return words.every((w) => text.includes(w));
    });
  };

  const empty = make('p', 'dg-table__empty');
  empty.hidden = true;
  empty.setAttribute('role', 'status');
  const foot = make('div', 'dg-table__foot');
  foot.hidden = true;
  const picked = make('span', 'dg-table__picked');
  const range = make('span', 'dg-table__range');
  range.setAttribute('role', 'status');
  const turn = (name: 'prev' | 'next', text: string, by: number) => {
    const b = make('button', `dg-table__turn dg-table__turn--${name}`);
    b.type = 'button';
    b.setAttribute('aria-label', label(name, text));
    on(b, 'click', () => {
      page += by;
      unhighlight();
      render();
      scroller.scrollTop = 0;
      emit('dg:page', { page });
    });
    return b;
  };
  const prev = turn('prev', 'Previous page', -1);
  const next = turn('next', 'Next page', 1);
  foot.append(picked, range, prev, next);
  root.append(empty, foot);

  const render = () => {
    mine = true;
    const all = rows();
    const found = new Set(matching());
    const list = all.filter((r) => found.has(r));
    const per = size();
    const pages = per ? Math.max(1, Math.ceil(list.length / per)) : 1;
    page = Math.max(0, Math.min(page, pages - 1));
    const first = per ? page * per : 0;
    const shown = new Set(per ? list.slice(first, first + per) : list);
    for (const row of all) row.toggleAttribute('data-dg-out', !shown.has(row));

    empty.hidden = list.length > 0;
    empty.textContent = label('empty', 'No results');
    const count = all.filter((r) => r.hasAttribute('data-selected')).length;
    picked.textContent = count ? `${count} ${label('selected', 'selected')}` : '';
    range.textContent = per && list.length ? `${first + 1}–${first + shown.size} / ${list.length}` : '';
    prev.hidden = next.hidden = pages < 2;
    prev.disabled = page === 0;
    next.disabled = page >= pages - 1;
    foot.hidden = !count && (!per || !list.length || (pages < 2 && all.length <= per));
    syncAll(shown);
    // the records of these changes come in a microtask
    queueMicrotask(() => {
      watch.takeRecords();
      mine = false;
    });
  };

  const sort = () => {
    const list = rows();
    if (sorted) {
      const { head, direction } = sorted;
      const kind = head.dataset.sort || 'text';
      const at = head.cellIndex;
      const keys = new Map(list.map((r) => [r, keyOf(r.cells[at], kind)]));
      const sign = direction === 'ascending' ? 1 : -1;
      const blank = (k: string | number) => k === '' || Number.isNaN(k);
      list.sort((a, b) => {
        const x = keys.get(a)!;
        const y = keys.get(b)!;
        // empty cells last, both ways
        if (blank(x) || blank(y)) return Number(blank(x)) - Number(blank(y)) || came.get(a)! - came.get(b)!;
        return sign * compare(x, y) || came.get(a)! - came.get(b)!;
      });
    } else {
      list.sort((a, b) => came.get(a)! - came.get(b)!);
    }
    if (list.some((r, i) => body.rows[i] !== r)) body.append(...list);
  };

  // ---------- sorting ----------

  const mark = () => {
    for (const head of heads()) {
      if (!head.hasAttribute('data-sort')) continue;
      head.setAttribute('aria-sort', sorted?.head === head ? sorted.direction : 'none');
    }
  };
  for (const head of heads()) {
    if (!head.hasAttribute('data-sort')) continue;
    if (head.dataset.sort === 'number') head.setAttribute('data-num', '');
    const button = make('button', 'dg-table__sort');
    button.type = 'button';
    // what the header holds moves into its button, and back
    button.append(...head.childNodes);
    head.append(button);
    undo.unshift(() => button.replaceWith(...button.childNodes));
    on(button, 'click', () => {
      const was = sorted?.head === head ? sorted.direction : null;
      const direction: Direction | null = was === null ? 'ascending' : was === 'ascending' ? 'descending' : null;
      // prevented: the page sorts its own data (frameworks)
      const go = emit('dg:sort', { column: head.cellIndex - offset(), direction }, true);
      sorted = direction ? { head, direction } : null;
      mark();
      unhighlight();
      external = !go;
      if (external) return;
      mine = true;
      sort();
      page = 0;
      render();
    });
    if (head.getAttribute('aria-sort') === 'ascending' || head.getAttribute('aria-sort') === 'descending') {
      sorted = { head, direction: head.getAttribute('aria-sort') as Direction };
    }
  }
  mark();

  // ---------- selection ----------

  const selectable = root.hasAttribute('data-select') && !!el.tHead;
  const offset = () => (selectable ? 1 : 0);
  let master: HTMLInputElement | null = null;
  let last: HTMLTableRowElement | null = null;
  const check = (text: string) => {
    const box = document.createElement('input');
    box.className = 'dg-check';
    box.type = 'checkbox';
    box.setAttribute('aria-label', text);
    return box;
  };
  const boxOf = (row: HTMLTableRowElement) => row.querySelector<HTMLInputElement>(':scope > .dg-table__check > input');
  const pick = (row: HTMLTableRowElement, yes: boolean) => {
    row.toggleAttribute('data-selected', yes);
    const box = boxOf(row);
    if (box) box.checked = yes;
  };
  const changed = () => {
    render();
    emit('dg:select', { rows: rows().filter((r) => r.hasAttribute('data-selected')) });
  };
  function syncAll(shown: Set<HTMLTableRowElement>) {
    if (!master) return;
    const on = [...shown].filter((r) => r.hasAttribute('data-selected')).length;
    master.checked = on > 0 && on === shown.size;
    master.indeterminate = on > 0 && on < shown.size;
    master.disabled = !shown.size;
  }
  if (selectable) {
    const head = heads()[0]?.parentElement as HTMLTableRowElement;
    const th = make('th', 'dg-table__check');
    th.scope = 'col';
    master = check(label('all', 'Select all'));
    th.append(master);
    head.prepend(th);
    on(master, 'change', () => {
      const yes = master!.checked;
      for (const row of rows()) if (!row.hasAttribute('data-dg-out')) pick(row, yes);
      changed();
    });
    on<MouseEvent>(body, 'click', (e) => {
      const box = e.target as HTMLInputElement;
      const row = rowOf(box);
      if (!row || box !== boxOf(row)) return;
      // shift: everything from the last one
      const list = rows().filter((r) => !r.hasAttribute('data-dg-out'));
      const from = last ? list.indexOf(last) : -1;
      const to = list.indexOf(row);
      if (e.shiftKey && from >= 0) {
        for (const r of list.slice(Math.min(from, to), Math.max(from, to) + 1)) pick(r, box.checked);
      } else {
        pick(row, box.checked);
      }
      last = row;
      changed();
    });
  }

  /** rows that just came: their place, their checkbox, the labels of their cells */
  const adopt = () => {
    mine = true;
    const names = heads().map((h) => h.textContent?.trim() ?? '');
    const numbers = heads().map((h) => h.hasAttribute('data-num'));
    for (const row of rows()) {
      if (!came.has(row)) came.set(row, order++);
      if (selectable && !boxOf(row)) {
        const td = document.createElement('td');
        td.className = 'dg-table__check';
        const box = check(label('row', 'Select'));
        box.checked = row.hasAttribute('data-selected');
        td.append(box);
        row.prepend(td);
      }
      for (const cell of row.cells) {
        const i = cell.cellIndex;
        if (names[i] && cell.dataset.label !== names[i]) cell.dataset.label = names[i];
        if (numbers[i]) cell.setAttribute('data-num', '');
      }
    }
  };

  // ---------- search, scrolling, rows changed from outside ----------

  on<Event>(document, 'input', (e) => {
    const input = e.target as HTMLInputElement;
    if (!root.id || input.dataset?.dgSearch !== root.id) return;
    query = input.value;
    page = 0;
    unhighlight();
    render();
  });
  // rows end where the header begins: it stays clear glass, with nothing to frost under it
  const scrolled = () => {
    const y = scroller.scrollTop;
    root.toggleAttribute('data-scrolled', y > 0);
    body.style.clipPath = y > 0 && el.tHead ? `inset(${y}px -1px -1px)` : '';
    if (hovered) highlight(hovered, true);
  };
  on(scroller, 'scroll', scrolled);

  const watch = new MutationObserver(() => {
    if (mine) return;
    // a cell being typed in: its row stays put
    const typing = (document.activeElement as HTMLElement | null)?.isContentEditable && body.contains(document.activeElement);
    unhighlight();
    adopt();
    if (!external && !typing) sort();
    render();
  });
  watch.observe(body, { childList: true, subtree: true, characterData: true });
  const settings = new MutationObserver(() => {
    unhighlight();
    render();
  });
  settings.observe(root, { attributes: true, attributeFilter: ['data-page-size'] });
  // its rows moved: the highlight would stay behind
  const resized = new ResizeObserver(() => hovered && highlight(hovered, true));
  resized.observe(el);
  undo.push(() => {
    resized.disconnect();
    watch.disconnect();
    settings.disconnect();
    body.style.clipPath = '';
    root.removeAttribute('data-scrolled');
    for (const row of rows()) {
      row.removeAttribute('data-dg-out');
      row.querySelector(':scope > .dg-table__check')?.remove();
    }
  });

  adopt();
  if (sorted) sort();
  for (const input of document.querySelectorAll<HTMLInputElement>('[data-dg-search]')) {
    if (root.id && input.dataset.dgSearch === root.id) query = input.value;
  }
  render();
  return () => {
    for (const f of undo) f();
  };
}
