# THE WAR — Canonical Development Direction

> Status: CANONICAL
>
> Date locked: 2026-09-18
>
> This file is the first reference for all future THE WAR implementation work.
> If an older plan, Stage 1C/1D instruction, experiment, or visual note conflicts with this file, this file wins.

## 0. Read this before coding

THE WAR is a top-down territory-expansion war strategy game made primarily for friends to play together.

The core fantasy is not "simulate a country in maximum detail." It is:

**read the land → claim valuable territory → grow a state → move armies → fight over important regions → negotiate, cooperate, betray, and survive with other players.**

The project was reset to a clean slate on 2026-09-18. Do not restore old rendering or gameplay code merely because it existed before.

---

# 1. Visual baseline — locked

## 1.1 Target

The visual target is a **stylized low-poly strategy diorama**, deliberately simpler than the old semi-realistic terrain direction.

The reference image agreed on in the 2026-09-18 discussion should be interpreted through these rules:

- rounded, simplified low-poly terrain
- broad terrain shapes before micro detail
- readable mountain ridges rather than realistic geology
- forests as grouped masses, not thousands of individually important trees
- small toy-like settlements, forts, roads, and farms
- simple, calm water
- soft directional lighting
- restrained shadows
- clean color separation
- strategic readability from a high 2.5D camera
- continent-scale world, with props kept small relative to the map

This is **not** a temporary placeholder style. It is the default production direction until the user explicitly changes it.

## 1.2 What changed

Older plans tried to push THE WAR toward:

- semi-realistic terrain
- high-resolution ground textures
- dense 3D vegetation
- complex terrain material blending
- heavy lighting / AO / post-processing
- realism-first rivers and mountains

That direction is superseded.

Do not automatically drift back toward realism in later stages.

## 1.3 Readability order

At strategic zoom the player should notice, in this order:

1. landmass and major terrain
2. national territory and borders
3. rivers, mountain passes, coasts, fertile regions
4. cities / capitals / important settlements
5. armies and fronts
6. decorative props

If trees, rocks, buildings, shader noise, or shadows are visually stronger than territory and terrain structure, the scene is wrong.

## 1.4 Terrain

Use a small number of strong shapes and color regions.

Preferred:

- broad plains
- rounded hills
- clear mountain chains
- readable passes between mountains
- shallow valleys
- coastlines with strong silhouettes
- rivers that connect important terrain
- fertile river regions
- grouped forests

Avoid:

- spiky heightmaps
- random noisy terrain
- terrain covered in tiny texture detail
- huge cliffs everywhere
- procedural-demo appearance
- one central "best place" dominating the entire map

The map should contain **multiple strategically valuable regions** so several players have reasons to expand in different directions.

## 1.5 Forests

Forests are primarily **regions**, not collections of hero tree models.

Strategic zoom:
- irregular forest masses / canopy groups
- dense center, softer edges
- terrain color and forest mass should work together

Closer zoom:
- a small number of low-poly tree instances can appear
- 2–3 silhouettes are enough
- use instancing and LOD if needed

Never use thousands of individually important trees just to make the scene feel detailed.

## 1.6 Mountains and rocks

Mountains should read as chains and barriers.

Use:
- ridge
- slope
- foothill
- pass
- occasional exposed rock

Do not fill the map with loose rock props.

A mountain's strategic shape matters more than rock surface realism.

## 1.7 Rivers and water

Water stays simple.

Rivers should:
- originate in higher terrain
- descend toward low terrain / coast
- create fertile regions
- create crossing decisions
- support multiple chokepoints
- vary enough in width to read naturally

Do not spend a stage on realistic water simulation.

No bright cyan shoreline glow.

## 1.8 Settlements

A city or capital is a **small regional marker**, not a giant centerpiece model.

Use:
- small central landmark
- tiny clustered houses
- nearby fields
- short road connections
- clear icon-like strategic readability

A tree must never be the size of a castle unless scale intentionally requires it.

## 1.9 Camera

Default:
- high 2.5D oblique top-down
- weak perspective
- no dramatic low angle
- no miniature showcase camera

Zoom out must support continent-level strategy.

Zoom in exists to inspect fronts and settlements, not to turn the game into a third-person diorama viewer.

## 1.10 Lighting and effects

Keep it cheap and readable.

Preferred:
- one main directional light
- soft ambient / hemisphere contribution
- restrained shadows
- lightweight fog only if it improves depth
- small battle / capture effects

Avoid:
- heavy post-processing stacks
- expensive SSAO as a requirement
- cinematic bloom everywhere
- transparent layers covering the world
- rendering tricks that damage mobile stability

## 1.11 Performance

Priority:
1. iPhone
2. Galaxy phone
3. iPad
4. Galaxy Tab
5. desktop

