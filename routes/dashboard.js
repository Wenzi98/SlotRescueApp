'use strict';

const express = require('express');
const db = require('../db/database');

const router = express.Router();
const businessId = 1;

router.get('/', (req, res) => {
  const business = db.prepare(`
    SELECT id, name, location, phone, lead_provider, require_popia_consent
    FROM businesses WHERE id = ?
  `).get(businessId);
  if (!business) {
    return res.status(404).json({ error: 'Business was not found.' });
  }

  db.prepare(`
    UPDATE openings
    SET status = 'expired'
    WHERE business_id = ? AND status IN ('open', 'broadcasting')
      AND start_date || ' ' || start_time <= datetime('now', 'localtime')
  `).run(businessId);

  const metrics = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM openings
        WHERE business_id = ? AND status IN ('open', 'broadcasting')) AS open_count,
      (SELECT COUNT(*) FROM broadcast_recipients recipients
        JOIN broadcasts ON broadcasts.id = recipients.broadcast_id
        WHERE broadcasts.business_id = ? AND recipients.status IN ('sent', 'delivered')) AS sent_count,
      (SELECT COALESCE(SUM(price_zar), 0) FROM claims
        JOIN openings ON openings.id = claims.opening_id
        WHERE openings.business_id = ? AND claims.status = 'claimed') AS saved_total,
      (SELECT COUNT(*) FROM claims
        JOIN openings ON openings.id = claims.opening_id
        WHERE openings.business_id = ? AND claims.status = 'claimed'
          AND claims.claimed_at >= datetime('now', '-7 days')) AS appointments_this_week
  `).get(businessId, businessId, businessId, businessId);

  return res.json({
    business: {
      id: business.id,
      name: business.name,
      location: business.location,
      phone: business.phone || '',
      leadProvider: business.lead_provider,
      requirePopiaConsent: Boolean(business.require_popia_consent)
    },
    metrics: {
      openCount: metrics.open_count,
      sentCount: metrics.sent_count,
      savedTotal: metrics.saved_total,
      appointmentsThisWeek: metrics.appointments_this_week
    }
  });
});

module.exports = router;
