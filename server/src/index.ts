import 'dotenv/config';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { db, initSchema } from './db/index.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import libraryRoutes from './routes/library.js';
import characterRoutes from './routes/characters.js';
import campaignRoutes from './routes/campaigns.js';
import { setupSession, type AppServer } from './session.js';

initSchema();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/hello', (_req, res) => {
  res.json({ message: 'Hello from the DND server! 🐉' });
});

app.get('/api/users/count', (_req, res) => {
  const row = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  res.json({ count: row.count });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/characters', characterRoutes);
app.use('/api/campaigns', campaignRoutes);

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: '*' },
}) as AppServer;

setupSession(io);

const PORT = Number(process.env.PORT) || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