Rules:
- stable mobile frame pacing is more important than visual detail
- do not hard-cap high-refresh devices just because 60 Hz is enough for a baseline
- minimize draw calls
- reuse materials
- use instancing
- use camera / zoom-based LOD
- never rebuild large geometry every frame
- never recalculate full world state every frame
- avoid unnecessary transparency
- keep DPR / renderer resolution under control on mobile

---

# 2. Core game pillars — locked

## 2.1 Geography creates conflict

A territory is valuable because of its geography, not merely because it adds area.

Examples:
- river valley → food / population
- mountain chain → minerals / defense
- forest → material / movement penalty
- coast → trade / naval access later
- pass / crossing → military control
- city region → taxation / logistics

## 2.2 Direct player intervention

THE WAR must not become an idle nation-management game.

The player should actively:
- choose expansion direction
- move armies
- choose attack targets
- reinforce fronts
- manage supply pressure
- negotiate
- coordinate allies
- use intelligence
- react to enemy actions

Automation may reduce repetitive work, but must not replace meaningful decisions.

## 2.3 Multiplayer relationships are long-term core

The eventual multiplayer loop should create:
- alliances
- temporary cooperation
- negotiated peace
- border deals
- resource deals
- joint wars
- betrayal
- opportunistic attacks
- intelligence conflict

Systems should create reasons for players to talk to each other.

---

# 3. Technical structure — locked

Use clear canonical owners. One responsibility, one owner.

Suggested top-level structure:

```text
src/
  core/          # game loop, shared state, save/session orchestration
  world/         # map data, terrain, rivers, biomes, world generation
  territory/     # ownership, borders, expansion
  economy/       # resources, population, production, taxation
  settlement/    # capitals, towns, regional development
  military/      # armies, movement, supply, combat
  diplomacy/     # agreements, relations, negotiation state
  intelligence/  # intel network, recon, operations, counter-intel
  multiplayer/   # session sync, authority, networking
  camera/        # pan, zoom, viewport rules
  input/         # touch / mouse / gesture input
  effects/       # visual-only effects
  ui/            # HUD and screens
```

Rules:
- renderer never owns game rules
- input never directly owns world rules
- visual objects never become source of truth
- no duplicate render loops
- no duplicate listeners
- no fake click
- no DOM workaround for core game actions
- no `*-patch` files
- no temporary parallel owner for an existing system
- deterministic world / simulation state where practical
- visual representation may be LOD'd without changing gameplay state

---

# 4. Development stages

Each stage has one main question.
Do not inflate scope until that question is answered.

## Stage 0 — Foundation / clean project shell

Build:
- Vite + TypeScript
- Three.js rendering shell
- PWA base
- Supabase configuration isolated from gameplay
- canonical module layout
- main game loop
- viewport / orientation handling
- device-safe renderer sizing
- basic diagnostics

Success gate:

**The clean project boots reliably on mobile and desktop, without old experimental rendering code or duplicated owners.**

Do not build gameplay yet.

---

## Stage 1 — World + locked low-poly visual baseline

Build:
- continent-scale landmass
- height field
- plains / hills / mountains
- rivers
- coast
- grouped forests
- simple water
- high 2.5D strategy camera
- pan / pinch / wheel zoom
- lightweight lighting
- minimal settlement markers for scale testing

Map design requirements:
- several valuable regions
- several mountain passes / river crossings
- no single central super-region
- enough open land for expansion
- visible strategic geography at zoom-out

Success gate:

**A screenshot alone looks like THE WAR's intended strategy map, and the player can identify multiple places worth fighting over.**

This stage establishes the visual baseline. Later stages may add detail but must not replace its visual language.

---

## Stage 2 — Territory expansion

Build:
- internal territory cell / region representation
- nation start area
- capital start
- neutral land
- adjacency rules
- expansion command
- expansion progress
- moving border
- clean territory tint
- readable border line
- selection feedback

Important:
- territory rendering is derived from territory state
- territory must not be stored in render meshes
- border generation has one canonical owner

Success gate:

**Choosing which valuable land to claim next is already satisfying without combat.**

---

## Stage 3 — Resources, population, and settlement growth

Initial resources:
- Food
- Material
- Gold

Build:
- terrain-based production
- river-valley food bonus
- forest / mountain material value
- population growth
- basic taxation
- settlement growth
- simple farms / houses / roads appearing visually
- regional summary UI

Avoid:
- dozens of resources
- detailed building trees
- citizen-by-citizen simulation

Success gate:

**Two countries with the same land area can have clearly different strength because they control different geography.**

---

## Stage 4 — Army movement, supply, and war

Build:
- army groups
- army creation / reinforcement
- regional movement
- attack command
- front / contact
- terrain combat modifiers
- river crossing penalty
- mountain / forest defense
- basic supply
- territory capture
- capital pressure / capture rules
- readable battle effects

