/**
 * Real refraction needs SVG filters in `backdrop-filter`, which only Chromium renders (Chrome,
 * Edge, Opera, Brave, Arc, Samsung Internet…). Other browsers parse it and paint nothing, so it is
 * detected by engine rather than with `CSS.supports`. Elsewhere glass falls back to frosting.
 */
export function canRefract(): boolean {
  if (typeof navigator === 'undefined' || typeof CSS === 'undefined') return false;
  if (!CSS.supports('backdrop-filter', 'url(#a)')) return false;
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } })
    .userAgentData?.brands;
  if (brands) return brands.some((b) => b.brand === 'Chromium');
  // iOS browsers are all WebKit, whatever their name
  return /\bChrome\/\d+/.test(navigator.userAgent) && !/\b(CriOS|EdgiOS|FxiOS)\b/.test(navigator.userAgent);
}

const reducedMotion = typeof matchMedia === 'undefined' ? null : matchMedia('(prefers-reduced-motion: reduce)');

export const prefersReducedMotion = (): boolean => !!reducedMotion?.matches;
