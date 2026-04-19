const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getDb } = require('./db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'kaseki-default-secret-change-me';

function authenticate(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

router.post('/register', (req, res) => {
  const { username, email, password, displayName } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'Username, email and password are required' });
  if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email address' });

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username.toLowerCase(), email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'Username or email already taken' });

  const passwordHash = bcrypt.hashSync(password, 12);
  const result = db.prepare('INSERT INTO users (username, email, password_hash, display_name) VALUES (?, ?, ?, ?)').run(username.toLowerCase(), email.toLowerCase(), passwordHash, displayName || username);
  const userId = result.lastInsertRowid;

  // Kaseki v2 organises notes per-space / per-day / per-task; nothing needs
  // to be seeded at registration. The two INSERTs that lived here were
  // remnants from v1's "home" and "work" section-scoped notes feature and
  // were causing HTTP 500 on every new registration since v2 launched.
  // The v2 `notes` table has no `section` column (see db.js migration
  // logic, which explicitly drops any section-scoped v1 tables), so the
  // old INSERTs failed with SqliteError. Users still got a valid account
  // because user creation ran first, but the error short-circuited the
  // response, producing a confusing "500" on the frontend despite the
  // account actually existing.

  const token = jwt.sign({ id: userId, username: username.toLowerCase() }, JWT_SECRET, { expiresIn: '30d' });
  res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.json({ user: { id: userId, username: username.toLowerCase(), email: email.toLowerCase(), displayName: displayName || username }, token });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username.toLowerCase(), username.toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid username or password' });
  if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Invalid username or password' });

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
  res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.json({ user: { id: user.id, username: user.username, email: user.email, displayName: user.display_name }, token });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

router.get('/me', authenticate, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, username, email, display_name, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: { id: user.id, username: user.username, email: user.email, displayName: user.display_name, createdAt: user.created_at } });
});

router.post('/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.json({ message: 'If an account with that email exists, a reset link has been generated' });
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 3600000).toISOString();
  db.prepare('INSERT INTO reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, token, expiresAt);
  res.json({ message: 'Password reset token generated', resetToken: token, expiresIn: '1 hour' });
});

router.post('/reset-password', (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password are required' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const db = getDb();
  const resetToken = db.prepare('SELECT * FROM reset_tokens WHERE token = ? AND used = 0 AND expires_at > datetime("now")').get(token);
  if (!resetToken) return res.status(400).json({ error: 'Invalid or expired reset token' });
  const passwordHash = bcrypt.hashSync(newPassword, 12);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(passwordHash, resetToken.user_id);
  db.prepare('UPDATE reset_tokens SET used = 1 WHERE id = ?').run(resetToken.id);
  res.json({ message: 'Password has been reset successfully' });
});

module.exports = { router, authenticate, JWT_SECRET };
