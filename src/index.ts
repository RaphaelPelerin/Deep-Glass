import { installControls } from './controls';
import { refracting, refresh, refreshAll, start, stop } from './runtime';

export interface DeepGlassOptions {
  /** where to look for glass (default: the whole document) */
  root?: ParentNode;
  /** real refraction where the browser can do it (Chromium); false: frosted glass everywhere (default true) */
  refraction?: boolean;
  /** highlights face the pointer and glare follows it (default true) */
  light?: boolean;
}

export interface DeepGlassInstance {
  /** whether glass really refracts here (false: the frosted fallback) */
  readonly refraction: boolean;
  /** re-reads every pane's size and `--dg-*` settings (after changing them from code) */
  refresh(el?: HTMLElement): void;
  /** removes the filters and listeners; the CSS fallback stays */
  destroy(): void;
}

/**
 * Turns every `.dg` element into deep glass, and brings the components to life (switches,
 * sliders, segmented controls, tab bars, toolbars, menus). Elements added later are picked up.
 *
 * ```js
 * import { deepGlass } from 'deep-glass';
 * import 'deep-glass/style.css';
 *
 * deepGlass();
 * ```
 */
export function deepGlass(options: DeepGlassOptions = {}): DeepGlassInstance {
  installControls();
  start(options.root ?? document, {
    refraction: options.refraction ?? true,
    light: options.light ?? true,
  });
  return {
    get refraction() {
      return refracting();
    },
    refresh: (el) => (el ? refresh(el) : refreshAll()),
    destroy: stop,
  };
}

export { canRefract } from './support';
export { lensMap, bend, surface, type LensShape, type LensMap } from './lens';
export { toast, type ToastOptions } from './toast';
export { Droplet } from './controls';
