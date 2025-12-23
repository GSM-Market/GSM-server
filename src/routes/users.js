import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getMyInfo,
  getMyProducts,
  updateNickname,
  uploadAvatar,
  deleteAccount
} from '../controllers/userController.js';
import { upload } from '../utils/upload.js';

const router = express.Router();

router.get('/me', authenticate, getMyInfo);
router.get('/me/products', authenticate, getMyProducts);
router.put('/me/nickname', authenticate, updateNickname);
router.post('/me/avatar', authenticate, (req, res, next) => {
  console.log('📤 프로필 사진 업로드 라우트 도달');
  console.log('Headers:', req.headers);
  console.log('Body (before multer):', req.body);
  next();
}, upload.single('avatar'), (err, req, res, next) => {
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
}, (req, res, next) => {
  console.log('📤 Multer 처리 완료');
  console.log('File:', req.file);
  console.log('Body (after multer):', req.body);
  console.log('User ID:', req.userId);
  next();
}, uploadAvatar);
router.delete('/me', authenticate, deleteAccount);

export default router;