Control principle:

The player directly decides **where, when, and how much force to send**.
Avoid unit-by-unit RTS micromanagement.

Success gate:

**The player starts wars specifically to seize strategically valuable regions, and directing those wars feels active rather than idle.**

---

## Stage 5 — Solo game loop + AI + performance gate

Build:
- AI expansion
- AI economy priorities
- AI army movement
- AI attack / defense
- basic victory / defeat
- restart
- map seed support
- balance instrumentation
- mobile profiling
- save / resume as needed

AI does not need to be clever everywhere.
It needs to create believable strategic pressure.

Success gate:

**A full short match is fun enough to replay, and it runs acceptably on target phones.**

Do not move to multiplayer if this loop is not fun.

---

## Stage 6 — Multiplayer foundation

Only begin after Stage 5 is approved.

Build:
- room creation / join
- player identity
- authoritative session model
- deterministic / validated commands where practical
- state sync
- reconnect
- late join rules
- host/server authority rules
- anti-duplicate command handling
- basic match lifecycle

Keep networking separate from world rendering.

Success gate:

**Several friends can play the same match reliably without desync or duplicate actions.**

---

## Stage 7 — Diplomacy and alliance warfare

Build:
- propose / accept / reject negotiation flow
- ceasefire
- peace agreement
- alliance
- war declaration
- access / border agreement if useful
- resource / territory terms where supported
- allied war participation
- relationship history
- clear diplomatic notifications

Do not reduce diplomacy to one-click fixed outcomes.

A proposal should support combinations of conditions.

Success gate:

**Players have meaningful reasons to negotiate because the map and wars create leverage.**

---

## Stage 8 — Intelligence, public stability, and war pressure

Build:
- information accuracy tiers
- reconnaissance
- intelligence network
- military intelligence
- technology / economy intelligence where useful
- counter-intelligence
- exposure risk
- regional dissatisfaction
- national support / stability
- war fatigue
- influence operations that exploit existing weakness

Critical rule:

No instant arbitrary button such as `enemy stability -20`.

Effects depend on:
- intelligence network strength
- counter-intelligence
- local grievances
- shortages
- taxation
- long wars
- existing instability

Discovery can cause:
- diplomatic damage
- hostility
- network loss
- stronger counter-intelligence
- possible war justification

Success gate:

**Information and internal pressure change strategic choices without becoming magic debuff buttons.**

---

## Stage 9 — Deeper national management

Only after war + multiplayer relationship gameplay works.

Possible systems:
- technology
- finance
- tax policy
- regional development
- infrastructure
- logistics upgrades
- administration
- specialization

All additions must feed back into:
- expansion
- economy
- war
- diplomacy

Do not add systems that only create menus and passive numbers.

Success gate:

**National management creates new strategic tradeoffs instead of slowing the game with chores.**

---

## Stage 10 — Trade, coast, and naval layer

Build only if land gameplay is already strong.

Possible:
- ports
- trade routes
- blockades
- naval transport
- naval control zones
- coastal invasion
- maritime resource flow

Do not build a separate full naval simulator.

Success gate:

**The coast becomes strategically different from inland territory without overwhelming the land game.**

---

## Stage 11 — Content, UX, polish, and release hardening

Build:
- onboarding
- clearer information hierarchy
- sound
- restrained effects
- accessibility / readability
- device QA
- reconnect / failure UX
- performance budgets
- PWA install flow
- analytics only where justified
- map / balance variety
- final art consistency pass

Success gate:

**A new player can understand the world, make a strategic decision quickly, and finish a multiplayer match without technical friction.**

---

# 5. Stage gates

For every stage:

1. read this file first
2. inspect current `main`
3. inspect recent commits
4. identify the canonical owner being changed
5. make the smallest coherent change
6. typecheck / build / test
7. verify mobile behavior when relevant
8. create PR
9. verify CI if CI exists
10. re-check `main` before merge
11. squash merge
12. verify production deployment when the project currently has one
13. do not automatically start the next stage without user review

Visual changes in particular require real-screen review before moving on.

---

# 6. Scope guardrails

Do not add early merely because they sound impressive:

- photorealistic terrain
- ultra-high resolution material stacks
- massive individual vegetation counts
- heavy post-processing
- complex citizen simulation
- huge building trees
- dozens of resources
- air force
- nuclear weapons
- elaborate navy before land warfare works
- live-service monetization systems
- cosmetic store
- battle pass

The project wins by becoming a **fun strategy game first**, not by accumulating systems.

---

# 7. Permanent question for every feature

Before implementing a feature, ask:

**Does this make it more interesting to read the map, take valuable land, conduct a war, or interact strategically with other players?**

If the answer is no, it is probably not the next priority.
