const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');

const JWT_SECRET = process.env.JWT_SECRET;

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (err) {
    // start.sh provisions the hardened runtime session store. Accept that same
    // opaque session here so users do not authenticate successfully and then
    // get rejected by feature routes that historically expected only JWTs.
    try {
      const pool = req.app.get('db');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const runtime = await pool.query(
        `SELECT u.id,u.email,u.display_name,u.role
         FROM runtime_app_sessions s JOIN runtime_app_users u ON u.id=s.user_id
         WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true LIMIT 1`,
        [tokenHash]
      );
      if (!runtime.rows.length) return res.status(403).json({ error: 'Invalid or expired token' });
      const runtimeUser = runtime.rows[0];
      const legacy = await pool.query('SELECT id,tenant_id,name,role FROM users WHERE lower(email)=lower($1) LIMIT 1', [runtimeUser.email]);
      req.user = legacy.rows.length ? {
        id: legacy.rows[0].id,
        email: runtimeUser.email,
        name: legacy.rows[0].name || runtimeUser.display_name,
        role: legacy.rows[0].role || runtimeUser.role,
        tenantId: legacy.rows[0].tenant_id || `runtime-${runtimeUser.id}`,
        runtimeUserId: runtimeUser.id,
      } : {
        id: null,
        email: runtimeUser.email,
        name: runtimeUser.display_name,
        role: runtimeUser.role,
        tenantId: `runtime-${runtimeUser.id}`,
        runtimeUserId: runtimeUser.id,
      };
      return next();
    } catch (sessionError) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Access denied. Required role: ${roles.join(' or ')}` });
    }
    next();
  };
}

module.exports = { authenticateToken, requireRole };
