'use strict';

const express = require('express');
const db = require('../db/database');

const router = express.Router();
const businessId = 1;
const serviceCategories = [
  'Beauty and Hair',
  'Home Services',
  'Education and Tutoring',
  'Health and Wellness',
  'Other'
];

function isNumberInput(value) {
  return typeof value === 'number'
    || (typeof value === 'string' && value.trim() !== '');
}

function formatService(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    duration: row.duration_minutes,
    price: row.price_zar
  };
}

function sendDatabaseError(res, error) {
  if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: 'A service with that name already exists.' });
  }
  return res.status(500).json({ error: 'The service could not be saved.' });
}

router.get('/', (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : '';
  if (category && !serviceCategories.includes(category)) {
    return res.status(400).json({ error: 'Choose a valid service category.' });
  }
  const business = db.prepare('SELECT id FROM businesses WHERE id = ?').get(businessId);
  if (!business) {
    return res.status(404).json({ error: 'Business was not found.' });
  }

  const services = db.prepare(`
    SELECT id, name, category, duration_minutes, price_zar
    FROM services
    WHERE business_id = ? AND is_active = 1
      AND (? = '' OR category = ?)
    ORDER BY id
  `).all(businessId, category, category).map(formatService);

  return res.json({ services });
});

router.post('/', (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body
    : {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const category = typeof body.category === 'string' ? body.category : '';
  const duration = Number(body.duration);
  const price = Number(body.price);

  if (!name) {
    return res.status(400).json({ error: 'Service name is required.' });
  }
  if (!serviceCategories.includes(category)) {
    return res.status(400).json({ error: 'Choose a valid service category.' });
  }
  if (!isNumberInput(body.duration) || !Number.isInteger(duration) || duration <= 0) {
    return res.status(400).json({ error: 'Duration must be a positive whole number of minutes.' });
  }
  if (!isNumberInput(body.price) || !Number.isFinite(price) || price <= 0) {
    return res.status(400).json({ error: 'Price must be a positive number.' });
  }

  const business = db.prepare('SELECT id FROM businesses WHERE id = ?').get(businessId);
  if (!business) {
    return res.status(404).json({ error: 'Business was not found.' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO services (business_id, name, category, duration_minutes, price_zar)
      VALUES (?, ?, ?, ?, ?)
    `).run(businessId, name, category, duration, price);

    const service = db.prepare('SELECT id, name, category, duration_minutes, price_zar FROM services WHERE id = ?')
      .get(result.lastInsertRowid);
    return res.status(201).json({ message: 'Service added.', service: formatService(service) });
  } catch (error) {
    return sendDatabaseError(res, error);
  }
});

router.patch('/:serviceId', (req, res) => {
  const serviceId = Number(req.params.serviceId);
  if (!Number.isInteger(serviceId) || serviceId <= 0) {
    return res.status(400).json({ error: 'Service ID must be a positive whole number.' });
  }

  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body
    : {};
  const allowedFields = new Set(['name', 'category', 'duration', 'price']);
  const providedFields = Object.keys(body);
  if (providedFields.length === 0 || providedFields.some(field => !allowedFields.has(field))) {
    return res.status(400).json({ error: 'Provide one or more valid service fields to update.' });
  }

  const existingService = db.prepare(`
    SELECT id, name, category, duration_minutes, price_zar
    FROM services
    WHERE id = ? AND business_id = ? AND is_active = 1
  `).get(serviceId, businessId);
  if (!existingService) {
    return res.status(404).json({ error: 'Service was not found.' });
  }

  const name = Object.hasOwn(body, 'name')
    ? (typeof body.name === 'string' ? body.name.trim() : '')
    : existingService.name;
  const category = Object.hasOwn(body, 'category') ? body.category : existingService.category;
  const duration = Object.hasOwn(body, 'duration') ? Number(body.duration) : existingService.duration_minutes;
  const price = Object.hasOwn(body, 'price') ? Number(body.price) : existingService.price_zar;

  if (!name) {
    return res.status(400).json({ error: 'Service name is required.' });
  }
  if (Object.hasOwn(body, 'category') && !serviceCategories.includes(category)) {
    return res.status(400).json({ error: 'Choose a valid service category.' });
  }
  if (Object.hasOwn(body, 'duration')
      && (!isNumberInput(body.duration) || !Number.isInteger(duration) || duration <= 0)) {
    return res.status(400).json({ error: 'Duration must be a positive whole number of minutes.' });
  }
  if (Object.hasOwn(body, 'price')
      && (!isNumberInput(body.price) || !Number.isFinite(price) || price <= 0)) {
    return res.status(400).json({ error: 'Price must be a positive number.' });
  }

  try {
    db.prepare(`
      UPDATE services
      SET name = ?, category = ?, duration_minutes = ?, price_zar = ?
      WHERE id = ? AND business_id = ?
    `).run(name, category, duration, price, serviceId, businessId);

    const updatedService = db.prepare(`
      SELECT id, name, category, duration_minutes, price_zar
      FROM services WHERE id = ?
    `).get(serviceId);
    return res.json({ message: 'Service updated.', service: formatService(updatedService) });
  } catch (error) {
    return sendDatabaseError(res, error);
  }
});

router.delete('/:serviceId', (req, res) => {
  const serviceId = Number(req.params.serviceId);
  if (!Number.isInteger(serviceId) || serviceId <= 0) {
    return res.status(400).json({ error: 'Service ID must be a positive whole number.' });
  }

  const service = db.prepare(`
    SELECT id FROM services
    WHERE id = ? AND business_id = ? AND is_active = 1
  `).get(serviceId, businessId);
  if (!service) {
    return res.status(404).json({ error: 'Service was not found.' });
  }

  const serviceCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM services WHERE business_id = ? AND is_active = 1
  `).get(businessId).count;
  if (serviceCount <= 1) {
    return res.status(400).json({ error: 'The catalog must have at least one service.' });
  }

  db.prepare(`
    UPDATE services SET is_active = 0
    WHERE id = ? AND business_id = ?
  `).run(serviceId, businessId);
  return res.json({ message: 'Service deleted.' });
});

module.exports = router;
