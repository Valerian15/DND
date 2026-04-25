import type { AppServer } from './session.js';

let _io: AppServer | null = null;

export function setIo(io: AppServer): void {
  _io = io;
}

export function getIo(): AppServer {
  if (!_io) throw new Error('Socket.io not initialised yet');
  return _io;
}
