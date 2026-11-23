import '@fontsource-variable/inter';
import 'deep-glass/style.css';
import './style.css';
import { toast, deepGlass } from 'deep-glass';
import { hydrateIcons, icon } from './icons';

hydrateIcons();

// ---------- dark glass: follows the system, until the visitor picks one ----------

const html = document.documentElement;
const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!;
const systemDark = matchMedia('(prefers-color-scheme: dark)');
let picked: string | null = null;
try {
  picked = localStorage.getItem('dg-theme');
} catch {
  // private mode: the system decides
}
let dark = picked ? picked === 'dark' : systemDark.matches;
const themeButton = document.querySelector<HTMLElement>('#theme')!;
function applyTheme() {
  // the script sees the attribute change and makes every lens again with the dark optics
  html.dataset.dgTheme = dark ? 'dark' : 'light';
  themeMeta.content = dark ? '#090b16' : '#1b1f3a';
  themeButton.innerHTML = icon(dark ? 'sun' : 'moon');
  themeButton.setAttribute('aria-pressed', String(dark));
  themeButton.setAttribute('aria-label', dark ? 'Clear glass' : 'Dark glass');
}
applyTheme();
systemDark.addEventListener('change', (e) => {
  if (picked) return;
  dark = e.matches;
  applyTheme();
});

// ?frosted shows what Safari and Firefox get
const params = new URLSearchParams(location.search);
const glass = deepGlass({ refraction: !params.has('frosted'), light: !params.has('nolight') });

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
  support.classList.add('dg--dark');
}

themeButton.addEventListener('click', () => {
  dark = !dark;
  picked = dark ? 'dark' : 'light';
  try {
    localStorage.setItem('dg-theme', picked);
  } catch {
    // not remembered, still applied
  }
  applyTheme();
  toast(dark ? 'Dark glass' : 'Clear glass', { icon: iconNode(dark ? 'moon' : 'sun') });
});

// ---------- wallpapers: the tab bar ----------

$('#wallpapers').addEventListener('dg:change', (e) => {
  const value = (e as CustomEvent<{ value: string }>).detail.value;
  document.body.dataset.wallpaper = value;
  showSky(value === 'sky');
});

// deep-sky (npm: deep-sky-background): a GPU night sky drawn off the main thread. It's loaded the
// first time Sky is picked (its own chunk), and the sky stops while it isn't shown
let sky: { pause(): void; play(): void } | null = null;
let skyLoad: Promise<unknown> | null = null;
let skyWanted = false;
function showSky(on: boolean) {
  skyWanted = on;
  if (sky) {
    if (on) sky.play();
    else sky.pause();
    return;
  }
  if (!on) return;
  skyLoad ??= import('deep-sky-background').then(
    ({ createDeepSky }) => {
      sky = createDeepSky($('.wp-sky'), {
        fixed: false,
        theme: 'dark',
        // clicks on the glass are for the glass
        clickIgnore: '.dg, a, button, input, textarea, select, label, summary, [role="slider"]',
      });
      if (!skyWanted) sky.pause();
    },
    () => {
      skyLoad = null;
    },
  );
}

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
    await navigator.clipboard.writeText('npm i deep-glass');
    toast('Install command copied', { icon: iconNode('copy') });
  } catch {
    toast('Copy failed: select it instead');
  }
});

// chips: toggle
$('#chips').addEventListener('click', (e) => {
  const chip = (e.target as Element).closest<HTMLElement>('.dg-chip');
  if (chip) chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true'));
});

// ---------- optics: page-wide settings ----------

// a new setting reshapes every lens on screen: at most 10 times a second while a knob is dragged
let tuned = 0;
let tuning = 0;
const retune = () => {
  tuning = 0;
  tuned = performance.now();
  glass.refresh();
};
for (const input of document.querySelectorAll<HTMLInputElement>('input[data-var]')) {
  input.addEventListener('input', () => {
    document.documentElement.style.setProperty(input.dataset.var!, input.value);
    if (!tuning) tuning = window.setTimeout(retune, Math.max(0, 100 - (performance.now() - tuned)));
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
let homing = 0;
let stretch = 0;
let angle = 0;

const place = () => {
  // stretches along its motion, like something heavy and soft; eased, so it never jumps
  const speed = Math.hypot(vel.x, vel.y);
  stretch += (Math.min(0.16, speed / 6000) - stretch) * 0.25;
  // and turns towards its motion only when it really moves: no spinning on jitter
  if (speed > 80) angle = Math.atan2(vel.y, vel.x);
  lens.style.transform =
    `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0) rotate(${angle.toFixed(3)}rad) ` +
    `scale(${(1 + stretch).toFixed(3)}, ${(1 - stretch * 0.5).toFixed(3)}) rotate(${(-angle).toFixed(3)}rad)` +
    (grab ? ' scale(1.04)' : '');
};

const step = (now: number) => {
  frame = 0;
  const dt = Math.min(1 / 20, Math.max(1 / 240, (now - last) / 1000));
  last = now;
  if (grab) {
    // held: glued to the finger, its speed is the finger's (smoothed)
    vel.x += ((target.x - pos.x) / dt - vel.x) * 0.4;
    vel.y += ((target.y - pos.y) / dt - vel.y) * 0.4;
    pos.x = target.x;
    pos.y = target.y;
  } else {
    // let go: a soft spring, in small steps so that a late frame never throws it off
    const k = 170;
    const c = 2 * Math.sqrt(k) * 0.6;
    for (let i = 0, h = dt / 4; i < 4; i++) {
      for (const axis of ['x', 'y'] as const) {
        vel[axis] += (k * (target[axis] - pos[axis]) - c * vel[axis]) * h;
        pos[axis] += vel[axis] * h;
      }
    }
  }
  place();
  const resting = Math.hypot(target.x - pos.x, target.y - pos.y) < 0.3 && Math.hypot(vel.x, vel.y) < 2 && stretch < 0.002;
  if (grab || !resting) frame = requestAnimationFrame(step);
};
const run = () => {
  if (frame) return;
  last = performance.now();
  frame = requestAnimationFrame(step);
};

lens.addEventListener('pointerdown', (e) => {
  lens.setPointerCapture(e.pointerId);
  clearTimeout(homing);
  grab = { id: e.pointerId, dx: e.clientX - pos.x, dy: e.clientY - pos.y };
  target = { ...pos };
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
  // let go: it drifts on with its speed (not too far), then floats back home
  const throw_ = (v: number) => Math.max(-260, Math.min(260, v * 0.12));
  target = { x: pos.x + throw_(vel.x), y: pos.y + throw_(vel.y) };
  homing = window.setTimeout(() => {
    target = { ...home };
    run();
  }, 1600);
  run();
};
lens.addEventListener('pointerup', drop);
lens.addEventListener('pointercancel', drop);

// it says hello: a slow drift across the title on load
target = { x: -60, y: 26 };
homing = window.setTimeout(() => {
  target = { ...home };
  run();
}, 900);
run();
