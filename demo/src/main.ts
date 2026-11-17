import '@fontsource-variable/inter';
import 'vitre/style.css';
import './style.css';
import { toast, vitre } from 'vitre';
import { hydrateIcons, icon } from './icons';

hydrateIcons();
// ?frosted shows what Safari and Firefox get
const glass = vitre({ refraction: !new URLSearchParams(location.search).has('frosted') });

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const iconNode = (name: string) => {
  const t = document.createElement('template');
  t.innerHTML = icon(name);
  return t.content.firstElementChild!;
};

// ---------- what the browser can do ----------

if (!glass.refraction) {
  const support = $('#support');
  support.querySelector('span')!.textContent = 'Frosted here: open in Chrome or Edge to see it bend';
  support.classList.add('vitre--dark');
}

// ---------- wallpapers: the tab bar ----------

$('#wallpapers').addEventListener('vitre:change', (e) => {
  document.body.dataset.wallpaper = (e as CustomEvent<{ value: string }>).detail.value;
});

// ---------- toasts, sheet, copy ----------

document.addEventListener('click', (e) => {
  const el = (e.target as Element).closest<HTMLElement>('[data-toast]');
  if (el && !(el as HTMLButtonElement).disabled) toast(el.dataset.toast!, { icon: iconNode('check') });
});

let toasts = 0;
const messages = ['Glass, delivered', 'Still glass', 'Very glassy', 'Look at that rim'];
$('#show-toast').addEventListener('click', () => toast(messages[toasts++ % messages.length], { icon: iconNode('sparkle') }));

const sheet = $<HTMLDialogElement>('#sheet');
$('#open-sheet').addEventListener('click', () => sheet.showModal());
sheet.addEventListener('click', (e) => {
  // a click on the backdrop closes it
  if (e.target === sheet) sheet.close();
});

$('#install').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText('npm i vitre');
    toast('Install command copied', { icon: iconNode('copy') });
  } catch {
    toast('Copy failed: select it instead');
  }
});

// chips: toggle
$('#chips').addEventListener('click', (e) => {
  const chip = (e.target as Element).closest<HTMLElement>('.vitre-chip');
  if (chip) chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true'));
});

// ---------- optics: page-wide settings ----------

for (const input of document.querySelectorAll<HTMLInputElement>('input[data-var]')) {
  input.addEventListener('input', () => {
    document.documentElement.style.setProperty(input.dataset.var!, input.value);
    glass.refresh();
  });
}

// ---------- the lens: drag it over anything ----------

const lens = $('#lens');
const home = { x: 0, y: 0 };
const pos = { x: 0, y: 0 };
const vel = { x: 0, y: 0 };
let target = { x: 0, y: 0 };
let grab: { id: number; dx: number; dy: number } | null = null;
let frame = 0;
let last = 0;

const place = () => {
  // tilts and stretches with its speed, like something heavy and soft
  const speed = Math.hypot(vel.x, vel.y);
  const stretch = Math.min(0.18, speed / 5000);
  const angle = Math.atan2(vel.y, vel.x);
  lens.style.transform =
    `translate(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px) rotate(${angle}rad) scale(${1 + stretch}, ${1 - stretch * 0.5}) rotate(${-angle}rad)` +
    (grab ? ' scale(1.04)' : '');
};

const step = (now: number) => {
  frame = 0;
  const dt = Math.min(1 / 30, (now - last) / 1000);
  last = now;
  const k = grab ? 900 : 180;
  const c = 2 * Math.sqrt(k) * (grab ? 0.9 : 0.55);
  for (const axis of ['x', 'y'] as const) {
    const a = k * (target[axis] - pos[axis]) - c * vel[axis];
    vel[axis] += a * dt;
    pos[axis] += vel[axis] * dt;
  }
  place();
  const moving = Math.hypot(target.x - pos.x, target.y - pos.y) > 0.3 || Math.hypot(vel.x, vel.y) > 2;
  if (moving || grab) frame = requestAnimationFrame(step);
};
const run = () => {
  if (frame) return;
  last = performance.now();
  frame = requestAnimationFrame(step);
};

lens.addEventListener('pointerdown', (e) => {
  lens.setPointerCapture(e.pointerId);
  grab = { id: e.pointerId, dx: e.clientX - pos.x, dy: e.clientY - pos.y };
  lens.dataset.grabbed = '';
  run();
});
lens.addEventListener('pointermove', (e) => {
  if (!grab || e.pointerId !== grab.id) return;
  target = { x: e.clientX - grab.dx, y: e.clientY - grab.dy };
});
const drop = (e: PointerEvent) => {
  if (!grab || e.pointerId !== grab.id) return;
  grab = null;
  delete lens.dataset.grabbed;
  // let go: it drifts with its speed, then floats back home
  target = { x: pos.x + vel.x * 0.12, y: pos.y + vel.y * 0.12 };
  setTimeout(() => {
    if (!grab) {
      target = { ...home };
      run();
    }
  }, 1600);
  run();
};
lens.addEventListener('pointerup', drop);
lens.addEventListener('pointercancel', drop);

// it says hello: a slow drift across the title on load
target = { x: -60, y: 26 };
setTimeout(() => {
  target = { ...home };
  run();
}, 900);
run();
