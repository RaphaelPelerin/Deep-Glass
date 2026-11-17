# Changelog

## 0.1.0 (2026-11-17)

First release.

- The material: real lens refraction (Chromium) from a physical model of a rounded rim, color fringes, frosting, saturation; frosted glass everywhere else and without JavaScript.
- Light: a specular rim and a bevel that face the pointer (or the tilt of a phone), and a glare that follows it.
- Touch: presses swell, glow at the touch point, stretch towards the pointer and spring back.
- Components: buttons (glass, tinted, solid, icon), chips, cards and tiles, text fields, switches and sliders whose thumbs turn into lenses, segmented controls and tab bars with draggable drops, toolbars and menus with gliding highlights, toasts, sheets.
- Every setting is a CSS custom property; `deepGlass()`, `toast()`, `canRefract()` and `lensMap()` in JavaScript; a `<script>` build.
- Accessible roles and keyboard support; `prefers-reduced-motion`, `prefers-reduced-transparency` and forced colors.
