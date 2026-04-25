import { io } from 'socket.io-client';

// Auth callback runs on every connection attempt, so it always picks up the latest token.
export const socket = io('http://localhost:3001', {
  autoConnect: false,
  auth: (cb) => cb({ token: localStorage.getItem('dnd_token') ?? '' }),
});
