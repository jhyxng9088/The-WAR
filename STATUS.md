# THE WAR — Development Status

Updated: 2026-09-19

## Current stage

**Stage 2 — Territory expansion — IN PROGRESS**

## Gameplay-first world override

Detailed terrain work is paused by user decision.

Current production gameplay sandbox:
- continent-scale flat green ground
- no detailed terrain rendering
- world/terrain abstraction remains intact for later return
- gameplay loop takes priority over terrain art until the core match is fun

## Stage 2-B active slice

Implemented in this pass:
- five nations with separated starting locations
- one capital per nation
- irregular seeded starting territory blobs
- higher-resolution hidden territory grid
- no internal grid lines
- smaller cells so outer silhouettes feel less blocky
- irregularized outer border segments
- shared nation-to-nation borders
- nation-specific territory tint
- player frontier dots showing legal expansion options
- circular selection feedback instead of square-cell highlighting
- selected foreign territory identifies the nation
- player HUD with owned territory, frontier count, selected land, and expansion progress
- enemy territory cannot be claimed through peaceful expansion

## Stage 2 next work

After device review:
- tune starting positions / territory sizes
- decide whether expansion should be region-click, brush-like spread, or command-based
- add simple non-player expansion behavior if it improves Stage 2 testing
- improve border contour further if the hidden cell structure is still visually obvious
- define the final expansion cost / cooldown model before Stage 3 resources

## Review gate

Confirm on device:
- multiple nations are clearly visible
- borders read as national borders rather than a board grid
- frontier dots make legal expansion obvious
- player expansion still works
- foreign land is selectable but not peacefully claimable
- HUD remains readable on phone
- camera gestures still work
- mobile performance remains acceptable
