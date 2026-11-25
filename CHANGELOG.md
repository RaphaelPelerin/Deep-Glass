# Changelog

## Unreleased

- **Dropdowns**: a `dg-menu` with the `popover` attribute drops down from the button that points to it (`popovertarget`). It grows out of its button, stays inside the screen, and has keyboard support, checkable items, shortcuts, labels and a danger style.
- **Submenus**: a menu row with its own `popovertarget`. They open on hover, forgive a pointer that cuts across other rows to reach them, flip at the edge of the screen, and follow the left and right arrows.
- **Select**: `dg-select` around a native `<select>`, with groups and long lists that scroll inside the glass.
- **Faster under the pointer**: about 30% less time per frame when moving over buttons. The glare is moved by the GPU instead of painted, the bevel is fixed, and the light reaches the four nearest panes. `--dg-lx`, `--dg-ly`, `--dg-mx`, `--dg-my` and `--dg-near` are gone (`--dg-glare` sets the strength of the glare).
- **Adaptive quality** (`adaptive`, on by default): lighter effects on devices that can't keep up, `glass.quality` tells the step.
- The light has inertia: a rim no longer flips, nor a glare jumps, when the pointer leaves a button on one side and comes back on the other.

## 0.1.0 (2026-11-17)

First release.

- The material: real lens refraction (Chromium) from a physical model of a rounded rim, color fringes, frosting, saturation; frosted glass everywhere else and without JavaScript.
- Light: a specular rim and a bevel that face the pointer (or the tilt of a phone), and a glare that follows it.
- Touch: presses swell, glow at the touch point, stretch towards the pointer and spring back.
- Components: buttons (glass, tinted, solid, icon), chips, cards and tiles, text fields, switches and sliders whose thumbs turn into lenses, segmented controls and tab bars with draggable drops, toolbars and menus with gliding highlights, toasts, sheets.
- Every setting is a CSS custom property; `deepGlass()`, `toast()`, `canRefract()` and `lensMap()` in JavaScript; a `<script>` build.
- Dark glass: `data-dg-theme="dark"` on the page or any part of it (`auto` follows the system, `light` brings clear glass back), or `dg--dark` on one pane. Smoked tint, dimmer backdrop, softer highlights, deeper shadows; every component follows, and lenses are remade when the theme changes.
- Fast: tiny lens maps encoded off the main thread, fringes only where they show, light that only touches the panes near the pointer, no lens for hidden drops and resting thumbs nor for panes still far off screen, new lenses built a few per frame. Settings changed from code are applied to visible panes first.
- Accessible roles and keyboard support; `prefers-reduced-motion`, `prefers-reduced-transparency` and forced colors.
