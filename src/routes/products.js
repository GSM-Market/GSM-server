import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { upload } from '../utils/upload.js';
import {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct
} from '../controllers/productController.js';

const router = express.Router();

// 상품 목록 조회 (인증 불필요)
router.get('/', getProducts);

// 상품 상세 조회 (인증 불필요)
router.get('/:id', getProduct);

// 상품 등록 (인증 필요)
router.post('/', authenticate, (req, res, next) => {
  console.log('📤 상품 등록 라우트 도달');
  console.log('Headers:', req.headers);
  console.log('Body (before multer):', req.body);
  next();
}, upload.single('image'), (req, res, next) => {
  console.log('📤 Multer 처리 완료');
  console.log('File:', req.file);
  console.log('Body (after multer):', req.body);
  console.log('User ID:', req.userId);
  next();
}, (err, req, res, next) => {
  // Multer 에러 처리
  if (err) {
    console.error('❌ Multer 에러:', err);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: '파일 크기는 5MB 이하여야 합니다.' });
    }
    if (err.message === '이미지 파일만 업로드 가능합니다.') {
      return res.status(400).json({ error: '이미지 파일만 업로드 가능합니다.' });
    }
    return res.status(400).json({ error: '파일 업로드에 실패했습니다.' });
  }
  next();
}, createProduct);

// 상품 수정 (인증 필요)
router.put('/:id', authenticate, upload.single('image'), updateProduct);

// 상품 삭제 (인증 필요)
router.delete('/:id', authenticate, deleteProduct);

export default router;


