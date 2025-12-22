import { verifyToken } from '../utils/jwt.js';

export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error('❌ 인증 헤더 없음');
    return res.status(401).json({ error: '인증이 필요합니다.' });
  }

  const token = authHeader.substring(7);
  const decoded = verifyToken(token);

  if (!decoded) {
    console.error('❌ 유효하지 않은 토큰');
    return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }

  req.userId = decoded.userId;
  console.log('✅ 인증 성공, User ID:', req.userId);
  next();
};


