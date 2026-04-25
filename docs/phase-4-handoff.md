# Phase 4 — Real-time session: map, tokens, HP, conditions

## Goal

Turn the session placeholder page into a live shared tabletop. The DM controls the map and all
tokens; players control their own character token. Everything syncs in real-time via Socket.io.

This phase does NOT include:
- Fog of war / vision (Phase 6)
- Chat, dice, initiative tracker (Phase 5)
- 3D token models (deferred indefinitely — 2D portraits now, 3D is a future phase)

---

## Feature spec

### Maps
- DM can upload multiple map images per campaign (paste URL for now, same pattern as portrait_url).
- DM switches the "active map" for the session — all connected clients update immediately.
- Each map has a configurable grid: cell size in pixels + x/y offset to align with the map image's
  printed grid lines.
- The grid is rendered as an SVG overlay on top of the map image — always visible.

### Tokens
- Two token types: **pc** (linked to a character row) and **npc** (DM-created, not linked to a character).
- Token display: portrait image if available, else a circle with the character's initial + name label below.
- Size follows 5e rules — controls how many cells the token occupies:
  - Tiny / Small / Medium → 1×1
  - Large → 2×2
  - Huge → 3×3
  - Gargantuan → 4×4
- Position is stored as grid col/row of the token's top-left cell. Tokens always snap to the grid.
- Tokens are per-map (a token placed on map A is not visible on map B).

### HP bar on token
- Shown above each token.
- For **pc tokens**: bar and numbers are always visible to everyone. HP is synced from the
  character sheet (when the sheet updates HP, the token bar updates live).
- For **npc tokens**: bar and numbers are **hidden from players**. DM sees them; players see
  nothing (not even a greyed-out bar — pretend it doesn't exist).

### Token movement permissions
- DM can move any token.
- Player can move their own pc token.
- DM can grant control of specific npc tokens to specific users (e.g. animal companion, NPC ally).
  Stored as a JSON array of user IDs on the token row. DM manages this via a right-click /
  context menu on the token.

### Conditions (bonus — build if time allows, otherwise stub)
- Standard 5e conditions: blinded, charmed, deafened, exhaustion, frightened, grappled,
  incapacitated, invisible, paralyzed, petrified, poisoned, prone, restrained, stunned, unconscious.
- Shown as small icon badges on the token (bottom edge).
- DM can add/remove conditions on any token. Players can add/remove on their own pc token.
- Synced in real-time like position.

---

## Database additions

```sql
CREATE TABLE maps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  grid_size INTEGER NOT NULL DEFAULT 50,   -- pixels per cell at 1× zoom
  grid_offset_x INTEGER NOT NULL DEFAULT 0,
  grid_offset_y INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX idx_maps_campaign ON maps(campaign_id);

CREATE TABLE tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id INTEGER NOT NULL,
  token_type TEXT NOT NULL DEFAULT 'npc' CHECK (token_type IN ('pc', 'npc')),
  character_id INTEGER,           -- non-null for pc tokens
  label TEXT NOT NULL,            -- display name
  portrait_url TEXT,
  size TEXT NOT NULL DEFAULT 'medium'
    CHECK (size IN ('tiny','small','medium','large','huge','gargantuan')),
  col INTEGER NOT NULL DEFAULT 0,
  row INTEGER NOT NULL DEFAULT 0,
  hp_current INTEGER NOT NULL DEFAULT 0,
  hp_max INTEGER NOT NULL DEFAULT 0,
  hp_visible INTEGER NOT NULL DEFAULT 1,  -- 0 = hidden from players (NPC default)
  controlled_by TEXT NOT NULL DEFAULT '[]', -- JSON array of user IDs
  conditions TEXT NOT NULL DEFAULT '[]',    -- JSON array of condition strings
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL
);
```

Additionally, add to `campaigns`:
- `active_map_id INTEGER` (FK maps, nullable) — which map is currently shown in the session.

---

## Socket.io events

All events are scoped to a room: `campaign:{id}`.

**Client → Server**

| event | payload | who can emit |
|---|---|---|
| `session:join` | `{ campaign_id }` | anyone |
| `token:move` | `{ token_id, col, row }` | DM, token owner, granted users |
| `token:create` | `{ map_id, label, portrait_url, size, col, row, token_type, character_id? }` | DM |
| `token:delete` | `{ token_id }` | DM |
| `token:hp` | `{ token_id, hp_current, hp_max }` | DM (and auto-emitted when character sheet HP changes) |
| `token:conditions` | `{ token_id, conditions }` | DM, token owner |
| `token:grant-control` | `{ token_id, user_id }` | DM |
| `token:revoke-control` | `{ token_id, user_id }` | DM |
| `map:switch` | `{ map_id }` | DM |

**Server → Client (broadcast to room)**

| event | payload |
|---|---|
| `session:state` | full snapshot on join: active map, all tokens, who's online |
| `session:presence` | `{ online: [{ user_id, username }] }` |
| `token:moved` | `{ token_id, col, row }` |
| `token:created` | full token object |
| `token:deleted` | `{ token_id }` |
| `token:hp-updated` | `{ token_id, hp_current, hp_max }` (filtered server-side: NPC HP only sent to DM) |
| `token:conditions-updated` | `{ token_id, conditions }` |
| `map:switched` | full map object |

---

## Architecture notes

### Server
- Replace `app.listen()` with `http.createServer(app)` + `new Server(httpServer)`.
- Socket auth: read JWT from `socket.handshake.auth.token`, validate with `verifyToken()`.
  Reject connection if invalid.
- Session state (who's online, active map) lives in a `Map<campaignId, SessionState>` in memory.
  Token positions and conditions are persisted to DB (so server restart doesn't lose placement).
- The server filters NPC HP out of `token:hp-updated` broadcasts before sending to non-DM sockets.

### Client
- `useSession(campaignId)` hook manages the socket connection, exposes session state, and
  emits events. Lives in `client/src/features/session/`.
- Map + grid rendered in a `<MapView>` component: `<img>` for the map, `<svg>` overlay for the
  grid, absolutely-positioned `<div>`s for tokens.
- Token drag: pointer events (pointerdown/pointermove/pointerup), compute target cell from
  pointer position + grid config, emit `token:move` on drop.
- HP bar syncs: when CharacterSheet saves HP, it also emits `token:hp` if the character has a
  pc token in the current session map.

---

## Slices

**4a** — Socket.io server setup + session presence
- Install socket.io on server, wire up auth, rooms, presence events.
- Client: connect on session page, show who's online.
- No map or tokens yet.

**4b** — Maps: DB, REST routes, DM map management UI
- `maps` table + REST CRUD (list, create, delete, set active).
- Session page: DM sees map manager panel; clients see active map image + grid overlay.

**4c** — Tokens: DB, creation, rendering, drag-to-move
- `tokens` table + REST for create/delete.
- Render tokens on map. DM can place and delete. Token dragging snaps to grid.
- Real-time sync via socket events.

**4d** — HP sync + NPC visibility rules
- PC token HP bar wired to character sheet.
- NPC HP filtered server-side.
- DM grants/revokes token control for players.

**4e** — Conditions (bonus)
- Condition picker on token right-click.
- Icon badges on token.
- Real-time sync.

---

## Locked decisions

- 2D portrait tokens only for now. 3D models are a future phase.
- Tokens snap to grid — no free positioning.
- Multi-cell tokens use top-left cell as anchor.
- Active map is per-session (stored in memory + campaigns.active_map_id).
- NPC HP is hidden from players at the server level, not just CSS.
- One socket connection per browser tab on the session page.
