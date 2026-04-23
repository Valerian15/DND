import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { db, initSchema } from './db/index.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import libraryRoutes from './routes/library.js';
import characterRoutes from './routes/characters.js';

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

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
