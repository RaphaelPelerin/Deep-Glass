import { vitre } from './index';

export * from './index';

// <script src="vitre.iife.js">: glass comes to life as soon as the page is parsed
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => vitre(), { once: true });
  else vitre();
}
