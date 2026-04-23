import { Router } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../db/index.js';
import { requireAuth, requireAdmin, type AuthRequest } from '../auth/index.js';

const router = Router();

// All routes below require auth
router.use(requireAuth);

// List all users (admin only)
router.get('/', requireAdmin, (_req, res) => {
  const rows = db
    .prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at DESC')
    .all();
  res.json({ users: rows });
});

// Create a new user (admin only)
router.post('/', requireAdmin, async (req, res) => {
  const { username, password, role } = req.body ?? {};

  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username and password required' });
  }
  if (username.length < 3 || username.length > 32) {
    return res.status(400).json({ error: 'Username must be 3–32 characters' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (role !== 'admin' && role !== 'player') {
    return res.status(400).json({ error: 'Role must be admin or player' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const info = db
    .prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
    .run(username, passwordHash, role);

  const newUser = db
    .prepare('SELECT id, username, role, created_at FROM users WHERE id = ?')
    .get(info.lastInsertRowid);

  res.status(201).json({ user: newUser });
});

// Reset a user's password (admin only)
router.post('/:id/reset-password', requireAdmin, async (req, res) => {
  const { password } = req.body ?? {};
  const id = Number(req.params.id);

  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const passwordHash = await bcrypt.hash(password, 12);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);

  res.json({ ok: true });
});

// Delete a user (admin only). Cannot delete yourself.
router.delete('/:id', requireAdmin, (req: AuthRequest, res) => {
  const id = Number(req.params.id);

  if (req.user?.id === id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

export default router;
