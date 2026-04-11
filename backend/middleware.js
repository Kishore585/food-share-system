const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'foodshare_secret_change_in_production';

const auth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });
  next();
};

/* Recipients can only read – block write operations */
const notRecipient = (req, res, next) => {
  if (req.user.role === 'recipient')
    return res.status(403).json({ error: 'Recipients have read-only access' });
  next();
};

module.exports = { auth, adminOnly, notRecipient, JWT_SECRET };
