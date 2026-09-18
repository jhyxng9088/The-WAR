# THE WAR — Development Status

Updated: 2026-09-19

## Current stage

**Stage 2 — Territory expansion — IN PROGRESS**

## Stage 1 decision

The detailed terrain experiment is intentionally paused.

The active gameplay sandbox is now:
- continent-scale flat green ground
- no mountains, rivers, forests, terrain props, or terrain-detail rendering
- camera and mobile gesture navigation preserved
- world/data ownership remains isolated so terrain can return later without rewriting gameplay systems

This is deliberate. Gameplay systems are now the priority.

## Active Stage 2 slice

Implemented:
- internal neutral territory grid
- one player nation
- starting capital
- small starting territory
- tap selection
- adjacency validation
- timed expansion into adjacent neutral territory
- territory ownership tint
- outer national border rendering
- expansion progress feedback
- territory rendering derived from territory state rather than stored in render meshes

## Stage 2 next work

After real-device review:
- improve border silhouette so the internal cell structure is less visible
- add cleaner selection/command feedback
- decide expansion cost/cooldown rules
- add additional nations/start locations
- prepare region data for later resources and warfare

## Review gate

Confirm on device:
- the flat sandbox loads cleanly
- tap selects territory
- only adjacent neutral territory can expand
- expansion progress completes and moves the border
- pan/zoom/rotate/tilt still work
- no obvious mobile performance regression
