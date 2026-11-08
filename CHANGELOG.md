# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-08

First release.

### Added
- Interactive water ripples for any element, buttons, images, or the whole viewport.
- Real wave simulation (height-field wave equation) with reflecting or absorbing edges.
- WebGL2 renderer with automatic Canvas 2D fallback.
- Procedural water by default, opt-in image refraction (`image: 'auto'`, a URL, `<img>`, canvas or ImageBitmap).
- Presets: `pond`, `rain`, `storm`, `glass`, `ocean`.
- Controller API: `drop`, `pause`, `resume`, `clear`, `setPreset`, `update`, `destroy`.
- React bindings (`lwkripple/react`): `<Ripple>` and `useRipple`.
- Script tag build with `data-lwkripple` attributes.
- `prefers-reduced-motion` support, offscreen pausing, and SSR-safe imports.
