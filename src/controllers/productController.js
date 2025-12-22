import pool from '../config/database.js';

// 상품 목록 조회
export const getProducts = async (req, res) => {
  try {
    const { sort = 'latest', status, keyword, category, page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offsetNum = (pageNum - 1) * limitNum;
    const userId = req.userId || null;

    console.log('📋 상품 목록 조회 요청:', { sort, status, keyword, category, page, limit, userId });

    let query = `
      SELECT 
        p.*,
        COALESCE(u.nickname, '탈퇴한 사용자') as seller_nickname,
        CASE WHEN p.user_id = ? THEN 1 ELSE 0 END as is_mine,
        COALESCE((SELECT COUNT(*) FROM favorites WHERE product_id = p.id), 0) as favorite_count,
        COALESCE((SELECT COUNT(*) FROM conversations WHERE product_id = p.id), 0) as chat_count,
        COALESCE(p.view_count, 0) as view_count,
        CASE WHEN u.id IS NULL THEN 1 ELSE 0 END as is_deleted_user
      FROM products p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE 1=1
    `;
    const params = [userId || 0];

    // 카테고리 필터
    if (category && category.trim()) {
      query += ' AND p.category = ?';
      params.push(category);
    }

    // 상태 필터
    if (status && (status === 'SELLING' || status === 'SOLD')) {
      query += ' AND p.status = ?';
      params.push(status);
    }

    // 키워드 검색
    if (keyword) {
      query += ' AND (p.title LIKE ? OR p.description LIKE ?)';
      const searchKeyword = `%${keyword}%`;
      params.push(searchKeyword, searchKeyword);
    }

    // 정렬
    if (sort === 'price_asc') {
      query += ' ORDER BY p.price ASC';
    } else if (sort === 'price_desc') {
      query += ' ORDER BY p.price DESC';
    } else {
      query += ' ORDER BY p.created_at DESC';
    }

    // LIMIT와 OFFSET은 파라미터 바인딩 대신 직접 삽입 (안전한 값만 사용)
    query += ` LIMIT ${limitNum} OFFSET ${offsetNum}`;

    console.log('🔍 실행할 쿼리:', query);
    console.log('📊 파라미터:', params);

    const [products] = await pool.execute(query, params);

    console.log(`✅ ${products.length}개의 상품 조회 완료`);

    // 전체 개수 조회
    let countQuery = 'SELECT COUNT(*) as total FROM products WHERE 1=1';
    const countParams = [];

    if (category && category.trim()) {
      countQuery += ' AND category = ?';
      countParams.push(category);
    }

    if (status && (status === 'SELLING' || status === 'SOLD')) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }

    if (keyword) {
      countQuery += ' AND (title LIKE ? OR description LIKE ?)';
      const searchKeyword = `%${keyword}%`;
      countParams.push(searchKeyword, searchKeyword);
    }

    const [countResult] = await pool.execute(countQuery, countParams);
    const total = countResult[0].total;

    res.json({
      products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('❌ Get products error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: '서버 오류가 발생했습니다.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// 상품 상세 조회
// 조회수 증가 추적을 위한 Map (메모리 기반, 서버 재시작 시 초기화)
const viewTracking = new Map();

export const getProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId || null;

    // 조회수 증가 (상세 페이지 조회 시) - 중복 방지
    // 같은 사용자가 같은 상품을 1시간 이내에 조회한 경우 조회수 증가하지 않음
    const viewKey = `view_${id}_${userId || req.ip || 'anonymous'}`;
    const lastViewTime = viewTracking.get(viewKey) || 0;
    const now = Date.now();
    
    // 1시간(3600000ms) 이내에 같은 사용자가 조회한 경우 조회수 증가하지 않음
    if ((now - lastViewTime) > 3600000) {
      await pool.execute(
        'UPDATE products SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?',
        [id]
      );
      viewTracking.set(viewKey, now);
      
      // 메모리 정리: 24시간 이상 된 기록 삭제
      if (viewTracking.size > 10000) {
        const oneDayAgo = now - 86400000;
        for (const [key, time] of viewTracking.entries()) {
          if (time < oneDayAgo) {
            viewTracking.delete(key);
          }
        }
      }
    }

    const [products] = await pool.execute(
      `SELECT 
        p.*,
        COALESCE(u.nickname, '탈퇴한 사용자') as seller_nickname,
        u.email as seller_email,
        CASE WHEN p.user_id = ? THEN 1 ELSE 0 END as is_mine,
        COALESCE((SELECT COUNT(*) FROM favorites WHERE product_id = p.id), 0) as favorite_count,
        COALESCE((SELECT COUNT(*) FROM conversations WHERE product_id = p.id), 0) as chat_count,
        COALESCE(p.view_count, 0) as view_count,
        CASE WHEN u.id IS NULL THEN 1 ELSE 0 END as is_deleted_user
      FROM products p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.id = ?`,
      [userId || 0, id]
    );

    if (products.length === 0) {
      return res.status(404).json({ error: '상품을 찾을 수 없습니다.' });
    }

    res.json(products[0]);
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

// 상품 등록
export const createProduct = async (req, res) => {
  try {
    console.log('📦 상품 등록 컨트롤러 시작');
    console.log('Request method:', req.method);
    console.log('Request path:', req.path);
    console.log('Request body:', req.body);
    console.log('Request file:', req.file);
    console.log('Request userId:', req.userId);
    console.log('Request headers:', {
      'content-type': req.headers['content-type'],
      'authorization': req.headers.authorization ? 'Bearer ***' : '없음'
    });

    const { title, price, description, category } = req.body;
    const userId = req.userId;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    
    console.log('📋 파싱된 데이터:', { title, price, description, imageUrl, userId });

    // 입력값 검증
    if (!title || !title.trim()) {
      console.error('❌ 제목이 없습니다');
      return res.status(400).json({ error: '제목을 입력해주세요.' });
    }

    if (!price) {
      console.error('❌ 가격이 없습니다');
      return res.status(400).json({ error: '가격을 입력해주세요.' });
    }

    if (!description || !description.trim()) {
      console.error('❌ 설명이 없습니다');
      return res.status(400).json({ error: '설명을 입력해주세요.' });
    }

    if (!userId) {
      console.error('❌ 사용자 ID가 없습니다');
      return res.status(401).json({ error: '인증이 필요합니다.' });
    }

    // 이미지 필수 검증
    if (!req.file) {
      console.error('❌ 이미지가 없습니다');
      return res.status(400).json({ error: '이미지는 필수입니다.' });
    }

    // 카테고리 검증
    const validCategories = ['전자제품', '학용품', '의류', '도서', '스포츠', '뷰티/미용', '식품', '가구/인테리어', '악세서리', '기타'];
    const productCategory = category && validCategories.includes(category) ? category : '기타';

    // 가격 처리: 콤마 제거 및 숫자 변환
    const priceStr = String(price).replace(/,/g, '').trim();
    const priceNum = parseInt(priceStr, 10);
    
    if (isNaN(priceNum) || priceNum < 0) {
      console.error('❌ 잘못된 가격:', price);
      return res.status(400).json({ error: '올바른 가격을 입력해주세요.' });
    }

    // INT 타입 최대값 검증 (MySQL INT: -2,147,483,648 ~ 2,147,483,647)
    const MAX_INT = 2147483647;
    if (priceNum > MAX_INT) {
      console.error('❌ 가격이 너무 큽니다:', priceNum);
      return res.status(400).json({ error: `가격은 ${MAX_INT.toLocaleString()}원 이하여야 합니다.` });
    }

    console.log('✅ 입력값 검증 완료:', { 
      title: title.trim(), 
      price: priceNum, 
      description: description.trim(), 
      imageUrl, 
      userId 
    });

    // 데이터베이스에 상품 등록
    console.log('💾 데이터베이스에 상품 등록 시도...');
    const insertParams = [title.trim(), priceNum, description.trim(), productCategory, imageUrl, 'SELLING', userId];
    console.log('📝 INSERT 파라미터:', insertParams);
    
    const [result] = await pool.execute(
      'INSERT INTO products (title, price, description, category, image_url, status, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      insertParams
    );

    console.log('✅ 상품 등록 완료, ID:', result.insertId);
    console.log('✅ Insert result:', result);

    // 등록된 상품 조회
    const [newProduct] = await pool.execute(
      `SELECT 
        p.*,
        u.nickname as seller_nickname,
        1 as is_mine,
        COALESCE((SELECT COUNT(*) FROM favorites WHERE product_id = p.id), 0) as favorite_count
      FROM products p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = ?`,
      [result.insertId]
    );

    if (newProduct.length === 0) {
      console.error('❌ 등록된 상품을 찾을 수 없습니다');
      return res.status(500).json({ error: '상품 등록 후 조회에 실패했습니다.' });
    }

    console.log('✅ 상품 등록 성공:', newProduct[0].id);
    res.status(201).json(newProduct[0]);
  } catch (error) {
    console.error('❌ Create product error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error errno:', error.errno);
    console.error('Error sqlState:', error.sqlState);
    console.error('Error sqlMessage:', error.sqlMessage);
    console.error('Error stack:', error.stack);
    
    // 데이터베이스 에러 처리
    if (error.code === 'ER_DATA_TOO_LONG') {
      return res.status(400).json({ error: '입력한 데이터가 너무 깁니다.' });
    }
    if (error.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(500).json({ error: '데이터베이스 필드 오류가 발생했습니다.' });
    }
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ error: '유효하지 않은 사용자입니다.' });
    }
    if (error.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD') {
      return res.status(400).json({ error: '입력한 값이 올바르지 않습니다.' });
    }
    
    res.status(500).json({ 
      error: '서버 오류가 발생했습니다.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// 상품 수정
export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const { title, price, description, status, category } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    // 상품 소유자 확인
    const [products] = await pool.execute(
      'SELECT * FROM products WHERE id = ?',
      [id]
    );

    if (products.length === 0) {
      return res.status(404).json({ error: '상품을 찾을 수 없습니다.' });
    }

    if (products[0].user_id !== userId) {
      return res.status(403).json({ error: '수정 권한이 없습니다.' });
    }

    // 업데이트할 필드 구성
    const updates = [];
    const params = [];

    if (title) {
      updates.push('title = ?');
      params.push(title);
    }
    if (price !== undefined) {
      if (isNaN(price) || price < 0) {
        return res.status(400).json({ error: '올바른 가격을 입력해주세요.' });
      }
      updates.push('price = ?');
      params.push(parseInt(price));
    }
    if (description) {
      updates.push('description = ?');
      params.push(description);
    }
    if (category) {
      const validCategories = ['전자제품', '학용품', '의류', '도서', '스포츠', '뷰티/미용', '식품', '가구/인테리어', '악세서리', '기타'];
      if (validCategories.includes(category)) {
        updates.push('category = ?');
        params.push(category);
      }
    }
    if (imageUrl) {
      updates.push('image_url = ?');
      params.push(imageUrl);
    }
    if (status && (status === 'SELLING' || status === 'SOLD')) {
      updates.push('status = ?');
      params.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: '수정할 내용이 없습니다.' });
    }

    params.push(id);

    await pool.execute(
      `UPDATE products SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const [updatedProduct] = await pool.execute(
      `SELECT 
        p.*,
        u.nickname as seller_nickname,
        1 as is_mine
      FROM products p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = ?`,
      [id]
    );

    res.json(updatedProduct[0]);
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

// 상품 삭제
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    // 상품 소유자 확인
    const [products] = await pool.execute(
      'SELECT * FROM products WHERE id = ?',
      [id]
    );

    if (products.length === 0) {
      return res.status(404).json({ error: '상품을 찾을 수 없습니다.' });
    }

    if (products[0].user_id !== userId) {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }

    await pool.execute('DELETE FROM products WHERE id = ?', [id]);

    res.json({ message: '상품이 삭제되었습니다.' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};


