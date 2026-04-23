import bcrypt from 'bcrypt';
import { db, initSchema } from './index.js';
import 'dotenv/config';

async function seed() {
  initSchema();

  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminUsername || !adminPassword) {
    console.error('❌ ADMIN_USERNAME and ADMIN_PASSWORD must be set in .env');
    process.exit(1);
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUsername);
  if (existing) {
    console.log(`ℹ️  Admin user "${adminUsername}" already exists. Skipping.`);
    return;
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  db.prepare(
    'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)'
  ).run(adminUsername, passwordHash, 'admin');

  console.log(`✅ Admin user "${adminUsername}" created.`);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
