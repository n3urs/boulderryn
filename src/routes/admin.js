/**
 * Super-admin routes — platform management
 *
 * Protected by requireAdmin middleware.
 * Mount in server.js before gym context middleware.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { getPlatformDb } = require('../main/database/platformDb');
const { provisionGym } = require('../../scripts/provision-gym');
const { sendWelcomeEmail } = require('../services/welcomeEmail');

const router = express.Router();

function getDataRoot() {
  return process.env.CRUX_DATA_DIR || process.env.BOULDERRYN_DATA_DIR || path.join(__dirname, '..', '..', 'data');
}

// ── GET /admin/gyms ────────────────────────────────────────────────────────

router.get('/gyms', (req, res) => {
  try {
    const dataRoot = getDataRoot();
    const gymsDir = path.join(dataRoot, 'gyms');
    
    if (!fs.existsSync(gymsDir)) {
      return res.json({ gyms: [] });
    }

    const gymIds = fs.readdirSync(gymsDir).filter(f => {
      return fs.statSync(path.join(gymsDir, f)).isDirectory();
    });

    const platformDb = getPlatformDb();
    const gyms = [];

    for (const gymId of gymIds) {
      try {
        // Get gym-specific DB
        const Database = require('better-sqlite3');
        const gymDbPath = path.join(gymsDir, gymId, 'gym.db');
        if (!fs.existsSync(gymDbPath)) continue;

        const gymDb = new Database(gymDbPath, { readonly: true });
        
        // Get gym name
        const gymNameRow = gymDb.prepare("SELECT value FROM settings WHERE key = 'gym_name'").get();
        const gymName = gymNameRow ? gymNameRow.value : gymId;

        // Get member count
        const memberCountRow = gymDb.prepare('SELECT COUNT(*) as count FROM members').get();
        const memberCount = memberCountRow ? memberCountRow.count : 0;

        // Get last activity (latest check-in or transaction)
        const lastCheckIn = gymDb.prepare('SELECT MAX(checked_in_at) as t FROM check_ins').get();
        const lastTransaction = gymDb.prepare('SELECT MAX(created_at) as t FROM transactions').get();
        const lastActivity = [lastCheckIn?.t, lastTransaction?.t].filter(Boolean).sort().pop() || null;

        gymDb.close();

        // Get billing record
        const billingRecord = platformDb.prepare('SELECT * FROM gym_billing WHERE gym_id = ?').get(gymId);
        
        gyms.push({
          gymId,
          gymName,
          plan: billingRecord?.plan || 'growth',
          status: billingRecord?.status || 'trialing',
          trialEndsAt: billingRecord?.trial_ends_at || null,
          isActive: billingRecord ? (billingRecord.status === 'active' || (billingRecord.status === 'trialing' && (!billingRecord.trial_ends_at || new Date(billingRecord.trial_ends_at) > new Date()))) : true,
          memberCount,
          lastActivity,
        });
      } catch (err) {
        console.error(`[admin] Error reading gym ${gymId}:`, err.message);
      }
    }

    res.json({ gyms });
  } catch (err) {
    console.error('[admin] /gyms error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /admin/provision ──────────────────────────────────────────────────

router.post('/provision', async (req, res) => {
  const { gymId, gymName, ownerEmail } = req.body;

  if (!gymId || !gymName || !ownerEmail) {
    return res.status(400).json({ error: 'gymId, gymName, and ownerEmail are required' });
  }

  // Validate gymId format
  if (!/^[a-z0-9-]+$/.test(gymId)) {
    return res.status(400).json({ error: 'gymId must be lowercase alphanumeric with hyphens only' });
  }

  try {
    // Check if gym already exists
    const dataRoot = getDataRoot();
    const gymPath = path.join(dataRoot, 'gyms', gymId);
    if (fs.existsSync(gymPath)) {
      return res.status(409).json({ error: 'Gym ID already exists' });
    }

    // Provision the gym
    await provisionGym(gymId, gymName);

    // Send welcome email
    try {
      await sendWelcomeEmail(gymId, gymName, ownerEmail);
    } catch (emailErr) {
      console.error('[admin] Welcome email failed:', emailErr.message);
      // Don't fail the request if email fails
    }

    res.json({
      ok: true,
      gymId,
      subdomain: `${gymId}.cruxgym.co.uk`,
    });
  } catch (err) {
    console.error('[admin] /provision error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /admin/gyms/:gymId/suspend ────────────────────────────────────────

router.post('/gyms/:gymId/suspend', (req, res) => {
  const { gymId } = req.params;
  const { reason } = req.body;

  try {
    const platformDb = getPlatformDb();
    const existing = platformDb.prepare('SELECT gym_id FROM gym_billing WHERE gym_id = ?').get(gymId);

    if (!existing) {
      return res.status(404).json({ error: 'Gym not found' });
    }

    platformDb.prepare("UPDATE gym_billing SET status = 'suspended', updated_at = datetime('now') WHERE gym_id = ?")
      .run(gymId);

    res.json({ ok: true, gymId, status: 'suspended' });
  } catch (err) {
    console.error('[admin] /suspend error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /admin/gyms/:gymId/activate ───────────────────────────────────────

router.post('/gyms/:gymId/activate', (req, res) => {
  const { gymId } = req.params;

  try {
    const platformDb = getPlatformDb();
    const existing = platformDb.prepare('SELECT gym_id FROM gym_billing WHERE gym_id = ?').get(gymId);

    if (!existing) {
      return res.status(404).json({ error: 'Gym not found' });
    }

    platformDb.prepare("UPDATE gym_billing SET status = 'active', updated_at = datetime('now') WHERE gym_id = ?")
      .run(gymId);

    res.json({ ok: true, gymId, status: 'active' });
  } catch (err) {
    console.error('[admin] /activate error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
