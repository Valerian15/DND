import type { Server, Socket } from 'socket.io';
import { verifyToken, type AuthUser } from './auth/index.js';
import { db } from './db/index.js';

interface OnlineUser {
  user_id: number;
  username: string;
  role: string;
}

interface MapRow {
  id: number;
  campaign_id: number;
  name: string;
  image_url: string;
  grid_size: number;
  grid_offset_x: number;
  grid_offset_y: number;
  created_at: number;
}

interface ServerToClientEvents {
  'session:state': (state: { online: OnlineUser[]; active_map: MapRow | null }) => void;
  'session:presence': (data: { online: OnlineUser[] }) => void;
  'map:switched': (map: MapRow | null) => void;
}

interface ClientToServerEvents {
  'session:join': (data: { campaign_id: number }) => void;
}

interface SocketData {
  user: AuthUser;
  campaign_id?: number;
}

export type AppServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

// In-memory presence: campaignId → socketId → OnlineUser
const presence = new Map<number, Map<string, OnlineUser>>();

function onlineList(campaignId: number): OnlineUser[] {
  const room = presence.get(campaignId);
  if (!room) return [];
  return [...new Map([...room.values()].map((u) => [u.user_id, u])).values()];
}

function getActiveMap(campaignId: number): MapRow | null {
  const row = db.prepare(`
    SELECT m.* FROM maps m
    JOIN campaigns c ON c.active_map_id = m.id
    WHERE c.id = ?
  `).get(campaignId) as MapRow | undefined;
  return row ?? null;
}

export function setupSession(io: AppServer) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Missing token'));
    const user = verifyToken(token);
    if (!user) return next(new Error('Invalid token'));
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket: AppSocket) => {
    const user = socket.data.user;

    socket.on('session:join', ({ campaign_id }) => {
      const room = `campaign:${campaign_id}`;
      socket.join(room);
      socket.data.campaign_id = campaign_id;

      if (!presence.has(campaign_id)) presence.set(campaign_id, new Map());
      presence.get(campaign_id)!.set(socket.id, {
        user_id: user.id,
        username: user.username,
        role: user.role,
      });

      // Full state snapshot for the joining client
      socket.emit('session:state', {
        online: onlineList(campaign_id),
        active_map: getActiveMap(campaign_id),
      });

      // Updated presence for everyone in the room
      io.to(room).emit('session:presence', { online: onlineList(campaign_id) });
    });

    socket.on('disconnect', () => {
      const campaign_id = socket.data.campaign_id;
      if (campaign_id == null) return;

      const room = presence.get(campaign_id);
      if (room) {
        room.delete(socket.id);
        if (room.size === 0) presence.delete(campaign_id);
      }

      io.to(`campaign:${campaign_id}`).emit('session:presence', {
        online: onlineList(campaign_id),
      });
    });
  });
}
