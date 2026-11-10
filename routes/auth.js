'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');
const db = require('../db/database');

const router = express.Router();
const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-up attempts. Please try again in 15 minutes.' }
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' }
});
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    business: {
      id: row.business_id,
      name: row.business_name
    }
  };
}

function regenerateLoginSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate(error => {
      if (error) return reject(error);
      req.session.user = {
        id: user.id,
        businessId: user.business_id
      };
      return req.session.save(saveError => saveError ? reject(saveError) : resolve());
    });
  });
}

function isObjectBody(body) {
  return body && typeof body === 'object' && !Array.isArray(body);
}

router.post('/signup', signupLimiter, async (req, res) => {
  const body = isObjectBody(req.body) ? req.body : {};
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
  const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';
  const fieldErrors = {};

  if (!fullName || fullName.length > 120) fieldErrors.fullName = 'Enter your name (up to 120 characters).';
  if (!businessName || businessName.length > 120) fieldErrors.businessName = 'Enter a business name (up to 120 characters).';
  if (!emailPattern.test(email) || email.length > 254) fieldErrors.email = 'Enter a valid email address.';
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    fieldErrors.password = 'Use at least 8 characters, including a letter and a number.';
  }
  if (!confirmPassword || password !== confirmPassword) {
    fieldErrors.confirmPassword = 'Passwords do not match.';
  }
  if (body.acceptedTerms !== true) {
    fieldErrors.acceptedTerms = 'You must agree to the Terms and Privacy Policy.';
  }
  if (Object.keys(fieldErrors).length > 0) {
    return res.status(400).json({ error: 'Check the highlighted fields.', fieldErrors });
  }

  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existingUser) {
    return res.status(409).json({
      error: 'An account with this email already exists.',
      fieldErrors: { email: 'An account with this email already exists.' }
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const createAccount = db.transaction(() => {
      const businessResult = db.prepare(`
        INSERT INTO businesses (name, location, lead_provider)
        VALUES (?, 'Not set', ?)
      `).run(businessName, fullName);
      const businessId = Number(businessResult.lastInsertRowid);
      const userResult = db.prepare(`
        INSERT INTO users (business_id, full_name, email, password_hash)
        VALUES (?, ?, ?, ?)
      `).run(businessId, fullName, email, passwordHash);
      return {
        id: Number(userResult.lastInsertRowid),
        business_id: businessId,
        full_name: fullName,
        email,
        business_name: businessName
      };
    });

    const user = createAccount();
    await regenerateLoginSession(req, user);
    return res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({
        error: 'An account with this email already exists.',
        fieldErrors: { email: 'An account with this email already exists.' }
      });
    }
    throw error;
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  const body = isObjectBody(req.body) ? req.body : {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = db.prepare(`
    SELECT users.id, users.business_id, users.full_name, users.email,
      users.password_hash, businesses.name AS business_name
    FROM users
    JOIN businesses ON businesses.id = users.business_id
    WHERE users.email = ?
  `).get(email);
  const validPassword = user ? await bcrypt.compare(password, user.password_hash) : false;
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  try {
    await regenerateLoginSession(req, user);
  } catch (error) {
    return res.status(500).json({ error: 'Could not start a secure session.' });
  }
  return res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  if (!req.session) return res.json({ message: 'Logged out.' });
  req.session.destroy(error => {
    if (error) return res.status(500).json({ error: 'Could not end the session.' });
    res.clearCookie('slotrescue.sid', { httpOnly: true, sameSite: 'lax' });
    return res.json({ message: 'Logged out.' });
  });
});

router.get('/me', (req, res) => {
  if (!req.session?.user?.id) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const user = db.prepare(`
    SELECT users.id, users.business_id, users.full_name, users.email,
      businesses.name AS business_name
    FROM users
    JOIN businesses ON businesses.id = users.business_id
    WHERE users.id = ?
  `).get(req.session.user.id);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  return res.json({ user: publicUser(user) });
});

module.exports = router;
