import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getMyInfo,
  getMyProducts,
  updateNickname,
  deleteAccount
} from '../controllers/userController.js';

const router = express.Router();

router.get('/me', authenticate, getMyInfo);
router.get('/me/products', authenticate, getMyProducts);
router.put('/me/nickname', authenticate, updateNickname);
router.delete('/me', authenticate, deleteAccount);

export default router;




