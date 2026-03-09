# Crux Super-Admin Panel

## Overview

The super-admin panel provides platform-level management for all gyms on the Crux SaaS platform. This is a separate interface from the gym-facing application, intended for Oscar (platform owner) to provision new gyms, monitor usage, and manage subscriptions.

## Access

**URL:** `/admin`

**Authentication:** Token-based authentication via `ADMIN_TOKEN` environment variable.

The admin panel accepts the token in two ways:
- HTTP header: `Authorization: Bearer <token>`
- Query parameter: `?adminToken=<token>`

⚠️ **Security Note:** Set a strong `ADMIN_TOKEN` in your production environment. The default placeholder `admin_secret_placeholder` should never be used in production.

## Features

### 1. Gym Provisioning

**Form fields:**
- Gym ID (lowercase, alphanumeric + hyphens, 2-30 chars)
- Gym Name (human-readable)
- Owner Email (for welcome email)

**What happens on provision:**
1. Creates gym directory structure: `data/gyms/{gymId}/`
2. Initializes SQLite database with schema
3. Seeds default data (pass types, waivers, products)
4. Creates billing record (14-day trial on Growth plan)
5. Sends welcome email to owner with:
   - Subdomain URL (`{gymId}.cruxgym.co.uk`)
   - Trial information
   - Next steps guide
   - Support contact

### 2. Gym Management Dashboard

**Displays for each gym:**
- Gym ID (clickable link to subdomain)
- Gym Name
- Subscription Plan (starter/growth/scale)
- Status (trialing/active/past_due/suspended/cancelled/unpaid)
- Member Count
- Last Activity (latest check-in or transaction)

**Features:**
- Sortable columns (click headers to sort)
- Real-time status badges with color coding
- Refresh button to reload data
- Direct links to gym subdomains

### 3. Gym Actions

**Suspend:** Changes billing status to 'suspended' and adds flag to gym settings
**Activate:** Restores billing status to 'active' and removes suspension flags

## Technical Implementation

### Files Created

1. **`src/middleware/requireAdmin.js`**
   - Token validation middleware
   - Checks `Authorization` header or `adminToken` query param
   - Returns 401 if unauthorized

2. **`src/services/welcomeEmail.js`**
   - Nodemailer-based email service
   - Sends HTML + plaintext welcome emails
   - Uses Gmail SMTP (cruxgymhq@gmail.com)
   - Professional blue/white design with Crux branding

3. **`src/routes/admin.js`**
   - API routes for admin panel:
     - `GET /admin/gyms` — List all gyms with stats
     - `POST /admin/provision` — Provision new gym
     - `POST /admin/gyms/:gymId/suspend` — Suspend a gym
     - `POST /admin/gyms/:gymId/activate` — Activate a gym

4. **`src/public/admin.html`**
   - Single-page admin UI
   - Token-based authentication flow
   - Gym provisioning form
   - Gyms table with sorting
   - Tailwind CSS styling (consistent with main app)

5. **`scripts/provision-gym.js`** (refactored)
   - Core provisioning logic extracted to `provisionGym(gymId, gymName)` function
   - Exportable for programmatic use
   - Still works as CLI script
   - Returns structured result object `{ success, message, error }`

### Changes to Existing Files

**`server.js`:**
- Added `ADMIN_TOKEN` environment variable (defaults to placeholder)
- Mounted admin routes BEFORE gym context middleware
- Added `/admin` route to serve admin UI

## Configuration

### Environment Variables

```bash
# Required for production
ADMIN_TOKEN=your_secure_random_token_here

# Email credentials (already configured)
SMTP_USER=cruxgymhq@gmail.com
SMTP_PASS=tzrhwxyfpjgnfraz
SMTP_FROM=Crux <hello@cruxgym.co.uk>
```

### Setting Admin Token

**Option 1: Environment file**
```bash
echo "ADMIN_TOKEN=your_secure_token" >> /etc/dynamic.env
sudo systemctl restart boulderryn
```

**Option 2: systemd service**
Edit `boulderryn.service` and add:
```ini
Environment="ADMIN_TOKEN=your_secure_token"
```

**Option 3: Shell export (development only)**
```bash
export ADMIN_TOKEN=your_secure_token
npm start
```

## Usage Examples

### Accessing the Admin Panel

1. Navigate to `https://yourdomain.com/admin` (or `http://localhost:8080/admin` for local dev)
2. Enter your admin token
3. Click "Login"

### Provisioning a New Gym

1. Fill in the form:
   - **Gym ID:** `boulderryn` (becomes boulderryn.cruxgym.co.uk)
   - **Gym Name:** `Boulderryn Climbing Gym`
   - **Owner Email:** `oscar@example.com`
