# THE WAR architecture rules

THE WAR is kept intentionally boring at the ownership boundaries so future work does not require a cleanup/unification pass.

## Canonical owners

| Responsibility | Canonical owner | Notes |
| --- | --- | --- |
| Terrain height + biome sampling | `src/world/WorldField.ts` | Pure runtime world-field state and sampling only. |
| Official world-map persistence | `src/world/WorldMapRepository.ts` | Reads/publishes the Supabase canonical map. No renderer logic. |
| Heightmap encoding/sampling | `src/world/HeightmapCodec.ts` | Shared stateless codec utilities only. |
| Terrain Lab local work-in-progress | `src/terrain-editor/TerrainDraftStore.ts` | Browser-local draft only; never a production source of truth. |
| Terrain Lab authentication | `src/terrain-editor/TerrainEditorAuth.ts` | Supabase Auth only. |
| Supabase client | `src/backend/SupabaseClient.ts` | The only frontend Supabase client instance. |
| Terrain rendering | `src/world/rendering/*` | Reads `WorldField`; never owns gameplay or persistence state. |
| Camera/input | `src/camera`, `src/input` | No terrain persistence or game-state ownership. |

## World-map flow

```text
Supabase world_map_current
        |
        v
WorldMapRepository
        |
        v
WorldField -----------------> normal THE WAR
   ^                              (official map only)
   |
Terrain Lab draft
   |
   +---- localStorage via TerrainDraftStore
   |
   +---- preview: replace WorldField in memory
   |
   +---- publish: publish_world_map() RPC -> Supabase canonical map
```

A fresh normal THE WAR boot always hydrates from Supabase and falls back to the repository-authored heightmap if the remote map is unavailable. It never reads a Terrain Lab draft.

## Backend ownership

- **Supabase**: accounts, authoritative persistent game/world data, Realtime/Presence/Broadcast, server-side database functions.
- **GitHub**: source, migrations, CI, review history, GitHub Pages deployment.
- **Vercel**: only add when a concrete server workload cannot cleanly live in Supabase. Do not mirror an existing owner there.
- **Browser localStorage**: editor drafts/cache only, never authoritative multiplayer or production state.

## Hard rules

1. One capability has one canonical owner.
2. Do not add `*-patch.*` files or compatibility layers to avoid fixing an owner.
3. Do not duplicate listeners, timers, subscriptions, API clients, world-state stores, or persistence paths.
4. Do not use fake clicks, DOM mutation workarounds, or location-dependent selectors as feature logic.
5. Renderers read state; they do not own game rules or persistence.
6. Client code never contains a Supabase service-role key, GitHub token, or other privileged credential.
7. Public/editor writes go through an authenticated server-side gate (`publish_world_map()` for the canonical terrain).
8. Database schema changes are tracked under `supabase/migrations/` and applied through migrations, never as undocumented dashboard-only changes.
9. Before merge: re-read current `main`, check conflicting ownership changes, run full typecheck/build, then verify production deployment.
