import pool from '../config/database.js';

// 좋아요 추가/제거
export const toggleFavorite = async (req, res) => {
  try {
    const userId = req.userId;
    const { product_id } = req.params;

    if (!userId) {
      return res.status(401).json({ error: '인증이 필요합니다.' });
    }

    // 상품 존재 확인
    const [products] = await pool.execute(
      'SELECT * FROM products WHERE id = ?',
      [product_id]
    );

    if (products.length === 0) {
      return res.status(404).json({ error: '상품을 찾을 수 없습니다.' });
    }

    // 기존 좋아요 확인
    const [existing] = await pool.execute(
      'SELECT * FROM favorites WHERE user_id = ? AND product_id = ?',
      [userId, product_id]
    );

    if (existing.length > 0) {
      // 좋아요 제거
      await pool.execute(
        'DELETE FROM favorites WHERE user_id = ? AND product_id = ?',
        [userId, product_id]
      );
      res.json({ is_favorite: false, message: '좋아요가 해제되었습니다.' });
    } else {
      // 좋아요 추가
      await pool.execute(
        'INSERT INTO favorites (user_id, product_id) VALUES (?, ?)',
        [userId, product_id]
      );
      res.json({ is_favorite: true, message: '좋아요가 추가되었습니다.' });
    }
  } catch (error) {
    console.error('Toggle favorite error:', error);
    res.status(500).json({ error: '좋아요 처리에 실패했습니다.' });
  }
};

// 좋아요 상태 확인
export const getFavoriteStatus = async (req, res) => {
  try {
    const userId = req.userId;
    const { product_id } = req.params;

    if (!userId) {
      return res.json({ is_favorite: false });
    }

    const [favorites] = await pool.execute(
      'SELECT * FROM favorites WHERE user_id = ? AND product_id = ?',
      [userId, product_id]
    );

    res.json({ is_favorite: favorites.length > 0 });
  } catch (error) {
    console.error('Get favorite status error:', error);
    res.status(500).json({ error: '좋아요 상태 확인에 실패했습니다.' });
  }
};

// 관심 상품 목록 조회
export const getFavoriteProducts = async (req, res) => {
  try {
    const userId = req.userId;

    const [products] = await pool.execute(
      `SELECT 
        p.*,
        u.nickname as seller_nickname,
        CASE WHEN p.user_id = ? THEN 1 ELSE 0 END as is_mine,
        COALESCE((SELECT COUNT(*) FROM favorites WHERE product_id = p.id), 0) as favorite_count
      FROM favorites f
      JOIN products p ON f.product_id = p.id
      JOIN users u ON p.user_id = u.id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC`,
      [userId, userId]
    );

    res.json({ products });
  } catch (error) {
    console.error('Get favorite products error:', error);
    res.status(500).json({ error: '관심 상품 목록을 불러오는데 실패했습니다.' });
  }
};
