'use strict';

const express = require('express');
const db = require('../db/database');

const router = express.Router();
const businessId = 1;

function formatSettings(row) {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    phone: row.phone || '',
    leadProvider: row.lead_provider,
    requirePopiaConsent: Boolean(row.require_popia_consent)
  };
}

router.get('/settings', (req, res) => {
  const business = db.prepare('SELECT * FROM businesses WHERE id = ?').get(businessId);
  if (!business) {
    return res.status(404).json({ error: 'Business settings were not found.' });
  }
  return res.json({ settings: formatSettings(business) });
});

router.put('/settings', (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body
    : {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const location = typeof body.location === 'string' ? body.location.trim() : '';
  const leadProvider = typeof body.leadProvider === 'string'
    ? body.leadProvider.trim()
    : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';

  if (!name || !location || !leadProvider) {
    return res.status(400).json({
      error: 'Business name, location, and default provider are required.'
    });
  }
  if (body.phone !== undefined && typeof body.phone !== 'string') {
    return res.status(400).json({ error: 'Contact phone must be text.' });
  }
  if (typeof body.requirePopiaConsent !== 'boolean') {
    return res.status(400).json({ error: 'POPIA consent setting must be true or false.' });
  }

  const existingBusiness = db.prepare('SELECT id FROM businesses WHERE id = ?').get(businessId);
  if (!existingBusiness) {
    return res.status(404).json({ error: 'Business settings were not found.' });
  }

  db.prepare(`
    UPDATE businesses
    SET name = ?, location = ?, phone = ?, lead_provider = ?,
        require_popia_consent = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    name,
    location,
    phone,
    leadProvider,
    body.requirePopiaConsent ? 1 : 0,
    businessId
  );

  const updatedBusiness = db.prepare('SELECT * FROM businesses WHERE id = ?').get(businessId);
  return res.json({
    message: 'Business settings saved.',
    settings: formatSettings(updatedBusiness)
  });
});

module.exports = router;
