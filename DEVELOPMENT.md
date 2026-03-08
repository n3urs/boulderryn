# Dynamic — Development Reference

> Read this at the start of every session. See PRODUCT.md for business/vision context.
> Last updated: 2026-03-08

---

## What This Is

**Dynamic** — a multi-tenant SaaS climbing gym management platform.
UK-first, bouldering-focused. Being built to sell to multiple gyms via subscription.

This codebase was originally built for BoulderRyn gym (Penryn, Cornwall). It's now being generalised into a multi-gym product. The rebrand from "BoulderRyn" → "Dynamic" is in progress (see TODO below).

---

## Running Locally

```bash
npm install
PORT=8080 node server.js
# Open http://localhost:8080
```

Kill old instance: `pkill -f "node server.js"`
Tunnel (for external testing): `/usr/local/bin/cloudflared tunnel --url http://localhost:8080`
DB: `data/boulderryn.db` (will be renamed as part of multi-tenancy)

---

## Tech Stack

- **Backend:** Express.js + Node.js
- **Database:** SQLite via better-sqlite3
- **Frontend:** Vanilla JS SPA (`src/public/app.js` ~5500 lines), `loadPage(name)` router
- **Styling:** Tailwind CSS (CDN), blue/navy scheme (`#1E3A5F` primary)
- **Auth:** Staff PIN (salted PBKDF2 sha512), JWT for member sessions
- **Email:** Nodemailer (SMTP via settings)
- **Payments:** Dojo (in-person), GoCardless (DD) — skeletons only

---

## Project Structure

```
server.js                    — Express entry point
src/
  routes/                    — API route handlers (one file per domain)
  main/
    database/
      db.js                  — DB connection
      init.js                — Schema init + migrations
    models/                  — Data access layer
    services/
      email.js               — Email service (QR, receipts, waiver, welcome)
  integrations/
    dojo.js                  — Dojo card reader integration
  public/
    index.html               — Staff app shell
    app.js                   — All frontend JS (SPA)
    app.html                 — Member portal
    register.html            — Public registration/waiver page
    pages/
      pos.js                 — POS frontend
      waiver.js              — Waiver frontend
reference/                   — Gym layout, waiver text, pricing reference docs
data/
  boulderryn.db              — SQLite database (single gym, dev)
  photos/                    — Member photo uploads
```

---

## Features Built

### Staff App Pages
| Page | Status | Notes |
|---|---|---|
| Dashboard (Visitors) | ✅ Complete | Stats cards, needs validation list, active visitors, check-in |
| Members | ✅ Complete | List, search, filters, profile modal |
| Profile Modal | ✅ Complete | 4 tabs: Overview, Passes, Transactions, Events |
| Edit Member | ✅ Complete | Edit, Merge Profile, Family Members tabs |
| Point of Sale | ✅ Complete | Cart, member chip, pass assignment, Dojo/GoCardless skeleton |
| Check-in | ✅ Complete | QR scan, name search, pass validation, day pass expiry |
| Events | ✅ Complete | List + calendar view, create/cancel/enrolments |
| Routes | ✅ Complete | Cards view, SVG map, wall filters, add climb, grade chart |
| Analytics | ✅ Complete | KPI cards, bar charts, EOD report, popular products, grade dist |
| Settings > Staff | ✅ Complete | Add/edit/delete/reset PIN/deactivate staff |
| Settings > Products | ✅ Complete | Categories + products, add/edit/archive |
| Settings > Pass Types | ✅ Complete | Grouped by category, add/edit/disable |
| Settings > General | ✅ Complete | Gym details, opening hours, pricing, induction video URL |
| Settings > Integrations | ✅ Complete | GoCardless, Dojo, Email/SMTP config |

### Backend API
All routes under `/api/*`. See `src/routes/` for full list.
Key endpoints: members, passes, checkin, pos/transactions, products, staff, analytics, events, routes, settings, email, waivers, giftcards.

### Member Portal (`app.html`)
- Login with auth code (emailed)
- Profile, pass status, booking

### Registration (`register.html`)
- Induction video + waiver form (adult + minor)
- Signature canvas
- QR code emailed on completion

---

## Database

Single SQLite DB with 29 tables. Key ones:

| Table | Purpose |
|---|---|
| members | All member data |
| staff | Staff accounts (PIN hashed PBKDF2) |
| pass_types | Pass type definitions |
| member_passes | Issued passes (visits_remaining, status) |
| check_ins | Check-in log |
| transactions / transaction_items | POS sales |
| products / product_categories | POS products (92 products, 9 categories seeded) |
| settings | Key/value gym config |
| events / event_enrolments | Events system |
| walls / climbs / climb_logs | Routes system |
| gift_cards / gift_card_transactions | Vouchers |

Test data: 7 members, 2 with active passes, 3 seeded climbs, 2 seeded events.

---

## ⚠️ REBRAND TODO (for Claude Code)

The codebase still contains many references to "BoulderRyn" that need updating as part of the Dynamic platform rebrand. These should be replaced with config-driven values from `settings` table (gym name, gym brand) rather than hardcoded.

Files containing "BoulderRyn" / "boulderryn" references:
- `src/main/database/init.js` — DB init references
- `src/main/database/db.js` — DB filename, JWT secret string
- `src/main/models/member.js` — email templates ("BoulderRyn" in email body)
- `src/main/models/transaction.js` — email templates
- `src/main/models/pass.js` — references
- `src/main/models/waiver.js` — references
- `src/main/models/staff.js` — JWT secret fallback string
- `src/main/models/seed-products.js` — product seed data
- `src/main/services/email.js` — email from address, subject lines, HTML templates
- `src/routes/members.js` — references
- `src/routes/climber.js` — JWT secret, email templates
- `src/routes/dojo.js` — references
- `src/public/pages/pos.js` — UI text
- `src/public/pages/waiver.js` — waiver text, gym name in copy
- `src/public/app.js` — gym name, logo alt text, "BoulderRyn" in UI
- `src/integrations/dojo.js` — references
- `server.js` — env file reference (`/etc/boulderryn.env`)

**Approach:** Gym name, logo, contact email, colours etc. should all come from the `settings` table (already has entries for `gym_name`, `gym_email`, etc.). Replace hardcoded strings with `getSetting('gym_name')` calls. The sidebar heading "BoulderRyn" in `index.html` and `app.js` should read from settings.

---

## 🏗️ Multi-Tenancy TODO (next major milestone)

Current state: single-tenant (one gym, one DB). To sell to multiple gyms:

1. **Per-gym DB isolation** — move to `data/gyms/{gym_id}/gym.db` structure
2. **Gym provisioning script** — `scripts/provision-gym.js` — creates DB, seeds defaults, creates owner account
3. **Subdomain routing** — `gymname.dynamicgym.co.uk` → loads correct gym DB
4. **Super-admin panel** — Oscar can view all gyms, status, usage, billing
5. **Stripe billing** — subscription management, webhook for active/inactive
6. **Gym signup flow** — new gym registers, pays, gets provisioned automatically

---

## Security (pre-launch checklist)

- [ ] Set `JWT_SECRET` in environment (currently falls back to insecure hardcoded string)
- [ ] Add `helmet` middleware to server.js
- [ ] Rate limit PIN/auth endpoints
- [ ] `chmod 600 data/*.db`
- [ ] Run behind HTTPS (nginx + Let's Encrypt)

---

## Repo

GitHub: https://github.com/n3urs/dynamic (renamed from boulderryn)
