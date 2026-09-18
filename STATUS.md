# THE WAR — Development Status

Updated: 2026-09-19

## Current stage

**Stage 2 — Territory expansion — IN PROGRESS**

## Stage 2-I — Claim Operations + Frontier Capacity

This pass makes territory expansion visibly and mechanically different from the old one-cell-at-a-time prototype.

### Player expansion

- tapping a legal neutral frontier now builds one Claim Operation
- an operation can include up to 4 connected neutral hidden cells
- operation growth stays inside the clicked Region
- cells are chosen from the clicked frontier outward and remain connected to player territory / the operation
- operation duration scales slightly with operation size
- the active operation highlights all cells being claimed, not just one hidden cell

### Frontier Capacity

- player has one canonical Frontier Capacity value in TerritoryState
- maximum: 100
- it regenerates continuously
- starting a Claim Operation consumes capacity
- larger operations cost slightly more
- if capacity is insufficient, the claim does not start
- HUD shows current capacity percentage

This is intentionally not Food / Gold / Material. Stage 3 resources are still separate.

### Region Secure

- after a claim completes, Region control is checked
- if one nation owns at least 82% of a Region
- and the rest of that Region is neutral
- and there is no foreign ownership inside it
- remaining neutral cells are consolidated into that nation
- foreign territory is never overwritten by Region Secure
- rival AI uses the same neutral-only Region Secure rule after normal AI expansion

### Canonical ownership

Unchanged:
- TerritoryState owns dynamic ownership, adjacency, claim legality, Frontier Capacity, operations, AI, hit testing and Region-control derivation
- RegionIndex owns static cell → Region topology only
- TerritoryView renders derived territory / active operation visuals only
- TerritoryHud displays derived UI only
- AppRuntime orchestrates
- GameLoop remains the only frame loop
- camera / gesture owners are unchanged

No patch file, fake click, duplicate state owner, duplicate listener, duplicate timer, or second game loop was added.

## Stage 2 next work

- device-test Claim Operation rhythm and capacity recovery
- tune operation size / cost / Region Secure threshold if necessary
- refine the command UX if taps still feel too cell-like
- then close Stage 2 and move to Stage 3 resources / population

## Review gate

Confirm:
- one tap visibly claims a small connected frontier section instead of only one tiny cell
- active claim highlight matches every cell in the operation
- capacity decreases and regenerates
- low capacity blocks spam expansion
- Region Secure never steals foreign land
- rival nations still expand
- borders / translucent fill remain correct
- camera / gestures / HUD remain stable
