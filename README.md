# THE WAR

THE WAR is being rebuilt from a clean slate as a continent-scale top-down territory strategy game.

The canonical product and engineering direction lives in [AGENTS.md](./AGENTS.md).
The current implementation status lives in [STATUS.md](./STATUS.md).

## Current stage

**Stage 0 — Foundation / clean project shell**

This stage intentionally contains no gameplay world yet. The visible grid is a diagnostic surface used to verify rendering, viewport behavior, and the map-navigation gesture system.

## Development

```bash
npm install
npm run dev
npm run check
```

## Architecture

One responsibility has one canonical owner.

- `src/core` — runtime, frame loop, viewport, renderer ownership
- `src/camera` — strategic camera state
- `src/input` — pointer / map gestures only
- `src/infrastructure` — PWA and external-service boundaries
- later gameplay modules follow AGENTS.md

## Deployment

Production is GitHub Pages at:

https://jhyxng9088.github.io/The-WAR/

Vercel is not part of the default deployment path.
