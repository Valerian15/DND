import type { Server, Socket } from 'socket.io';
import { verifyToken, type AuthUser } from './auth/index.js';

interface OnlineUser {
  user_id: number;
  username: string;
  role: string;
}

interface ServerToClientEvents {
  'session:state': (state: { online: OnlineUser[] }) => void;
  'session:presence': (data: { online: OnlineUser[] }) => void;
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
  // Deduplicate by user_id (same user on multiple tabs counts once)
  return [...new Map([...room.values()].map((u) => [u.user_id, u])).values()];
}

export function setupSession(io: AppServer) {
  // Validate JWT on every connection attempt
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
      socket.emit('session:state', { online: onlineList(campaign_id) });

      // Updated presence for everyone already in the room
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
