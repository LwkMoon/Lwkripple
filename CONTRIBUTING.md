# Contributing to lwkripple

Thanks for helping. Bug reports, ideas and pull requests are all welcome.

## Ground rules

- **Zero runtime dependencies.** The library must stay dependency-free and small (around 10 KB gzipped).
- Keep the public API simple. One line should be enough to get a nice result.
- Every user-facing change gets a line in `CHANGELOG.md`.

## Setup

```
git clone https://github.com/LwkMoon/lwkripple.git
cd lwkripple
npm install
npm run typecheck
npm test
npm run build
```

`npm run build` writes the bundles and types to `dist/` and rebuilds the single-file demo at `docs/index.html`.

## Project layout

```
src/sim.ts              the wave simulation (pure TypeScript, no DOM)
src/lighting.ts         the shared look: lighting, constants, speed and fade conversion
src/presets.ts          the five presets
src/renderers/webgl.ts  WebGL2 renderer (GLSL mirrors shade() in lighting.ts)
src/renderers/canvas.ts Canvas 2D fallback renderer
src/instance.ts         mounting, sizing, pointer input, the animation loop
src/index.ts            public API: ripple(), supported()
src/react.ts            React bindings
src/auto.ts             data-lwkripple attributes
demo/demo.src.html      demo source (the library is inlined at build time)
test/                   simulation tests and real-browser tests
```

## Tests

```
npm test                  # simulation tests, run in Node
python3 test/browser.py   # real-browser checks (Playwright + Chromium)
```

The browser tests need Python with `playwright` and `pillow` installed, plus Chromium (`playwright install chromium`).
To run the React test, bundle `test/react-app.tsx` first (the command is in the docstring of `test/react.py`).

## Changing how the water looks

If you change the lighting in `shade()` (`src/lighting.ts`), change the GLSL in `src/renderers/webgl.ts` the same way, so both renderers match.
`node scripts/calibrate.mjs <preset> <width> <height> <seconds>` renders a preview without a browser.

## Adding a preset

1. Add it to `PRESETS` in `src/presets.ts` and to the `PresetName` type in `src/types.ts`.
2. Add it to the presets table in `README.md`.
3. Check it with `scripts/calibrate.mjs`. If a large share of the surface is blown out to white, it is too strong.

## Pull requests

- Keep them focused. Describe what changed and why.
- Run `npm run typecheck` and `npm test` first.
