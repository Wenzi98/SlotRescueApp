require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const path = require('node:path');
const app = express();
const SQLiteSessionStore = require('./db/session-store');
const requireAuth = require('./middleware/require-auth');
const authRoutes = require('./routes/auth');
const settingsRoutes = require('./routes/settings');
const servicesRoutes = require('./routes/services');
const waitlistRoutes = require('./routes/waitlist');
const openingsRoutes = require('./routes/openings');
const dashboardRoutes = require('./routes/dashboard');
const activityRoutes = require('./routes/activity');

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set in the .env file.');
}

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(session({
  name: 'slotrescue.sid',
  secret: process.env.SESSION_SECRET,
  store: new SQLiteSessionStore(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000
  }
}));

app.use('/api/auth', authRoutes);
app.use('/api', requireAuth);
app.use('/api/business', settingsRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/waitlist', waitlistRoutes);
app.use('/api/openings', openingsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/activity', activityRoutes);

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Back end is working' });
});

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'Request body must be valid JSON.' });
  }
  return res.status(500).json({ error: 'An unexpected server error occurred.' });
});

app.get('/', (req, res) => {
  if (!req.session.user) return res.redirect('/login.html');
  return res.sendFile(path.join(__dirname, 'public', 'Index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(3000, () => {
  console.log('Running at http://localhost:3000');
});