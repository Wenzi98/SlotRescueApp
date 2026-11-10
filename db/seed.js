'use strict';

const db = require('./database');

// The consent dates belong to synthetic demo records, not real clients.
const demoConsentDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

function dateOffset(days) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const today = dateOffset(0);
const yesterday = dateOffset(-1);
const tomorrow = dateOffset(1);

const seedSampleData = db.transaction(() => {
  db.prepare(`
    INSERT OR IGNORE INTO businesses
      (id, name, location, phone, lead_provider, country_code, currency)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    1,
    'Demo Business',
    'Johannesburg, Gauteng',
    '+27 82 123 4567',
    'Thandi Mokoena',
    'ZA',
    'ZAR'
  );

  const addService = db.prepare(`
    INSERT OR IGNORE INTO services
      (id, business_id, name, category, duration_minutes, price_zar)
    VALUES (?, 1, ?, ?, ?, ?)
  `);

  addService.run(1, 'Haircut & Blow-dry', 'Beauty and Hair', 60, 450);
  addService.run(2, 'Braiding Session', 'Beauty and Hair', 180, 1600);
  addService.run(3, 'Plumbing Call-out', 'Home Services', 90, 850);
  addService.run(4, 'Grade 10 Maths Tutoring', 'Education and Tutoring', 60, 350);
  addService.run(5, 'Swedish Massage', 'Health and Wellness', 60, 750);
  addService.run(6, 'Appliance Repair Call-out', 'Other', 60, 500);

  const addClient = db.prepare(`
    INSERT OR IGNORE INTO clients
      (id, business_id, name, phone, preferred_channel, consent_status, consent_date,
       vip, appointments_count, availability, preferred_time, preferred_service,
       is_waitlisted)
    VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  addClient.run(
    1, 'Thandi Mokoena', '+27 83 294 8831', 'whatsapp', 'granted',
    demoConsentDate, 1, 4, 'Flexible time', 'Afternoon', 'Braiding Session', 1
  );
  addClient.run(
    2, 'Sipho Dlamini', '+27 71 832 9481', 'sms', 'granted',
    demoConsentDate, 0, 2, 'Can arrive in 20 min', 'Within 2 hours', 'Plumbing Call-out', 1
  );
  addClient.run(
    3, 'Ayesha Khan', '+27 82 459 1029', 'whatsapp', 'granted',
    demoConsentDate, 0, 1, 'Available after school', 'Afternoon', 'Grade 10 Maths Tutoring', 1
  );
  addClient.run(
    4, 'Nomsa Zulu', '+27 60 551 2940', 'whatsapp', 'granted',
    demoConsentDate, 0, 3, 'Weekdays', 'Morning', 'Swedish Massage', 1
  );
  addClient.run(
    5, 'Lerato Nkosi', '+27 82 111 2233', 'sms', 'pending',
    null, 0, 0, 'Flexible', 'Any time', 'Appliance Repair Call-out', 1
  );

  const addOpening = db.prepare(`
    INSERT OR IGNORE INTO openings
      (id, business_id, service_id, service_name, provider_name, start_date,
       start_time, duration_minutes, price_zar, status)
    VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  addOpening.run(1, 2, 'Braiding Session', 'Thandi Mokoena', tomorrow, '14:00', 180, 1600, 'open');
  addOpening.run(2, 3, 'Plumbing Call-out', 'Sipho Dlamini', tomorrow, '11:00', 90, 850, 'open');
  addOpening.run(3, 4, 'Grade 10 Maths Tutoring', 'Ayesha Khan', tomorrow, '16:00', 60, 350, 'open');
  addOpening.run(4, 5, 'Swedish Massage', 'Nomsa Zulu', tomorrow, '10:30', 60, 750, 'open');
  addOpening.run(5, 1, 'Haircut & Blow-dry', 'Thandi Mokoena', tomorrow, '09:00', 60, 450, 'open');
  addOpening.run(6, 1, 'Haircut & Blow-dry', 'Thandi Mokoena', today, '14:00', 60, 450, 'claimed');
  addOpening.run(7, 5, 'Swedish Massage', 'Nomsa Zulu', yesterday, '10:00', 60, 750, 'claimed');

  db.prepare(`
    INSERT OR IGNORE INTO claims
      (id, opening_id, client_id, price_zar, status, claimed_at)
    VALUES (?, ?, ?, ?, 'claimed', datetime('now', ?))
  `).run(1, 6, 1, 450, '-14 minutes');

  db.prepare(`
    INSERT OR IGNORE INTO claims
      (id, opening_id, client_id, price_zar, status, claimed_at)
    VALUES (?, ?, ?, ?, 'claimed', datetime('now', ?))
  `).run(2, 7, 4, 750, '-1 day');
});

try {
  seedSampleData();
  console.log('Sample data is ready. Existing records were left unchanged.');
} finally {
  db.close();
}
