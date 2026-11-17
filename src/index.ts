import { installControls } from './controls';
import { refracting, refresh, rescan, start, stop } from './runtime';

export interface VitreOptions {
  /** where to look for glass (default: the whole document) */
  root?: ParentNode;
  /** real refraction where the browser can do it (Chromium); false: frosted glass everywhere (default true) */
  refraction?: boolean;
  /** highlights face the pointer and glare follows it (default true) */
  light?: boolean;
}

export interface VitreInstance {
  /** whether glass really refracts here (false: the frosted fallback) */
  readonly refraction: boolean;
  /** re-reads every pane's size and `--vitre-*` settings (after changing them from code) */
  refresh(el?: HTMLElement): void;
  /** removes the filters and listeners; the CSS fallback stays */
  destroy(): void;
}

/**
 * Turns every `.vitre` element into liquid glass, and brings the components to life (switches,
 * sliders, segmented controls, tab bars, toolbars, menus). Elements added later are picked up.
 *
 * ```js
 * import { vitre } from 'vitre';
 * import 'vitre/style.css';
 *
 * vitre();
 * ```
 */
export function vitre(options: VitreOptions = {}): VitreInstance {
  installControls();
  start(options.root ?? document, {
    refraction: options.refraction ?? true,
    light: options.light ?? true,
  });
  return {
    get refraction() {
      return refracting();
    },
    refresh: (el) => (el ? refresh(el) : rescan()),
    destroy: stop,
  };
}

export { canRefract } from './support';
export { lensMap, bend, surface, type LensShape, type LensMap } from './lens';
export { toast, type ToastOptions } from './toast';
export { Droplet } from './controls';
