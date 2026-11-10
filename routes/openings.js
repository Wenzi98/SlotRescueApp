'use strict';

const express = require('express');
const db = require('../db/database');

const router = express.Router();
const businessId = 1;
const statuses = new Set(['open', 'broadcasting', 'claimed', 'expired', 'cancelled']);
const allowedTransitions = {
  open: new Set(['open', 'broadcasting', 'claimed', 'expired', 'cancelled']),
  broadcasting: new Set(['broadcasting', 'open', 'claimed', 'expired', 'cancelled']),
  claimed: new Set(['claimed', 'cancelled']),
  expired: new Set(['expired']),
  cancelled: new Set(['cancelled'])
};

function expirePastOpenings() {
  db.prepare(`
    UPDATE openings
    SET status = 'expired'
    WHERE status IN ('open', 'broadcasting')
      AND start_date || ' ' || start_time <= datetime('now', 'localtime')
  `).run();
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year
    && parsed.getMonth() === month - 1
    && parsed.getDate() === day;
}

function isValidTime(value) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function isFutureStart(date, time) {
  return new Date(`${date}T${time}:00`).getTime() > Date.now();
}

function isPositiveNumber(value) {
  return (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
    && Number.isFinite(Number(value))
    && Number(value) > 0;
}

function isPositiveInteger(value) {
  return (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
    && Number.isInteger(Number(value))
    && Number(value) > 0;
}

function getService(serviceId) {
  return db.prepare(`
    SELECT id, name, category, duration_minutes, price_zar
    FROM services
    WHERE id = ? AND business_id = ? AND is_active = 1
  `).get(serviceId, businessId);
}

function formatOpening(row) {
  return {
    id: row.id,
    serviceId: row.service_id,
    serviceName: row.service_name,
    serviceCategory: row.service_category,
    providerName: row.provider_name,
    date: row.start_date,
    startTime: row.start_time,
    duration: row.duration_minutes,
    price: row.price_zar,
    incentive: row.incentive,
    status: row.status
  };
}

function getOpeningById(openingId) {
  return db.prepare(`
    SELECT openings.id, openings.service_id, openings.service_name,
      services.category AS service_category, openings.provider_name,
      openings.start_date, openings.start_time, openings.duration_minutes,
      openings.price_zar, openings.incentive, openings.status
    FROM openings JOIN services ON services.id = openings.service_id
    WHERE openings.id = ? AND openings.business_id = ?
  `).get(openingId, businessId);
}

function parseOpeningId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function validateDateAndTime(date, time) {
  if (!isValidDate(date)) return 'Date must be a valid YYYY-MM-DD date.';
  if (!isValidTime(time)) return 'Start time must use 24-hour HH:MM format.';
  if (!isFutureStart(date, time)) return 'Appointment date and time must be in the future.';
  return null;
}

router.get('/', (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const date = typeof req.query.date === 'string' ? req.query.date : '';
  if (status && !statuses.has(status)) {
    return res.status(400).json({ error: 'Choose a valid appointment status.' });
  }
  if (date && !isValidDate(date)) {
    return res.status(400).json({ error: 'Date filter must use YYYY-MM-DD format.' });
  }

  expirePastOpenings();
  const conditions = ['openings.business_id = ?'];
  const values = [businessId];
  if (status) {
    conditions.push('openings.status = ?');
    values.push(status);
  }
  if (date) {
    conditions.push('openings.start_date = ?');
    values.push(date);
  }

  const openings = db.prepare(`
    SELECT openings.id, openings.service_id, openings.service_name,
      services.category AS service_category, openings.provider_name,
      openings.start_date, openings.start_time,
      openings.duration_minutes, openings.price_zar, openings.incentive, openings.status
    FROM openings
    JOIN services ON services.id = openings.service_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY openings.start_date, openings.start_time, openings.id
  `).all(...values).map(formatOpening);

  return res.json({ openings, count: openings.length });
});

router.post('/', (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body
    : {};
  const serviceId = Number(body.serviceId);
  const duration = Number(body.duration);
  const price = Number(body.price);
  const status = body.status === undefined ? 'open' : body.status;
  const providerName = typeof body.providerName === 'string'
    ? body.providerName.trim()
    : '';
  const incentive = body.incentive === undefined || body.incentive === null ? null : body.incentive;

  if (!isPositiveInteger(body.serviceId)) {
    return res.status(400).json({ error: 'Choose a valid service.' });
  }
  if (!isPositiveInteger(body.duration)) {
    return res.status(400).json({ error: 'Duration must be a positive whole number of minutes.' });
  }
  if (!isPositiveNumber(body.price)) {
    return res.status(400).json({ error: 'Price must be a positive number.' });
  }
  const dateError = validateDateAndTime(body.date, body.startTime);
  if (dateError) return res.status(400).json({ error: dateError });
  if (status !== 'open') {
    return res.status(400).json({ error: 'New appointments must start with open status.' });
  }
  if (typeof body.providerName !== 'undefined'
      && (typeof body.providerName !== 'string' || !providerName || providerName.length > 100)) {
    return res.status(400).json({ error: 'Provider name must be 1 to 100 characters.' });
  }
  if (incentive !== null && (typeof incentive !== 'string' || incentive.length > 300)) {
    return res.status(400).json({ error: 'Incentive must be text of 300 characters or fewer.' });
  }

  const service = getService(serviceId);
  if (!service) {
    return res.status(404).json({ error: 'Service was not found.' });
  }
  const business = db.prepare('SELECT lead_provider FROM businesses WHERE id = ?').get(businessId);
  if (!business) {
    return res.status(404).json({ error: 'Business was not found.' });
  }

  const result = db.prepare(`
    INSERT INTO openings (
      business_id, service_id, service_name, provider_name, start_date,
      start_time, duration_minutes, price_zar, incentive, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
  `).run(
    businessId, service.id, service.name, providerName || business.lead_provider,
    body.date, body.startTime, duration, price, incentive
  );
  const opening = getOpeningById(result.lastInsertRowid);
  return res.status(201).json({ message: 'Appointment created.', opening: formatOpening(opening) });
});

router.get('/:openingId', (req, res) => {
  const openingId = parseOpeningId(req.params.openingId);
  if (!openingId) {
    return res.status(400).json({ error: 'Appointment ID must be a positive whole number.' });
  }

  expirePastOpenings();
  const opening = getOpeningById(openingId);
  if (!opening) {
    return res.status(404).json({ error: 'Appointment was not found.' });
  }
  return res.json({ opening: formatOpening(opening) });
});

router.patch('/:openingId', (req, res) => {
  const openingId = parseOpeningId(req.params.openingId);
  if (!openingId) {
    return res.status(400).json({ error: 'Appointment ID must be a positive whole number.' });
  }
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body
    : {};
  const allowedFields = new Set([
    'serviceId', 'date', 'startTime', 'duration', 'price', 'providerName', 'incentive', 'status'
  ]);
  const fields = Object.keys(body);
  if (fields.length === 0 || fields.some(field => !allowedFields.has(field))) {
    return res.status(400).json({ error: 'Provide valid appointment details to update.' });
  }

  expirePastOpenings();
  const existing = getOpeningById(openingId);
  if (!existing) {
    return res.status(404).json({ error: 'Appointment was not found.' });
  }

  const requestedStatus = body.status === undefined ? existing.status : body.status;
  if (!statuses.has(requestedStatus)
      || !allowedTransitions[existing.status].has(requestedStatus)) {
    return res.status(400).json({ error: `Appointment cannot change from ${existing.status} to ${requestedStatus}.` });
  }

  const changesDetails = fields.some(field => field !== 'status');
  if (changesDetails && !['open', 'broadcasting'].includes(existing.status)) {
    return res.status(400).json({ error: 'Only open or broadcasting appointments can have their details edited.' });
  }

  const serviceId = body.serviceId === undefined ? existing.service_id : Number(body.serviceId);
  if (!isPositiveInteger(serviceId)) {
    return res.status(400).json({ error: 'Choose a valid service.' });
  }
  const service = body.serviceId === undefined || serviceId === existing.service_id
    ? db.prepare(`
      SELECT id, name, category, duration_minutes, price_zar
      FROM services WHERE id = ? AND business_id = ?
    `).get(serviceId, businessId)
    : getService(serviceId);
  if (!service) {
    return res.status(404).json({ error: 'Service was not found.' });
  }

  const date = body.date === undefined ? existing.start_date : body.date;
  const startTime = body.startTime === undefined ? existing.start_time : body.startTime;
  const duration = body.duration === undefined ? existing.duration_minutes : Number(body.duration);
  const price = body.price === undefined ? existing.price_zar : Number(body.price);
  const providerName = body.providerName === undefined
    ? existing.provider_name
    : (typeof body.providerName === 'string' ? body.providerName.trim() : '');
  const incentive = body.incentive === undefined ? existing.incentive : body.incentive;

  if (changesDetails) {
    const dateError = validateDateAndTime(date, startTime);
    if (dateError) return res.status(400).json({ error: dateError });
    if (body.duration !== undefined && !isPositiveInteger(body.duration)) {
      return res.status(400).json({ error: 'Duration must be a positive whole number of minutes.' });
    }
    if (body.price !== undefined && !isPositiveNumber(body.price)) {
      return res.status(400).json({ error: 'Price must be a positive number.' });
    }
    if (body.providerName !== undefined && (!providerName || providerName.length > 100)) {
      return res.status(400).json({ error: 'Provider name must be 1 to 100 characters.' });
    }
    if (incentive !== null && (typeof incentive !== 'string' || incentive.length > 300)) {
      return res.status(400).json({ error: 'Incentive must be text of 300 characters or fewer.' });
    }
  }

  db.prepare(`
    UPDATE openings
    SET service_id = ?, service_name = ?, start_date = ?, start_time = ?,
      duration_minutes = ?, price_zar = ?, provider_name = ?, incentive = ?, status = ?
    WHERE id = ? AND business_id = ?
  `).run(
    service.id, service.name, date, startTime, duration, price,
    providerName, incentive, requestedStatus, openingId, businessId
  );

  return res.json({
    message: requestedStatus === 'cancelled' ? 'Appointment cancelled.' : 'Appointment updated.',
    opening: formatOpening(getOpeningById(openingId))
  });
});

router.delete('/:openingId', (req, res) => {
  const openingId = parseOpeningId(req.params.openingId);
  if (!openingId) {
    return res.status(400).json({ error: 'Appointment ID must be a positive whole number.' });
  }

  expirePastOpenings();
  const opening = getOpeningById(openingId);
  if (!opening) {
    return res.status(404).json({ error: 'Appointment was not found.' });
  }
  if (!allowedTransitions[opening.status].has('cancelled')) {
    return res.status(400).json({ error: `A ${opening.status} appointment cannot be cancelled.` });
  }

  db.prepare(`
    UPDATE openings SET status = 'cancelled'
    WHERE id = ? AND business_id = ?
  `).run(openingId, businessId);
  return res.json({ message: 'Appointment cancelled.', opening: formatOpening(getOpeningById(openingId)) });
});

module.exports = router;
