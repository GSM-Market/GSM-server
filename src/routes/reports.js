import express from 'express';
import {
  createReport,
  getAllReports,
  updateReportStatus
} from '../controllers/reportController.js';
import { verifyToken } from '../utils/jwt.js';
import pool from '../config/database.js';

const router = express.Router();

// 인증 미들웨어
const authenticate = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: '인증이 필요합니다.' });
    }

    const decoded = verifyToken(token);
    if (!decoded || !decoded.userId) {
      return res.status(401).json({ error: '인증이 필요합니다.' });
    }

    req.userId = decoded.userId;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: '인증이 필요합니다.' });
  }
};

// 관리자 권한 확인 미들웨어
const checkAdmin = async (req, res, next) => {
  try {
    const userId = req.userId;

    const [users] = await pool.execute(
      'SELECT is_admin FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0 || !users[0].is_admin) {
      return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
    }

    next();
  } catch (error) {
    console.error('Check admin error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

// 신고 생성 (인증 필요)
router.post('/', authenticate, createReport);

// 모든 신고 조회 (관리자만)
router.get('/', authenticate, checkAdmin, getAllReports);

// 신고 상태 업데이트 (관리자만)
router.put('/:id/status', authenticate, checkAdmin, updateReportStatus);

export default router;

