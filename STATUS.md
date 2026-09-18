# THE WAR — Development Status

Updated: 2026-09-19

## Current stage

**Stage 2 — Territory expansion — IN PROGRESS**

## Gameplay-first world override

Detailed terrain remains paused. The active world is a large flat green gameplay sandbox while territory, economy, war, and AI are built.

## Stage 2-C active slice

Implemented in this pass:
- logical territory cells remain the simulation source of truth
- visual cell centers are jittered into an irregular Voronoi-like layout
- hit testing uses the same irregular cell centers, so taps match the visible territory
- territory colors and borders are rendered into one smooth canvas texture
- square cell fills / frontier-dot grid visuals are removed
- neutral borders use lightened nation colors
- nation-to-nation borders use a shared pale border
- 5 nations remain visible with separate capitals
- non-player nations now expand into neutral frontier land over time
- AI expansion is deterministic and intentionally simple
- player still manually chooses each expansion target
- enemy territory remains protected from peaceful claiming
- HUD now states that rival nations are expanding

## Stage 2 next work

After device review:
- tune organic border resolution / thickness if needed
- decide final expansion command style
- add expansion pressure/cost so rapid land grabbing has a tradeoff
- introduce region-level grouping above internal cells
- finish the Stage 2 territory model before moving to Stage 3 resources

## Review gate

Confirm on device:
- territory no longer reads like a visible square grid
- tapping matches the visible irregular territory shapes
- rival nations visibly grow over time
- player expansion still feels responsive
- borders remain readable as nations approach one another
- HUD stays readable on phone
- mobile performance remains acceptable
