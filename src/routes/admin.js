import express from 'express';
import {
  getAllProducts,
  getAllUsers,
  deleteProduct,
  deleteUser
} from '../controllers/adminController.js';
import { verifyToken } from '../utils/jwt.js';
import pool from '../config/database.js';

const router = express.Router();

// 관리자 권한 확인 미들웨어 (토큰 검증 포함)
const checkAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: '인증이 필요합니다.' });
    }

    const decoded = verifyToken(token);
    if (!decoded || !decoded.userId) {
      return res.status(401).json({ error: '인증이 필요합니다.' });
    }

    const userId = decoded.userId;

    const [users] = await pool.execute(
      'SELECT is_admin FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0 || !users[0].is_admin) {
      return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
    }

    req.userId = userId;
    next();
  } catch (error) {
    console.error('Check admin error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

// 모든 라우트에 인증 및 관리자 권한 확인
router.use(checkAdmin);

router.get('/products', getAllProducts);
router.get('/users', getAllUsers);
router.delete('/products/:id', deleteProduct);
router.delete('/users/:id', deleteUser);

export default router;