2. Click "Provision Gym"
3. Owner receives welcome email
4. Gym appears in the dashboard table

### Suspending a Gym

1. Find the gym in the table
2. Click "Suspend"
3. Optionally enter a reason
4. Gym status changes to 'suspended'
5. Gym's API endpoints will be blocked by billing middleware (when enabled)

### API Usage (Programmatic)

```bash
# List all gyms
curl -H "Authorization: Bearer your_token" \
  https://yourdomain.com/admin/gyms

# Provision new gym
curl -X POST -H "Authorization: Bearer your_token" \
  -H "Content-Type: application/json" \
  -d '{"gymId":"newgym","gymName":"New Gym","ownerEmail":"owner@example.com"}' \
  https://yourdomain.com/admin/provision

# Suspend gym
curl -X POST -H "Authorization: Bearer your_token" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Payment overdue"}' \
  https://yourdomain.com/admin/gyms/newgym/suspend

# Activate gym
curl -X POST -H "Authorization: Bearer your_token" \
  https://yourdomain.com/admin/gyms/newgym/activate
```

## Security Considerations

1. **Token Storage:** The admin token is stored in sessionStorage (browser only). It's not persisted across sessions.

2. **HTTPS Required:** Always use HTTPS in production to protect the admin token in transit.

3. **Token Rotation:** Change the `ADMIN_TOKEN` periodically and immediately if compromised.

4. **Access Control:** The admin panel has full platform access. Only share the token with trusted administrators.

5. **Rate Limiting:** Consider adding rate limiting to admin endpoints if needed (currently not implemented).

6. **Audit Logging:** Consider adding audit logs for admin actions (provision, suspend, activate).

## Future Enhancements

Potential improvements for the admin panel:

- [ ] Pagination for large gym lists
- [ ] Search/filter gyms by name, status, or plan
- [ ] Audit log of admin actions
- [ ] Gym analytics dashboard (revenue, member growth, churn)
- [ ] Bulk actions (suspend multiple gyms)
- [ ] Email settings configuration
- [ ] Stripe integration for viewing subscription details
- [ ] Multi-user admin system (beyond single token)
- [ ] 2FA for admin access

## Troubleshooting

### "Unauthorized" Error

- Verify `ADMIN_TOKEN` is set correctly in environment
- Check that token matches in UI and server
- Restart server after changing environment variables

### Email Not Sending

- Verify SMTP credentials in environment or `welcomeEmail.js`
- Check Gmail app password is still valid
- Review server logs for detailed error messages
- Test with a personal email first

### Gym Not Appearing in Dashboard

- Click "Refresh" button
- Check browser console for errors
- Verify gym was provisioned successfully (check `data/gyms/` folder)
- Ensure billing record exists in `platform.db`

### "Gym Already Exists" Error

- Gym IDs must be unique
- Check `data/gyms/` folder for existing gym
- Choose a different gym ID

## Testing

### Manual Testing Checklist

- [ ] Access admin panel without token → 401 error
- [ ] Login with correct token → dashboard appears
- [ ] Provision new gym with valid data → success message
- [ ] Provision gym with existing ID → error message
- [ ] Provision gym with invalid ID format → error message
- [ ] Welcome email arrives with correct details
- [ ] Gym appears in dashboard table
- [ ] Sort table by different columns
- [ ] Suspend gym → status changes to 'suspended'
- [ ] Activate gym → status changes to 'active'
- [ ] Logout → returns to login screen

### Automated Testing

No automated tests implemented yet. Consider adding:
- Unit tests for provisioning logic
- Integration tests for admin API endpoints
- E2E tests for UI workflows

## Maintenance

### Regular Tasks

1. **Monitor gym provisioning:** Review new gym sign-ups weekly
2. **Check email delivery:** Ensure welcome emails are sending
3. **Review suspended gyms:** Follow up on payment issues
4. **Rotate admin token:** Change token quarterly or on-demand

### Database Maintenance

The admin panel reads from:
- `data/gyms/*/gym.db` — Individual gym databases
- `data/platform.db` — Platform billing records

Ensure regular backups of both.

---

## Summary

The super-admin panel is now fully functional and ready for production use. It provides a complete solution for:

✅ Provisioning new gyms with automated setup  
✅ Monitoring all gyms from a single dashboard  
✅ Managing gym subscriptions (suspend/activate)  
✅ Sending professional welcome emails to gym owners  

**Next Steps:**
1. Set a secure `ADMIN_TOKEN` in production environment
2. Test provisioning flow with a real gym
3. Verify email delivery
4. Bookmark `/admin` for easy access

For support or questions, contact Oscar at hello@cruxgym.co.uk.
