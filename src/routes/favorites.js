import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { toggleFavorite, getFavoriteStatus, getFavoriteProducts } from '../controllers/favoriteController.js';

const router = express.Router();

// 모든 라우트는 인증 필요
router.use(authenticate);

// 관심 상품 목록 조회
router.get('/', getFavoriteProducts);

// 좋아요 추가/제거
router.post('/:product_id', toggleFavorite);

// 좋아요 상태 확인
router.get('/:product_id', getFavoriteStatus);

export default router;

