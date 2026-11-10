'use strict';

const express = require('express');
const db = require('../db/database');

const router = express.Router();
const businessId = 1;

router.get('/', (req, res) => {
  const limit = req.query.limit === undefined ? 10 : Number(req.query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return res.status(400).json({ error: 'Activity limit must be a whole number from 1 to 50.' });
  }

  const items = db.prepare(`
    SELECT claims.id, clients.name AS client_name, services.name AS service_name,
      services.category AS service_category, openings.provider_name,
      openings.start_date, openings.start_time, claims.price_zar, claims.claimed_at
    FROM claims
    JOIN openings ON openings.id = claims.opening_id
    JOIN services ON services.id = openings.service_id
    JOIN clients ON clients.id = claims.client_id
    WHERE openings.business_id = ? AND claims.status = 'claimed'
    ORDER BY claims.claimed_at DESC
    LIMIT ?
  `).all(businessId, limit).map(item => ({
    id: item.id,
    clientName: item.client_name,
    serviceName: item.service_name,
    serviceCategory: item.service_category,
    providerName: item.provider_name,
    date: item.start_date,
    startTime: item.start_time,
    price: item.price_zar,
    claimedAt: item.claimed_at
  }));

  return res.json({ activities: items });
});

module.exports = router;
