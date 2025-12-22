import pool from '../config/database.js';

// 모든 상품 조회 (관리자)
export const getAllProducts = async (req, res) => {
  try {
    const [products] = await pool.execute(
      `SELECT 
        p.*,
        COALESCE(u.nickname, '탈퇴한 사용자') as seller_nickname,
        u.email as seller_email,
        COALESCE((SELECT COUNT(*) FROM favorites WHERE product_id = p.id), 0) as favorite_count,
        COALESCE((SELECT COUNT(*) FROM conversations WHERE product_id = p.id), 0) as chat_count,
        COALESCE(p.view_count, 0) as view_count
      FROM products p
      LEFT JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC`
    );

    res.json({ products });
  } catch (error) {
    console.error('Get all products error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

// 모든 사용자 조회 (관리자)
export const getAllUsers = async (req, res) => {
  try {
    const [users] = await pool.execute(
      `SELECT 
        id, email, nickname, is_verified, is_admin, created_at
      FROM users
      ORDER BY created_at DESC`
    );

    // nickname에서 끝에 붙은 "0" 제거
    const cleanedUsers = users.map(user => ({
      ...user,
      nickname: user.nickname ? user.nickname.replace(/\s*0\s*$/, '').trim() : user.nickname
    }));

    res.json({ users: cleanedUsers });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

// 상품 삭제 (관리자)
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.execute('DELETE FROM products WHERE id = ?', [id]);
    
    res.json({ message: '상품이 삭제되었습니다.' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

// 사용자 삭제 (관리자)
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.userId;
    
    // 자기 자신은 삭제 불가
    if (parseInt(id) === adminId) {
      return res.status(400).json({ error: '자기 자신은 삭제할 수 없습니다.' });
    }
    
    // 사용자 삭제 (CASCADE로 관련 데이터 자동 삭제)
    await pool.execute('DELETE FROM users WHERE id = ?', [id]);
    
    res.json({ message: '사용자가 삭제되었습니다.' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

