'use strict';

const Database = require('better-sqlite3');
const path = require('node:path');

const databasePath = process.env.DATABASE_PATH || path.join(__dirname, 'last-minute-fill.sqlite');
const db = new Database(databasePath);

db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS businesses (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    phone TEXT,
    lead_provider TEXT NOT NULL,
    country_code TEXT NOT NULL DEFAULT 'ZA',
    currency TEXT NOT NULL DEFAULT 'ZAR',
    require_popia_consent INTEGER NOT NULL DEFAULT 1 CHECK (require_popia_consent IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Other'
      CHECK (category IN ('Beauty and Hair', 'Home Services', 'Education and Tutoring', 'Health and Wellness', 'Other')),
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    price_zar INTEGER CHECK (price_zar IS NULL OR price_zar >= 0),
    quote_required INTEGER NOT NULL DEFAULT 0 CHECK (quote_required IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (business_id, name)
  );

  CREATE TABLE IF NOT EXISTS openings (
    id INTEGER PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
    service_name TEXT NOT NULL,
    provider_name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    price_zar INTEGER CHECK (price_zar IS NULL OR price_zar >= 0),
    quote_required INTEGER NOT NULL DEFAULT 0 CHECK (quote_required IN (0, 1)),
    incentive TEXT,
    status TEXT NOT NULL DEFAULT 'open'
      CHECK (status IN ('open', 'broadcasting', 'claimed', 'expired', 'cancelled')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    preferred_channel TEXT CHECK (preferred_channel IN ('whatsapp', 'sms')),
    consent_status TEXT NOT NULL DEFAULT 'pending'
      CHECK (consent_status IN ('pending', 'granted', 'withdrawn')),
    consent_date TEXT,
    consent_changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    vip INTEGER NOT NULL DEFAULT 0 CHECK (vip IN (0, 1)),
    appointments_count INTEGER NOT NULL DEFAULT 0 CHECK (appointments_count >= 0),
    availability TEXT NOT NULL DEFAULT 'Not specified',
    preferred_time TEXT,
    preferred_service TEXT,
    is_waitlisted INTEGER NOT NULL DEFAULT 1 CHECK (is_waitlisted IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (consent_status <> 'granted' OR consent_date IS NOT NULL)
  );

  CREATE TABLE IF NOT EXISTS broadcasts (
    id INTEGER PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    opening_id INTEGER NOT NULL REFERENCES openings(id) ON DELETE CASCADE,
    dispatch_mode TEXT NOT NULL CHECK (dispatch_mode IN ('tier', 'blast')),
    status TEXT NOT NULL DEFAULT 'queued'
      CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'cancelled')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TEXT
  );

  CREATE TABLE IF NOT EXISTS broadcast_recipients (
    id INTEGER PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    broadcast_id INTEGER NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'sms')),
    status TEXT NOT NULL DEFAULT 'queued'
      CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'claimed', 'expired')),
    priority INTEGER NOT NULL DEFAULT 1 CHECK (priority > 0),
    sent_at TEXT,
    responded_at TEXT,
    UNIQUE (broadcast_id, client_id)
  );

  CREATE TABLE IF NOT EXISTS claims (
    id INTEGER PRIMARY KEY,
    business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    opening_id INTEGER NOT NULL REFERENCES openings(id) ON DELETE RESTRICT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    broadcast_recipient_id INTEGER REFERENCES broadcast_recipients(id) ON DELETE SET NULL,
    price_zar INTEGER CHECK (price_zar IS NULL OR price_zar >= 0),
    status TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'cancelled')),
    claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_services_business_active
    ON services (business_id, is_active);
  CREATE INDEX IF NOT EXISTS idx_users_business
    ON users (business_id, id);
  CREATE INDEX IF NOT EXISTS idx_openings_business_status_date
    ON openings (business_id, status, start_date, start_time);
  CREATE INDEX IF NOT EXISTS idx_openings_service
    ON openings (service_id);
  CREATE INDEX IF NOT EXISTS idx_clients_business_waitlist
    ON clients (business_id, is_waitlisted, name);
  CREATE INDEX IF NOT EXISTS idx_clients_business_consent
    ON clients (business_id, consent_status);
  CREATE INDEX IF NOT EXISTS idx_clients_availability
    ON clients (business_id, availability);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_business_phone
    ON clients (business_id, phone) WHERE phone IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_broadcasts_business_created
    ON broadcasts (business_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_broadcasts_opening
    ON broadcasts (opening_id);
  CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_status
    ON broadcast_recipients (broadcast_id, status);
  CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_client
    ON broadcast_recipients (client_id, status);
  CREATE INDEX IF NOT EXISTS idx_claims_client_date
    ON claims (client_id, claimed_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_claims_one_active_per_opening
    ON claims (opening_id) WHERE status = 'claimed';
`);

let businessColumns = db.pragma('table_info(businesses)');
if (businessColumns.some(column => column.name === 'category')) {
  db.exec('ALTER TABLE businesses DROP COLUMN category');
}
if (businessColumns.some(column => column.name === 'lead_specialist')) {
  db.exec('ALTER TABLE businesses RENAME COLUMN lead_specialist TO lead_provider');
}

const serviceColumns = db.pragma('table_info(services)');
if (!serviceColumns.some(column => column.name === 'category')) {
  db.exec(`
    ALTER TABLE services ADD COLUMN category TEXT NOT NULL DEFAULT 'Other'
      CHECK (category IN ('Beauty and Hair', 'Home Services', 'Education and Tutoring', 'Health and Wellness', 'Other'))
  `);
}

const clientColumns = db.pragma('table_info(clients)');
const appointmentCountColumn = clientColumns.some(column => column.name === 'appointments_count')
  ? 'appointments_count'
  : 'rescues_count';
const clientTable = db.prepare(`
  SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'clients'
`).get();
if (!clientColumns.some(column => column.name === 'consent_changed_at')
  || !clientColumns.some(column => column.name === 'appointments_count')
    || !clientTable.sql.includes("'granted'")) {
  db.pragma('foreign_keys = OFF');
  try {
    db.exec(`
      BEGIN;
      CREATE TABLE clients_migrated (
        id INTEGER PRIMARY KEY,
        business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        phone TEXT,
        preferred_channel TEXT CHECK (preferred_channel IN ('whatsapp', 'sms')),
        consent_status TEXT NOT NULL DEFAULT 'pending'
          CHECK (consent_status IN ('pending', 'granted', 'withdrawn')),
        consent_date TEXT,
        consent_changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        vip INTEGER NOT NULL DEFAULT 0 CHECK (vip IN (0, 1)),
        appointments_count INTEGER NOT NULL DEFAULT 0 CHECK (appointments_count >= 0),
        availability TEXT NOT NULL DEFAULT 'Not specified',
        preferred_time TEXT,
        preferred_service TEXT,
        is_waitlisted INTEGER NOT NULL DEFAULT 1 CHECK (is_waitlisted IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (consent_status <> 'granted' OR consent_date IS NOT NULL)
      );

      INSERT INTO clients_migrated (
        id, business_id, name, phone, preferred_channel, consent_status,
        consent_date, consent_changed_at, vip, appointments_count, availability,
        preferred_time, preferred_service, is_waitlisted, created_at
      )
      SELECT id, business_id, name,
        CASE
          WHEN phone IS NULL THEN NULL
          WHEN substr(replace(replace(phone, ' ', ''), '-', ''), 1, 1) = '0'
            AND length(replace(replace(phone, ' ', ''), '-', '')) = 10
          THEN '+27' || substr(replace(replace(phone, ' ', ''), '-', ''), 2)
          ELSE replace(replace(phone, ' ', ''), '-', '')
        END,
        preferred_channel,
        CASE consent_status
          WHEN 'verified' THEN 'granted'
          WHEN 'revoked' THEN 'withdrawn'
          ELSE consent_status
        END,
        consent_date, COALESCE(consent_date, created_at, CURRENT_TIMESTAMP),
        vip, ${appointmentCountColumn}, availability, preferred_time, preferred_service,
        is_waitlisted, created_at
      FROM clients;

      DROP TABLE clients;
      ALTER TABLE clients_migrated RENAME TO clients;
      COMMIT;
    `);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_clients_business_waitlist
    ON clients (business_id, is_waitlisted, name);
  CREATE INDEX IF NOT EXISTS idx_clients_business_consent
    ON clients (business_id, consent_status);
  CREATE INDEX IF NOT EXISTS idx_clients_availability
    ON clients (business_id, availability);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_business_phone
    ON clients (business_id, phone) WHERE phone IS NOT NULL;
`);

const recipientColumns = db.pragma('table_info(broadcast_recipients)');
const claimColumns = db.pragma('table_info(claims)');
if (!recipientColumns.some(column => column.name === 'business_id')
    || !claimColumns.some(column => column.name === 'business_id')) {
  db.pragma('foreign_keys = OFF');
  try {
    db.exec(`
      BEGIN;
      CREATE TABLE broadcast_recipients_migrated (
        id INTEGER PRIMARY KEY,
        business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        broadcast_id INTEGER NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'sms')),
        status TEXT NOT NULL DEFAULT 'queued'
          CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'claimed', 'expired')),
        priority INTEGER NOT NULL DEFAULT 1 CHECK (priority > 0),
        sent_at TEXT,
        responded_at TEXT,
        UNIQUE (broadcast_id, client_id)
      );

      INSERT INTO broadcast_recipients_migrated (
        id, business_id, broadcast_id, client_id, channel, status, priority, sent_at, responded_at
      )
      SELECT recipients.id, broadcasts.business_id, recipients.broadcast_id,
        recipients.client_id, recipients.channel, recipients.status, recipients.priority,
        recipients.sent_at, recipients.responded_at
      FROM broadcast_recipients recipients
      JOIN broadcasts ON broadcasts.id = recipients.broadcast_id;

      CREATE TABLE claims_migrated (
        id INTEGER PRIMARY KEY,
        business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        opening_id INTEGER NOT NULL REFERENCES openings(id) ON DELETE RESTRICT,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
        broadcast_recipient_id INTEGER REFERENCES broadcast_recipients(id) ON DELETE SET NULL,
        price_zar INTEGER CHECK (price_zar IS NULL OR price_zar >= 0),
        status TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'cancelled')),
        claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO claims_migrated (
        id, business_id, opening_id, client_id, broadcast_recipient_id,
        price_zar, status, claimed_at
      )
      SELECT claims.id, openings.business_id, claims.opening_id, claims.client_id,
        claims.broadcast_recipient_id, claims.price_zar, claims.status, claims.claimed_at
      FROM claims
      JOIN openings ON openings.id = claims.opening_id;

      DROP TABLE claims;
      DROP TABLE broadcast_recipients;
      ALTER TABLE broadcast_recipients_migrated RENAME TO broadcast_recipients;
      ALTER TABLE claims_migrated RENAME TO claims;
      COMMIT;
    `);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_users_business ON users (business_id, id);
  CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_business
    ON broadcast_recipients (business_id, status);
  CREATE INDEX IF NOT EXISTS idx_claims_business_date
    ON claims (business_id, claimed_at DESC);
`);

let openingColumns = db.pragma('table_info(openings)');
if (openingColumns.some(column => column.name === 'specialist_name')) {
  db.exec('ALTER TABLE openings RENAME COLUMN specialist_name TO provider_name');
  openingColumns = db.pragma('table_info(openings)');
}
const openingsTable = db.prepare(`
  SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'openings'
`).get();
if (!openingColumns.find(column => column.name === 'service_id')?.notnull
    || !openingsTable.sql.includes("'expired'")) {
  db.prepare(`
    INSERT OR IGNORE INTO services (business_id, name, duration_minutes, price_zar)
    SELECT business_id, service_name, MAX(duration_minutes), MAX(COALESCE(price_zar, 1))
    FROM openings
    WHERE service_id IS NULL
    GROUP BY business_id, service_name
  `).run();

  db.pragma('foreign_keys = OFF');
  try {
    db.exec(`
      BEGIN;
      CREATE TABLE openings_migrated (
        id INTEGER PRIMARY KEY,
        business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
        service_name TEXT NOT NULL,
        provider_name TEXT NOT NULL,
        start_date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
        price_zar INTEGER CHECK (price_zar IS NULL OR price_zar >= 0),
        quote_required INTEGER NOT NULL DEFAULT 0 CHECK (quote_required IN (0, 1)),
        incentive TEXT,
        status TEXT NOT NULL DEFAULT 'open'
          CHECK (status IN ('open', 'broadcasting', 'claimed', 'expired', 'cancelled')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO openings_migrated (
        id, business_id, service_id, service_name, provider_name, start_date,
        start_time, duration_minutes, price_zar, quote_required, incentive,
        status, created_at
      )
      SELECT openings.id, openings.business_id,
        COALESCE(openings.service_id, (
          SELECT services.id FROM services
          WHERE services.business_id = openings.business_id
            AND services.name = openings.service_name
        )),
        openings.service_name, openings.provider_name, openings.start_date,
        openings.start_time, openings.duration_minutes, openings.price_zar,
        openings.quote_required, openings.incentive,
        CASE openings.status WHEN 'available' THEN 'open' ELSE openings.status END,
        openings.created_at
      FROM openings;

      DROP TABLE openings;
      ALTER TABLE openings_migrated RENAME TO openings;
      COMMIT;
    `);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_openings_business_status_date
    ON openings (business_id, status, start_date, start_time);
  CREATE INDEX IF NOT EXISTS idx_openings_service
    ON openings (service_id);
`);

module.exports = db;
