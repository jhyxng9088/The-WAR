# THE WAR — Development Status

Updated: 2026-09-19

## Current stage

**Stage 2 — Territory expansion — IN PROGRESS**

## Stage 2-H — visible border polish + Region readout

This pass responds to device review that the previous 0.14 averaging pass was technically present but visually too subtle.

### Border / territory presentation

- simulation cells remain unchanged and hidden
- national outer loops are still derived from canonical TerritoryState ownership
- the old single-point average softening is replaced with one restrained corner-cut pass
- corner cut is 0.18: enough to visibly reduce hard stair-step corners without turning states into round blobs
- loop area is compensated after rounding so countries do not visibly shrink
- translucent national fill, whole-nation selection and border all use the same display loop
- a wider very-low-opacity border underlay sits below the crisp 1 px line to remove the harsh cut-out / sticker feeling
- no texture rasterization is reintroduced, so borders remain resolution-independent

### Region layer

- RegionIndex remains the only static cell → Region topology owner
- Region control remains derived from TerritoryState ownership
- HUD now shows Region label, leading nation, leading share, and contested status when land is selected
- no second mutable Region ownership state exists

## Canonical ownership

Unchanged:
- TerritoryState: dynamic ownership, adjacency, expansion, AI, hit testing, Region control derivation
- RegionIndex: static Region topology only
- TerritoryView: derived visual boundary / fill only
- TerritoryHud: UI only
- AppRuntime: orchestration only
- MapGestureController: pointer gestures
- StrategyCameraRig: camera response
- GameLoop: single frame loop

No patch file, fake click, duplicate state owner, duplicate input listener, duplicate timer, or second render loop was added.

## Stage 2 next work

After device review:
- tune corner cut only if it is still too angular or has become too soft
- define expansion pressure / cost
- refine final expansion command UX
- then close Stage 2 and move into Stage 3 resources / population

## Review gate

Confirm:
- border shape is visibly smoother than Stage 2-G
- states still retain irregular strategic silhouettes
- translucent fill exactly follows the visible outline
- border remains crisp while zooming / rotating / panning
- Region readout updates correctly on selection
- player and rival expansion behavior is unchanged
- camera / gesture behavior is unchanged
- phone performance remains acceptable
