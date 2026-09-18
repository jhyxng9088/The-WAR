# THE WAR — Development Status

Updated: 2026-09-19

## Current stage

**Stage 2 — Territory expansion — IN PROGRESS**

## Stage 2-F active slice

Real-device review exposed that nation fill geometry existed but was not visible from the strategy camera because the generated triangles were wound toward -Y and were backface-culled.

Fixed in this pass:
- canonical polygon fill triangulation now faces +Y
- nation interiors are visibly tinted with translucent nation color
- base nation tint is intentionally restrained so the ground remains visible
- compact national cores receive only a subtle extra tint
- national borders are slightly thinner and less dominant
- selecting a nation uses a subtle whole-nation translucent highlight
- active expansion target uses a stronger translucent target fill
- vector border rendering from Stage 2-D remains unchanged
- compact AI growth from Stage 2-E remains unchanged

## Visual target

The map should read in this order:
1. colored national land mass
2. national border
3. capital marker
4. selection / active expansion feedback

The internal cell topology must remain visually hidden except for the temporary active claim target.

## Canonical ownership

Unchanged:
- TerritoryState owns ownership, adjacency, expansion rules, AI and hit testing
- TerritoryView derives all territory visuals
- TerritoryHud owns territory UI
- AppRuntime only wires systems together
- MapGestureController owns pointer gestures
- StrategyCameraRig owns camera response
- GameLoop remains the single frame loop

No patch file, duplicate state, duplicate render owner, fake click, extra listener owner, or DOM gameplay workaround was introduced.

## Stage 2 next work

After this fill is visually confirmed:
- introduce Region grouping above hidden cells
- define expansion pressure/cost
- refine expansion command UX
- finish Stage 2 territory rules before Stage 3 resources

## Review gate

Confirm on device:
- every country has a clearly visible but translucent interior color
- underlying ground is still visible through national color
- border is secondary to the colored land mass
- whole-nation selection feels subtle
- expansion target is visible without exposing the general grid
- camera movement does not flicker
- player and rival expansion behavior is unchanged
