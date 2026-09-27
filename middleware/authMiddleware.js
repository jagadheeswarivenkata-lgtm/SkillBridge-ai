const jwt = require('jsonwebtoken');
const { docClient, GetCommand, ScanCommand } = require('../config/dynamodb');

async function getUserById(userId) {
  const { Items } = await docClient.send(new ScanCommand({ TableName: 'Students' }));
  return (Items || []).find((item) => item.studentId === userId) || null;
}

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'skillbridge_super_secret_jwt_key_2026_dev_secure');
    const user = await getUserById(decoded.id || decoded.studentId || decoded.userId);

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found or session invalid.' });
    }

    req.user = {
      id: user.studentId,
      studentId: user.studentId,
      fullName: user.fullName,
      email: user.email,
      role: user.role || 'student',
      targetRole: user.targetRole || 'AI Engineer',
      branch: user.branch,
      college: user.college,
      graduationYear: user.graduationYear,
      profile: user
    };

    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
}

function requireRole(role) {
  return function (req, res, next) {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ success: false, message: 'Access denied: insufficient permissions.' });
    }
    next();
  };
}

module.exports = {
  authMiddleware,
  requireRole
};
