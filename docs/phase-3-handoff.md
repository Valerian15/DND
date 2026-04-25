# Phase 3 — Campaigns + basic session view

## Goal of Phase 3

A campaign is a persistent game (e.g. "Tyranny of Dragons") that:
- Belongs to one DM (any user can DM their own campaigns)
- Has multiple player characters linked to it
- Stores per-campaign settings (rolled-HP toggle, etc.)
- Has a basic "session view" — a placeholder page that future phases will fill with map, chat, initiative, etc.

This phase does NOT include:
- Real-time anything (that's Phase 4)
- Maps, tokens, fog of war (Phase 4 + 6)
- Chat, dice, initiative (Phase 5)

The session view in Phase 3 is just a static page that lists the participants and shows campaign info. It's the scaffolding that Phase 4+ will hang real-time features off of.

## Scope

### Backend
- New table campaigns: id, dm_id (FK users), name, description, settings (JSON), created_at, updated_at.
- New table campaign_members: campaign_id, character_id, joined_at — links characters to campaigns. A character can be in 0 or 1 campaigns at a time.
- Routes (all behind requireAuth):
  - GET /api/campaigns — list campaigns the user is the DM of OR has a character in
  - GET /api/campaigns/:id — get one campaign with its members hydrated
  - POST /api/campaigns — create a campaign (the caller becomes DM)
  - PATCH /api/campaigns/:id — update name/description/settings (DM only)
  - DELETE /api/campaigns/:id — delete (DM only)
  - POST /api/campaigns/:id/invite — DM adds a character to the campaign by character id
  - DELETE /api/campaigns/:id/members/:characterId — DM removes a character, OR character owner removes their own character
- Settings JSON shape (start small): { rolled_hp: boolean }. Default { rolled_hp: false }. We'll grow this.

### Frontend
- Replace the disabled "Campaigns" placeholder card on / (HomePage.tsx) with a real link to /campaigns.
- New page /campaigns — list campaigns (cards). For each: name, DM, member count, your role (DM or player), open button.
- New page /campaigns/new — create campaign form (just name + description for now).
- New page /campaigns/:id — campaign detail. Shows description, settings, member list. DM sees:
  - Edit campaign button (modal with name/description/settings)
  - Delete campaign button
  - Invite character: a dropdown of characters that aren't in any campaign yet, plus a list of all users' characters if admin (admin convenience). Pick one and click invite.
  - Remove member buttons next to each member.
  Players see:
  - Their own character: a "Leave campaign" button (removes their character from the campaign).
  - Other characters: read-only list.
- New page /campaigns/:id/session — the placeholder session view. For now: just shows campaign name, member list with portraits + class/level summary, a big empty area where the map will go in Phase 4.

### Things to be careful about
- A character should not be able to be in two campaigns at once. Enforce at the DB level if possible (UNIQUE on character_id in campaign_members).
- Deleting a user should cascade to delete their campaigns (dm_id FK with ON DELETE CASCADE) and remove their characters from any campaigns they're in.
- The wizard's recomputeDerived uses fixed-average HP. The campaign-level rolled_hp setting will eventually flip that, but for Phase 3 just store the setting and surface it on the detail page. Actual rolled-HP plumbing into the wizard is deferred.

## Approach

Use plan mode. Suggested order of operations:

1. Schema + migration in server/src/db/index.ts — add the two tables. Test the seed scripts still work (pnpm seed, pnpm seed:srd).
2. Backend routes in a new server/src/routes/campaigns.ts. Wire it up in server/src/index.ts.
3. Manual API smoke test via curl or the browser before frontend work.
4. Frontend: types, api helper, list page, create page, detail page, session view in that order.
5. Hook the home page card to /campaigns.
6. Manual test the full flow: create campaign as admin, create campaign as player, invite characters, view as different users, etc.
7. Suggest commit. Then push.

Phase 3 is a meaningful chunk — probably 2-3 sessions of focused work. Don't try to do it all in one session. Commit after each substantial slice (schema+routes is one slice, list+create UI is another, detail+session view is a third).

## Locked decisions for Phase 3

- One character per campaign at a time.
- DM is fixed at creation; no transferring DM rights for now.
- No "active session" concept yet — /campaigns/:id/session is just a static placeholder page.
- Settings JSON starts with { rolled_hp: false }; we add fields as we need them.
- Admin sees and can manage all campaigns; players only see their own (where they DM or have a character).

## When in doubt

- Match the patterns from server/src/routes/library.ts (route allowlist + parameterized handlers) and server/src/routes/characters.ts (hydrate JSON columns on read).
- Match the frontend patterns from client/src/features/library/ (page + api.ts + types.ts + components for modals).
- Inline styles, beginner-friendly explanations, full-file rewrites when changes are non-trivial.
