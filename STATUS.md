# THE WAR — Development Status

Updated: 2026-09-19

## Current stage

**Stage 2 — Territory expansion — IN PROGRESS**

## Gameplay-first world override

Detailed terrain remains paused. The active world is a large flat gameplay sandbox while territory, economy, war, and AI are built.

## Stage 2-E active slice

This pass is a strict readability + architecture pass based on real-device review.

Implemented:
- national territory fill is much more visible than the border
- national core cells receive a subtle second fill layer
- neutral ground is a more muted green so nation colors read clearly
- borders are thinner, darker, and subordinate to the territory mass
- shared nation borders use a restrained map-ink tone rather than bright white
- visual cell irregularity is increased without changing simulation adjacency
- selection no longer outlines a single hidden cell
- selecting owned/foreign land gently highlights the entire nation
- neutral selection relies on HUD feedback; active expansion highlights only the actual claim target
- starting territory cores are larger
- rival AI expansion is slower and strongly biased toward compact growth
- thin AI tentacles are penalized
- player expansion, rival expansion, capital markers, HUD, camera, and gesture behavior are preserved

## Canonical ownership audit

No new runtime owner was introduced.

Canonical responsibility remains:
- TerritoryState: ownership, adjacency, expansion rules, AI expansion, hit testing
- TerritoryView: territory visual derivation only
- TerritoryHud: territory UI only
- AppRuntime: orchestration only
- MapGestureController: pointer gesture ownership
- StrategyCameraRig: camera response
- GameLoop: the single frame loop

No patch file, DOM workaround, duplicate listener, duplicate game loop, duplicate territory state, or visual source-of-truth was added in this pass.

## Stage 2 next work

After device review:
- tune fill/core strength and border weight if needed
- introduce region grouping above hidden cells
- define expansion pressure/cost
- decide the final player expansion command style
- finish Stage 2 before Stage 3 resources

## Review gate

Confirm on device:
- countries read as colored land masses before their borders
- borders stay crisp and stable during camera movement
- rival growth produces compact states rather than long tendrils
- selecting national land does not expose the hidden grid
- expansion still works exactly as before
- rival AI still expands
- camera/HUD/gesture behavior is unchanged
- phone performance remains acceptable
