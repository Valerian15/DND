## Working with me

- I'm a beginner dev. Strong on D&D 5e rules, weak on CS concepts. Explain reasoning when it matters.
- Plan before writing code. Show me a plan, let me approve, then execute.
- One commit per phase or sub-phase. Always suggest a commit at the end of one.
- Never push without me running `git status` first and confirming `.env` and `.db` files are not staged.
- After any schema or .env change, remind me to restart the server.
- Use plan mode for anything multi-file. I want to read the plan and push back before edits land.

## Locked-in product decisions (don't re-ask)

- 5e 2014 rules (SRD 5.1), not 2024/5.5e.
- Point Buy default; Standard Array supported; no rolling for stats.
- Fixed-average HP per level by default; per-campaign rolled-HP toggle planned for Phase 3.
- Self-hosted on my PC (later deployed to office Dell, exposed via Cloudflare Tunnel). No cloud DB. No Supabase.
- Username + password auth only. No email. Admin manually resets passwords.
- Admin (me) adds content via admin panel; players cannot add homebrew.
- Free content only: SRD 5.1 seed from Open5e; I hand-add official content from books I legally own.
- No PDF/JSON character import.
- No AI portrait gen — paste URL or upload.

## Code style

- TypeScript strict mode, no `any` except where parsing Open5e's wild JSON forces it.
- All backend routes behind `requireAuth` unless explicitly public.
- All admin routes behind `requireAdmin`.
- Inline styles through Phase 6, migrate to fantasy theme via Claude Design in Phase 7.
- SRD content (`source = 'srd-2014'`) is read-only; never bypass that lock.

## Phase status

- Phase 0–1: scaffold, auth, admin panel, SRD seed, character wizard, sheet, level-up — DONE
- Phase 2: library browser + admin content editor — DONE (last commit: "Phase 2: library browser + admin content editor")
- **Phase 3: campaigns + basic session view — IN PROGRESS, just starting**
- Phase 4: real-time token sync (Socket.io)
- Phase 5: chat, dice, initiative
- Phase 6: fog of war + full 5e vision rules
- Phase 7: fantasy UI theme via Claude Design
- Phase 8 (optional): Tauri desktop wrap

## Admin credentials (dev only)

`admin / admin` — change before going live.

## Overview

Private D&D 5e virtual tabletop (VTT). pnpm monorepo with two packages:
- `client/` — React 19 + Vite + React Router v7 frontend
- `server/` — Node + Express 5 backend with SQLite (better-sqlite3)

## Commands

Run from the repo root using pnpm workspaces, or `cd` into the package first.

```bash
# Start both dev servers (run in separate terminals)
cd server && pnpm dev        # tsx watch — hot-reloads on save, port 3001
cd client && pnpm dev        # Vite dev server, port 5173

# Lint client (no linter configured for server)
cd client && pnpm lint

# Build client for production
cd client && pnpm build

# Seed the database (requires ADMIN_USERNAME + ADMIN_PASSWORD in server/.env)
cd server && pnpm seed       # creates the admin user
cd server && pnpm seed:srd   # populates SRD 2014 library content (races, classes, spells, etc.)
```

There are no tests currently.

## Architecture

### Auth flow
- Server issues JWTs (30-day expiry) signed with `JWT_SECRET` from env (defaults to `dev-secret-change-me` in dev).
- Client stores the token in `localStorage` as `dnd_token`; [AuthContext](client/src/features/auth/AuthContext.tsx) bootstraps from it on load.
- Two roles: `admin` and `player`. Admin sees all characters and can CRUD library content.
- `RequireAuth` / `RequireAdmin` wrappers guard routes in [App.tsx](client/src/App.tsx).

### Database
- SQLite at `server/data/game.db` (relative to the `server/` package root, created automatically).
- Schema is applied idempotently via `initSchema()` in [server/src/db/index.ts](server/src/db/index.ts) at startup.
- Content tables (`races`, `classes`, `subclasses`, `backgrounds`, `spells`, `items`, `monsters`, `feats`, `conditions`) each have a `slug` PK surrogate, a `name`, a `source` column, and a `data TEXT` column holding the full JSON object.
- SRD content has `source = 'srd-2014'` and is read-only (the API rejects edits/deletes on it).

### Library content (`/api/library/:type`)
- Generic router handles all content types via the `ALLOWED_TYPES` allowlist.
- Type-specific columns (e.g. `level`/`school` for spells, `cr`/`type` for monsters) are kept in sync with the `data` JSON on write.
- Subclasses carry a denormalized `class_slug` column and can be filtered with `?class=<slug>`.

### Characters
- Most 5e data lives in JSON columns (`abilities`, `skills`, `saves`, `inventory`, `spells_known`, `spells_prepared`, `spell_slots`, `features`, `description`); commonly queried scalars (`level`, `hp_current`, `hp_max`, `ac`, `class_slug`, etc.) are top-level columns.
- The server's `hydrate()` function in [routes/characters.ts](server/src/routes/characters.ts) parses all JSON columns before returning.
- `PATCH /api/characters/:id` accepts any subset of fields; the `UPDATABLE_SCALAR` / `UPDATABLE_JSON` sets control what's allowed.

### Client-side D&D rules
All mechanical logic lives in the client and is applied before persisting:

| File | Responsibility |
|------|----------------|
| [rules.ts](client/src/features/character/rules.ts) | HP, AC, proficiency bonus, spell slot tables, `recomputeDerived()` |
| [pointBuy.ts](client/src/features/character/pointBuy.ts) | Point-buy cost / ability modifier |
| [casters.ts](client/src/features/character/casters.ts) | Per-class caster config (ability, model, cantrips/spells known by level) |
| [skills.ts](client/src/features/character/skills.ts) | Skill → ability mapping |
| [levelUp.ts](client/src/features/character/levelUp.ts) | Level-up logic |
| [subclassUnlock.ts](client/src/features/character/subclassUnlock.ts) | Per-class subclass unlock level |

`recomputeDerived()` recalculates `hp_max`, `hp_current`, `ac`, and `spell_slots` from abilities + class + level. The wizard calls it automatically whenever those fields change.

### Character Wizard
- [CharacterWizard.tsx](client/src/features/character/CharacterWizard.tsx) is used for both creation (`/characters/new`) and editing (`/characters/:id/edit`).
- On first load it creates a blank character immediately and redirects to the edit URL.
- Each step receives `character` and an `onChange(patch)` callback that PATCHes the server and updates local state. Steps auto-save; there is no explicit save button.
- Steps: Race → Class → Subclass (level-gated) → Abilities → Background → Skills → Equipment → Spells → Details.

### Client API layer
- [lib/api.ts](client/src/lib/api.ts): `apiFetch<T>()` wraps fetch, attaches the JWT header, and throws `ApiError` on non-2xx.
- Feature-level API modules (`features/character/api.ts`, `features/library/api.ts`) call `apiFetch` directly.
- `API_BASE` is hardcoded to `http://localhost:3001/api` — change this for production.

### Admin / Library browser
- [AdminPage.tsx](client/src/pages/AdminPage.tsx): admin-only user management.
- [LibraryPage.tsx](client/src/pages/LibraryPage.tsx): browsable library for all users; admins see edit/delete/create controls.
- [EntryFormModal.tsx](client/src/features/library/EntryFormModal.tsx) dispatches to per-type form components in `features/library/forms/`.
