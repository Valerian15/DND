import type { AppServer } from './session.js';

let _io: AppServer | null = null;

export function setIo(io: AppServer): void {
  _io = io;
}

export function getIo(): AppServer {
  if (!_io) throw new Error('Socket.io not initialised yet');
  return _io;
}

/**
 * Emit an event to every socket in a campaign room that passes the filter.
 * Used for token events that must be filtered per-user (players can't see all tokens).
 */
export function broadcastFiltered(
  campaignId: number,
  event: string,
  payload: unknown,
  filter: (userId: number, role: string) => boolean,
): void {
  if (!_io) return;
  const roomSockets = _io.sockets.adapter.rooms.get(`campaign:${campaignId}`);
  if (!roomSockets) return;
  for (const socketId of roomSockets) {
    const sock = _io.sockets.sockets.get(socketId);
    if (!sock) continue;
    const u = sock.data?.user as { id: number; role: string } | undefined;
    if (u && filter(u.id, u.role)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sock as any).emit(event, payload);
    }
  }
}
