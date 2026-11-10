'use strict';

const express = require('express');
const db = require('../db/database');

const router = express.Router();
const businessId = 1;
const consentStatuses = new Set(['granted', 'withdrawn', 'pending']);
const channels = new Set(['whatsapp', 'sms']);

function normalizePhone(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/[\s()-]/g, '');
  if (/^0[6-8]\d{8}$/.test(cleaned)) return `+27${cleaned.slice(1)}`;
  if (/^\+27[6-8]\d{8}$/.test(cleaned)) return cleaned;
  return null;
}

function formatClient(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    preferredChannel: row.preferred_channel,
    consentStatus: row.consent_status,
    consentDate: row.consent_date,
    consentChangedAt: row.consent_changed_at,
    vip: Boolean(row.vip),
    appointmentsCount: row.appointments_count,
    availability: row.availability,
    preferredTime: row.preferred_time,
    preferredService: row.preferred_service
  };
}

function hasDuplicatePhone(phone, exceptClientId = null) {
  const duplicate = db.prepare(`
    SELECT id FROM clients
    WHERE business_id = ? AND phone = ? AND (? IS NULL OR id <> ?)
  `).get(businessId, phone, exceptClientId, exceptClientId);
  return Boolean(duplicate);
}

function handleDatabaseError(res, error) {
  if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: 'A client with that phone number already exists.' });
  }
  return res.status(500).json({ error: 'The client could not be saved.' });
}

router.get('/', (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const availability = typeof req.query.availability === 'string'
    ? req.query.availability.trim()
    : '';
  const vip = typeof req.query.vip === 'string' ? req.query.vip : '';
  const consent = typeof req.query.consent === 'string' ? req.query.consent : 'all';

  if (search.length > 100 || availability.length > 100) {
    return res.status(400).json({ error: 'Search and availability filters must be 100 characters or fewer.' });
  }
  if (vip && vip !== 'true' && vip !== 'false') {
    return res.status(400).json({ error: 'VIP filter must be true or false.' });
  }
  if (!['all', ...consentStatuses].includes(consent)) {
    return res.status(400).json({ error: 'Choose a valid consent filter.' });
  }

  const conditions = ['business_id = ?', 'is_waitlisted = 1'];
  const values = [businessId];

  if (search) {
    const searchText = `%${search.toLowerCase()}%`;
    const phoneSearch = `%${search.replace(/[\s()-]/g, '').toLowerCase()}%`;
    conditions.push('(LOWER(name) LIKE ? OR LOWER(phone) LIKE ?)');
    values.push(searchText, phoneSearch);
  }
  if (availability) {
    if (availability.toLowerCase() === 'today') {
      conditions.push(`(
        LOWER(availability) LIKE '%today%'
        OR LOWER(availability) LIKE '%flexible%'
        OR LOWER(availability) LIKE '%min%'
      )`);
    } else {
      conditions.push('LOWER(availability) = LOWER(?)');
      values.push(availability);
    }
  }
  if (vip) {
    conditions.push('vip = ?');
    values.push(vip === 'true' ? 1 : 0);
  }
  if (consent !== 'all') {
    conditions.push('consent_status = ?');
    values.push(consent);
  }

  const clients = db.prepare(`
    SELECT id, name, phone, preferred_channel, consent_status, consent_date,
      consent_changed_at, vip, appointments_count, availability, preferred_time,
      preferred_service
    FROM clients
    WHERE ${conditions.join(' AND ')}
    ORDER BY vip DESC, id
  `).all(...values).map(formatClient);

  return res.json({ clients, count: clients.length });
});

