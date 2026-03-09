#!/usr/bin/env node
/**
 * Provision a new gym instance
 *
 * Usage:
 *   node scripts/provision-gym.js <gym_id> [gym_name]
 *
 * Examples:
 *   node scripts/provision-gym.js mygym "My Gym"
 *   node scripts/provision-gym.js climbhigh "Climb High Leeds"
 *
 * Creates:
 *   data/gyms/<gym_id>/gym.db   — SQLite database with schema
 *   data/gyms/<gym_id>/photos/  — member photo storage
 *
 * Seeds:
 *   - Default pass types
 *   - Default waiver templates
 *   - Default products
 *   - Settings (gym_name, etc.)
 *   - First-run owner account (staff must be added via UI after first login)
 *
 * Safe to re-run: skips seeding if data already exists.
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

/**
 * Core provisioning logic — can be called from CLI or programmatically
 * @param {string} gymId - Gym identifier (lowercase alphanumeric + hyphens)
 * @param {string} gymName - Human-readable gym name (optional)
 * @returns {object} - { success: true, message: string } or { success: false, error: string }
 */
function provisionGym(gymId, gymName = '') {
  // Validate gymId
  if (!gymId || typeof gymId !== 'string') {
    return { success: false, error: 'gym_id is required' };
  }
  
  if (!/^[a-z0-9-]{2,30}$/.test(gymId)) {
    return { success: false, error: 'gym_id must be 2–30 characters, lowercase letters, numbers and hyphens only' };
  }

  const dataRoot = process.env.CRUX_DATA_DIR || process.env.BOULDERRYN_DATA_DIR || path.join(__dirname, '..', 'data');
  const gymDir = path.join(dataRoot, 'gyms', gymId);
  const photosDir = path.join(gymDir, 'photos');
  const dbPath = path.join(gymDir, 'gym.db');
  const schemaPath = path.join(__dirname, '..', 'src', 'shared', 'schema.sql');

  // Check if gym already exists
  if (fs.existsSync(dbPath)) {
    return { success: false, error: `Gym "${gymId}" already exists` };
  }

  try {
    // Check for legacy single-gym DB
    const legacyDbPath = path.join(dataRoot, 'gym.db');
    const migratingLegacy = !fs.existsSync(dbPath) && fs.existsSync(legacyDbPath);

    // Create directories
    fs.mkdirSync(photosDir, { recursive: true });

    if (migratingLegacy) {
      console.log(`Migrating existing gym.db → data/gyms/${gymId}/gym.db ...`);
      fs.renameSync(legacyDbPath, dbPath);
    }

    const isNew = !migratingLegacy || !fs.existsSync(dbPath);
    console.log(`\n${isNew ? 'Provisioning new gym' : 'Updating existing gym'}: ${gymId}${gymName ? ` (${gymName})` : ''}`);
    console.log(`  DB:     ${dbPath}`);
    console.log(`  Photos: ${photosDir}`);

    // Open / create DB
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Apply schema if needed
    const tableCheck = db.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table' AND name='members'").get();
    if (tableCheck.c === 0) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      db.exec(schema);
      console.log('  Schema applied.');
    } else {
      console.log('  Schema already applied — skipping.');
    }

    // Set gym_name in settings (always overwrite the schema default "My Gym" if a name was provided)
    if (gymName) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('gym_name', ?)").run(gymName);
      console.log(`  Set gym_name = "${gymName}"`);
    }

    db.close();

    // Seed via models (require gym context)
    const gymContext = require('../src/main/database/gymContext');
    const { getDb } = require('../src/main/database/db');

    const Pass = require('../src/main/models/pass');
    const Waiver = require('../src/main/models/waiver');
    const { seedProducts } = require('../src/main/models/seed-products');
    const { ensureClimberTables } = require('../src/routes/climber');

    // Insert billing record into platform.db
    const { getPlatformDb } = require('../src/main/database/platformDb');

    try {
      const platformDb = getPlatformDb();
      const existing = platformDb.prepare('SELECT gym_id FROM gym_billing WHERE gym_id = ?').get(gymId);
      if (!existing) {
        const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
        platformDb.prepare(`
          INSERT INTO gym_billing (gym_id, plan, status, trial_ends_at)
          VALUES (?, 'growth', 'trialing', ?)
        `).run(gymId, trialEndsAt);
        console.log(`  Billing record created — trialing until ${trialEndsAt.split('T')[0]}`);
      } else {
        console.log('  Billing record already exists — skipping.');
      }
    } catch (e) {
      console.warn('  Warning: could not write billing record:', e.message);
    }

    // Seed defaults in gym context
    let seededCounts = { passes: 0, waivers: 0, products: 0 };
    
    gymContext.run({ gymId }, () => {
      getDb(); // open connection in context

      seededCounts.passes = Pass.seedDefaults();
      if (seededCounts.passes) console.log(`  Seeded ${seededCounts.passes} pass types.`);
      else console.log('  Pass types already seeded — skipping.');

      seededCounts.waivers = Waiver.seedDefaults();
      if (seededCounts.waivers) console.log(`  Seeded ${seededCounts.waivers} waiver templates.`);
      else console.log('  Waiver templates already seeded — skipping.');

      seededCounts.products = seedProducts();
      if (seededCounts.products) console.log(`  Seeded ${seededCounts.products} products.`);
      else console.log('  Products already seeded — skipping.');

      ensureClimberTables();
      console.log('  Climber tables ensured.');
    });

    console.log(`\n✓ Gym "${gymId}" is ready.`);
    
    return {
      success: true,
      message: `Gym "${gymId}" provisioned successfully`,
      gymId,
      gymName: gymName || null,
      dbPath,
      photosDir,
    };

  } catch (error) {
    console.error(`❌ Error provisioning gym "${gymId}":`, error.message);
    return { success: false, error: error.message };
  }
}

// CLI execution
if (require.main === module) {
  const gymId = process.argv[2];
  const gymName = process.argv[3] || '';

  if (!gymId) {
    console.error('Usage: node scripts/provision-gym.js <gym_id> [gym_name]');
    console.error('Example: node scripts/provision-gym.js mygym "My Gym"');
    process.exit(1);
  }

  const result = provisionGym(gymId, gymName);
  
  if (result.success) {
    if (!gymName) {
      console.log(`\n  Tip: set the gym name in Settings > General after first login.`);
    }
    console.log(`  Add staff via: Settings > Staff, or use the first-run setup on first browser visit.`);
    if (!process.env.DEFAULT_GYM_ID) {
      console.log(`\n  For local dev, set DEFAULT_GYM_ID=${gymId} in your environment.`);
    }
    process.exit(0);
  } else {
    console.error(`\n❌ ${result.error}`);
    process.exit(1);
  }
}

// Export for programmatic use
module.exports = { provisionGym };
