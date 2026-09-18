# THE WAR — Development Status

Updated: 2026-09-19

## Current stage

**Stage 2 — Territory expansion — IN PROGRESS**

## Stage 2-F finishing — restrained border softening

Implemented:
- simulation cells and ownership rules are unchanged
- nation boundary loops are derived from canonical owned cells
- only the visual nation outline receives one mild smoothing pass
- smoothing strength is intentionally limited to 0.14
- translucent nation fill now follows the same softened outer loop
- whole-nation selection uses the same softened shape
- active claim target remains the exact hidden cell so command feedback stays precise
- no additional render loop, state owner, listener, or patch file was introduced

The goal is not a round blob. The goal is to remove the last obvious polygon-step feeling while preserving the current irregular strategic-map character.

## Stage 2-G — Region hierarchy foundation

Implemented immediately after 2-F:
- hidden territory cells are grouped into 10 × 8 = 80 meso-scale Regions
- each Region contains 8 × 7 hidden cells
- Region topology has one canonical owner: `RegionIndex`
- dynamic Region control is derived live from `TerritoryState`; Region code stores no second ownership map
- Region control summary exposes leading nation, leading share, neutral cell count, and contested state
- selecting land shows its Region label in the HUD
- existing player expansion, rival expansion, capitals, camera, gestures, and HUD structure are preserved

This Region layer is infrastructure for later:
- population
- resources
- taxation
- stability / public support
- defense
- supply
- occupation pressure

Those systems are **not** added yet.

## Canonical ownership

- TerritoryState: dynamic ownership, adjacency, expansion, AI, hit testing, Region control derivation
- RegionIndex: static cell → Region topology only
- TerritoryView: derived visuals and visual smoothing only
- TerritoryHud: UI only
- AppRuntime: orchestration only
- MapGestureController: pointer gestures
- StrategyCameraRig: camera response
- GameLoop: single frame loop

## Stage 2 next work

After device review:
- tune the 0.14 border softening only if it is still visibly too angular or too soft
- define expansion pressure / cost
- refine final expansion command UX
- finish Stage 2 territory rules before Stage 3 resources

## Review gate

Confirm on device:
- nation boundaries are only slightly softer, not rounded into blobs
- translucent fill still aligns with the visible border
- national border remains stable during pan / zoom / rotation
- selecting land shows a Region label without exposing the hidden cell grid
- player expansion is unchanged
- rival expansion is unchanged
- camera and gesture behavior are unchanged
- mobile performance remains acceptable