router.post('/', (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body
    : {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const phone = normalizePhone(body.phone);
  const availability = body.availability === undefined
    ? 'Not specified'
    : (typeof body.availability === 'string' ? body.availability.trim() : null);
  const preferredTime = body.preferredTime === undefined || body.preferredTime === null
    ? null
    : (typeof body.preferredTime === 'string' ? body.preferredTime.trim() : undefined);
  const preferredService = body.preferredService === undefined || body.preferredService === null
    ? null
    : (typeof body.preferredService === 'string' ? body.preferredService.trim() : undefined);
  const preferredChannel = body.preferredChannel === undefined || body.preferredChannel === null
    ? null
    : body.preferredChannel;
  const consentStatus = body.consentStatus === undefined ? 'pending' : body.consentStatus;
  const vip = body.vip === undefined ? false : body.vip;

  if (!name || name.length > 100) {
    return res.status(400).json({ error: 'Client name is required and must be 100 characters or fewer.' });
  }
  if (!phone) {
    return res.status(400).json({ error: 'Enter a valid South African mobile number, such as 0821234567.' });
  }
  if (availability === null || availability.length > 100) {
    return res.status(400).json({ error: 'Availability must be 100 characters or fewer.' });
  }
  if (preferredTime === undefined || preferredService === undefined) {
    return res.status(400).json({ error: 'Preferred time and service must be text.' });
  }
  if (preferredChannel !== null && !channels.has(preferredChannel)) {
    return res.status(400).json({ error: 'Preferred channel must be WhatsApp or SMS.' });
  }
  if (!consentStatuses.has(consentStatus)) {
    return res.status(400).json({ error: 'Consent status must be granted, withdrawn, or pending.' });
  }
  if (typeof vip !== 'boolean') {
    return res.status(400).json({ error: 'VIP status must be true or false.' });
  }
  if (hasDuplicatePhone(phone)) {
    return res.status(409).json({ error: 'A client with that phone number already exists.' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO clients (
        business_id, name, phone, preferred_channel, consent_status, consent_date,
        consent_changed_at, vip, availability, preferred_time, preferred_service,
        is_waitlisted
      ) VALUES (
        ?, ?, ?, ?, ?, CASE WHEN ? = 'granted' THEN CURRENT_TIMESTAMP ELSE NULL END,
        CURRENT_TIMESTAMP, ?, ?, ?, ?, 1
      )
    `).run(
      businessId, name, phone, preferredChannel, consentStatus, consentStatus,
      vip ? 1 : 0, availability || 'Not specified', preferredTime, preferredService
    );

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json({ message: 'Client added to the waitlist.', client: formatClient(client) });
  } catch (error) {
    return handleDatabaseError(res, error);
  }
});

router.patch('/:clientId', (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return res.status(400).json({ error: 'Client ID must be a positive whole number.' });
  }

  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body
    : {};
  const allowedFields = new Set([
    'name', 'phone', 'availability', 'preferredTime', 'preferredService',
    'preferredChannel', 'vip', 'consentStatus'
  ]);
  const fields = Object.keys(body);
  if (fields.length === 0 || fields.some(field => !allowedFields.has(field))) {
    return res.status(400).json({ error: 'Provide one or more valid client fields to update.' });
  }

  const client = db.prepare(`
    SELECT * FROM clients
    WHERE id = ? AND business_id = ? AND is_waitlisted = 1
  `).get(clientId, businessId);
  if (!client) {
    return res.status(404).json({ error: 'Waitlist client was not found.' });
  }

  const updates = [];
  const values = [];
  const addUpdate = (column, value) => {
    updates.push(`${column} = ?`);
    values.push(value);
  };

  if (Object.hasOwn(body, 'name')) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 100) {
      return res.status(400).json({ error: 'Client name is required and must be 100 characters or fewer.' });
    }
    addUpdate('name', name);
  }
  if (Object.hasOwn(body, 'phone')) {
    const phone = normalizePhone(body.phone);
    if (!phone) {
      return res.status(400).json({ error: 'Enter a valid South African mobile number, such as 0821234567.' });
    }
    if (hasDuplicatePhone(phone, clientId)) {
      return res.status(409).json({ error: 'A client with that phone number already exists.' });
    }
    addUpdate('phone', phone);
  }
  if (Object.hasOwn(body, 'availability')) {
    if (typeof body.availability !== 'string' || body.availability.trim().length > 100) {
      return res.status(400).json({ error: 'Availability must be text of 100 characters or fewer.' });
    }
    addUpdate('availability', body.availability.trim() || 'Not specified');
  }
  for (const [field, column] of [['preferredTime', 'preferred_time'], ['preferredService', 'preferred_service']]) {
    if (Object.hasOwn(body, field)) {
      if (body[field] !== null && typeof body[field] !== 'string') {
        return res.status(400).json({ error: 'Preferred time and service must be text.' });
      }
      addUpdate(column, typeof body[field] === 'string' ? body[field].trim() : null);
    }
  }
  if (Object.hasOwn(body, 'preferredChannel')) {
    if (body.preferredChannel !== null && !channels.has(body.preferredChannel)) {
      return res.status(400).json({ error: 'Preferred channel must be WhatsApp or SMS.' });
    }
    addUpdate('preferred_channel', body.preferredChannel);
  }
  if (Object.hasOwn(body, 'vip')) {
    if (typeof body.vip !== 'boolean') {
      return res.status(400).json({ error: 'VIP status must be true or false.' });
    }
    addUpdate('vip', body.vip ? 1 : 0);
  }
  if (Object.hasOwn(body, 'consentStatus')) {
    if (!consentStatuses.has(body.consentStatus)) {
      return res.status(400).json({ error: 'Consent status must be granted, withdrawn, or pending.' });
    }
    if (body.consentStatus !== client.consent_status) {
      addUpdate('consent_status', body.consentStatus);
      addUpdate('consent_changed_at', new Date().toISOString());
      if (body.consentStatus === 'granted') {
        addUpdate('consent_date', new Date().toISOString());
      }
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No client details changed.' });
  }

  values.push(clientId, businessId);
  try {
    db.prepare(`
      UPDATE clients SET ${updates.join(', ')}
      WHERE id = ? AND business_id = ?
    `).run(...values);
    const updatedClient = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
    return res.json({ message: 'Waitlist client updated.', client: formatClient(updatedClient) });
  } catch (error) {
    return handleDatabaseError(res, error);
  }
});

router.delete('/:clientId', (req, res) => {
  const clientId = Number(req.params.clientId);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return res.status(400).json({ error: 'Client ID must be a positive whole number.' });
  }

  const result = db.prepare(`
    UPDATE clients SET is_waitlisted = 0
    WHERE id = ? AND business_id = ? AND is_waitlisted = 1
  `).run(clientId, businessId);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Waitlist client was not found.' });
  }

  return res.json({ message: 'Client removed from the waitlist.' });
});

module.exports = router;
