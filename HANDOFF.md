# Handoff Document — DND VTT Project

> For the next Claude Code session. Read this before touching anything.
> Last updated: 2026-04-28

---

## What this project is

A self-hosted D&D 5e virtual tabletop (pnpm monorepo):
- `server/` — Node + Express 5, SQLite (better-sqlite3), Socket.io, port 3001
- `client/` — React 19 + Vite, port 5173
- DB lives at `server/data/game.db`
- Auth: JWT stored in localStorage as `dnd_token`, 30-day expiry
- Rules: 5e 2014 SRD only. Admin = `admin / admin` (dev).

Start servers: `cd server && pnpm dev` and `cd client && pnpm dev` in separate terminals.

---

## Phase status

- Phase 0–6: **DONE** (scaffold, auth, character wizard, library, campaigns, real-time map/tokens, fog of war, chat, dice, initiative, HP sync, in-game character sheet, condition badges on tokens)
- **Phase 7: Fantasy UI theme via Claude Design — NEXT MAJOR PHASE**
- Phase 8 (optional): Tauri desktop wrap

---

## What was built in the last two sessions

### Concentration management (auto)
- Casting a concentration spell: automatically adds `concentration` condition to token
- Taking damage while concentrating: Con save DC = max(10, floor(damage/2)), rolled client-side
- Dropping to 0 HP while concentrating: auto-breaks, no save
- Gaining Incapacitated/Paralyzed/Petrified/Stunned/Unconscious: auto-breaks
- Casting a second concentration spell: auto-swaps (announces old spell dropped)
- All announced via `/action` prefix → dice log, not chat

### Action message type
- Server recognises `/action ` prefix → stores `type='action'`
- Client renders action messages in dice log as italic mauve text, NOT in chat

### Spell interactions (InGameSheet)
- Clicking a spell name in the spellbook → pings description to dice log
- Spells without attack roll get a "Cast" button → announces in dice log, handles concentration
- Spells with attack roll: click name → rolls attack + damage, announces concentration if needed

### Monster/NPC panel (replaced old elephant/dog panel)
- DM Monsters tab: search library monsters + "My NPCs" permanent list above search
- Library monsters: drag from search OR encounter list to map → creates correctly-sized token
- Campaign NPCs: drag from "My NPCs" list OR encounter list to map
- Clicking a library monster token → opens MonsterSheet (full rollable stat block, HP management)
- Clicking a campaign NPC token → opens NpcSheet (same style, uses stored stat block)
- Encounter tracker: click monster name → opens sheet; entries are also draggable to map

### Campaign NPC full stat block
- Campaign NPCs now store: AC, speed, ability scores (6), saving throw proficiencies, attacks (name/to_hit/damage/damage_type/description), traits (name/description), notes
- DB columns added via ALTER TABLE (idempotent) — **restart server after pulling**
- NpcForm.tsx: full stat block editor (ability score inputs with modifier preview, save checkboxes, dynamic attack/trait list)
- NpcSheet.tsx: rollable panel — ability clicks roll checks, saves show ◆ for proficient, attack rows have separate attack-roll and damage-roll buttons

---

## Key files to know

| File | Purpose |
|---|---|
| `server/src/db/index.ts` | Schema + idempotent ALTER TABLE migrations |
| `server/src/routes/campaignNpcs.ts` | CRUD for campaign NPCs (now with full stat block) |
| `server/src/routes/tokens.ts` | Token CRUD, fog visibility filter, broadcasts |
| `server/src/session.ts` | Socket.io handlers (token:move, chat:send with /roll and /action, initiative) |
| `server/src/vision.ts` | Ray-cast fog of war, wall-blocked LOS |
| `client/src/features/session/useSession.ts` | All real-time state (tokens, fog, walls, chat, initiative) |
| `client/src/pages/CampaignSessionPage.tsx` | Main session UI — map, DM bar (left), panels (right) |
| `client/src/features/session/InGameSheet.tsx` | Player in-game character sheet (HP, spells, conditions, death saves) |
| `client/src/features/session/MonsterSheet.tsx` | Library monster stat block panel |
| `client/src/features/session/NpcSheet.tsx` | Campaign NPC stat block panel (NEW) |
| `client/src/features/session/NpcForm.tsx` | Campaign NPC creation/edit form (NEW) |
| `client/src/pages/CampaignDetailPage.tsx` | Campaign detail — players, My NPCs section |

---

## Panel system (right-side panels in session)

`panel` state in CampaignSessionPage is a union:
```typescript
| { type: 'character'; characterId: number; tokenId: number; canEdit: boolean }
| { type: 'monster'; slug: string; tokenId?: number; hp: number; hpMax: number; encounterUid?: string }
| { type: 'npc'; npcId: number; tokenId?: number; hp: number; hpMax: number }
```
- `character`: opens InGameSheet (player or DM)
- `monster`: opens MonsterSheet (fetches from library by slug)
- `npc`: opens NpcSheet (looks up from `npcs` state array by npcId)

---

## DM left bar layout (Monsters tab)

```
[ Encounter tracker ] — draggable to map, click name → opens sheet
[ My NPCs ]           — permanent list, always visible, draggable to map
[ Monster search ]    — searches library only (NPCs shown above)
[ Search results ]    — draggable to map
```

---

## Token types on the map

| Token | `token_type` | Key field | Sheet on click |
|---|---|---|---|
| PC | `pc` | `character_id` | InGameSheet |
| Library monster | `npc` | `monster_slug` | MonsterSheet |
| Campaign NPC | `npc` | `campaign_npc_id` | NpcSheet |

---

## Things left to do / known issues

### Phase 7 — Fantasy UI theme (approved next phase)
- All UI currently uses inline styles (plain/functional)
- Migrate to fantasy theme via Claude Design
- Target: parchment background, serif headings, illustrated borders, dark/candlelight palette

### Queued gameplay features (discussed, not yet built)
- **Spell slot tracker** in InGameSheet (bubbles per level, spend/recover)
- **Hit dice tracker** in InGameSheet (roll HD during short rest)
- **Class resource tracker** (Rage, Ki, Channel Divinity, etc.)
- **Long rest / short rest buttons** (reset HP, slots, resources)
- **Advantage/disadvantage toggle** on dice rolls (Adv/N/Dis buttons)
- **Map folders** (nest maps in collapsible folders in DM bar)
- **DM bar reorganisation** (wall/fog/initiative controls moved inside DM bar, collapse arrow)
- **Passive perception** display (already stored, not surfaced in session UI)
- **Initiative — auto-roll for monsters** (currently DM types in manually)

### Minor known issues
- NPC saving throw proficiency bonus is hardcoded +2 in NpcSheet (should scale with CR or be user-defined)
- Campaign NPC tokens placed before the new columns were added will show default stat blocks (10 in all abilities, AC 10) — expected behaviour, DM edits the NPC to fill in stats

---

## Commit checklist before any new work

```bash
git status   # make sure .env and .db are NOT staged
git log --oneline -5
```

Never push `server/.env` or `server/data/game.db`.

---

## How the DM workflow flows

1. DM goes to Campaign Detail page → adds NPCs with full stat blocks under "My NPCs"
2. In session, DM opens Monsters tab
3. "My NPCs" section shows all campaign NPCs — drag to map to place token
4. Library monster search below — drag to map to place token (auto-sizes from monster data)
5. Encounter tracker at top — add monsters/NPCs with `+`, drag those to map too
6. Click any NPC/monster token → sheet slides in from right with rollable stats + HP management
