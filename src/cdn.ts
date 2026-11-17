import { deepGlass } from './index';

export * from './index';

// <script src="deep-glass.iife.js">: glass comes to life as soon as the page is parsed
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => deepGlass(), { once: true });
  else deepGlass();
}
