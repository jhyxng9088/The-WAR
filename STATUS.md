# THE WAR — Development Status

Updated: 2026-09-19

## Current stage

**Stage 2 — Territory expansion — IN PROGRESS**

## Gameplay-first world override

Detailed terrain remains paused. The active world is a large flat green gameplay sandbox while territory, economy, war, and AI are built.

## Stage 2-D active slice

Implemented in this pass:
- removed the stretched 640×448 territory canvas texture
- territory fill is now direct vector geometry
- national borders are direct antialiased vector lines
- border line width is screen-space stable across zoom
- border lines disable depth testing and frustum culling to prevent pan/tilt flicker
- logical cells use shared irregular corners and bent shared edges
- the same canonical polygon is used for rendering and tap hit testing
- selected land is highlighted by its actual irregular polygon shape
- the old centered circular selection marker is removed
- expansion feedback fills the actual target polygon instead of using a ring
- rival neutral-land expansion from Stage 2-C remains active

## Stage 2 next work

After device review:
- tune border thickness and territory opacity
- decide the final player expansion command style
- introduce region grouping above internal cells
- add expansion cost / pressure before Stage 3 resources
- close Stage 2 only when claiming land feels clear and satisfying

## Review gate

Confirm on device:
- borders stay crisp when zooming
- borders do not disappear/flicker while panning, rotating, or tilting
- selection follows the visible irregular territory shape
- no obvious internal square grid appears
- rival nations continue expanding
- player expansion and taps still align with the displayed territory
- phone performance remains acceptable
