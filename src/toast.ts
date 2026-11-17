export interface ToastOptions {
  /** ms on screen (default 2600); 0 keeps it until dismissed */
  duration?: number;
  /** an element shown before the message (an icon) */
  icon?: Node;
}

let stack: HTMLElement | null = null;

/** a glass pill that drops in from the top and dissolves; returns a function that dismisses it */
export function toast(message: string, options: ToastOptions = {}): () => void {
  if (!stack?.isConnected) {
    stack = document.createElement('div');
    stack.className = 'vitre-toasts';
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    document.body.append(stack);
  }
  const el = document.createElement('div');
  el.className = 'vitre vitre-toast';
  if (options.icon) el.append(options.icon);
  el.append(message);
  stack.append(el);
  let timer = 0;
  const dismiss = () => {
    clearTimeout(timer);
    if (el.hasAttribute('data-leaving')) return;
    el.toggleAttribute('data-leaving', true);
    const done = () => el.remove();
    el.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 600);
  };
  const duration = options.duration ?? 2600;
  if (duration > 0) timer = window.setTimeout(dismiss, duration);
  el.addEventListener('click', dismiss);
  return dismiss;
}
