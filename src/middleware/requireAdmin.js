/**
 * requireAdmin middleware
 *
 * Checks for ADMIN_TOKEN to protect super-admin routes.
 * Accepts token via Authorization header or query param.
 */

function requireAdmin(req, res, next) {
  const expectedToken = process.env.ADMIN_TOKEN;
  
  if (!expectedToken || expectedToken === 'admin_secret_placeholder') {
    console.warn('⚠️  ADMIN_TOKEN not set or using placeholder — admin panel is not secure!');
  }

  // Extract token from header or query param
  let token = null;
  
  // Check Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }
  
  // Fallback to query param ?adminToken=<token>
  if (!token && req.query.adminToken) {
    token = req.query.adminToken;
  }

  // Validate token
  if (!token || token !== expectedToken) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  // Set admin flag and continue
  req.isAdmin = true;
  next();
}

module.exports = requireAdmin;
