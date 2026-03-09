/**
 * GDPR data export route — per-gym
 *
 * GET /api/export/gdpr — returns a full JSON export of all gym data
 * GET /api/export/members.csv — CSV of all members (existing)
 *
 * Requires staff auth (JWT).
 */

const express = require('express');
const router = express.Router();
const { getDb } = require('../main/database/db');
const path = require('path');
const fs = require('fs');

// ── GET /api/export/gdpr ───────────────────────────────────────────────────

router.get('/gdpr', (req, res) => {
  try {
    const db = getDb();

    const settings    = db.prepare('SELECT key, value FROM settings').all();
    const members     = db.prepare('SELECT * FROM members').all();
    const waivers     = db.prepare('SELECT * FROM waiver_templates').all();
    const signedWaivers = db.prepare('SELECT * FROM signed_waivers').all();
    const transactions = db.prepare('SELECT * FROM transactions').all();
    const passes      = db.prepare('SELECT * FROM member_passes').all();
    const checkins    = db.prepare('SELECT * FROM check_ins').all();
    const staff       = db.prepare('SELECT id, first_name, last_name, role, email, created_at FROM staff').all(); // no passwords
    const events      = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'").get()
      ? db.prepare('SELECT * FROM events').all()
      : [];
    const products    = db.prepare('SELECT * FROM products').all();

    const exportData = {
      exportedAt: new Date().toISOString(),
      schema_version: 1,
      settings: Object.fromEntries(settings.map(r => [r.key, r.value])),
      members,
      waiver_templates: waivers,
      signed_waivers: signedWaivers,
      transactions,
      member_passes: passes,
      check_ins: checkins,
      staff,
      events,
      products,
    };

    const gymNameSetting = db.prepare("SELECT value FROM settings WHERE key = 'gym_name'").get();
    const gymName = gymNameSetting?.value || 'gym';
    const filename = `crux-export-${gymName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(exportData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/export/members.csv ────────────────────────────────────────────

router.get('/members.csv', (req, res) => {
  try {
    const db = getDb();
    const members = db.prepare('SELECT * FROM members').all();

    if (!members.length) {
      return res.status(200).send('No members found');
    }

    const headers = Object.keys(members[0]);
    const rows = members.map(m =>
      headers.map(h => {
        const v = m[h] == null ? '' : String(m[h]);
        return v.includes(',') || v.includes('"') || v.includes('\n')
          ? `"${v.replace(/"/g, '""')}"`
          : v;
      }).join(',')
    );

    const csv = [headers.join(','), ...rows].join('\n');
    const gymName = db.prepare("SELECT value FROM settings WHERE key='gym_name'").get()?.value || 'gym';
    const filename = `members-${gymName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
