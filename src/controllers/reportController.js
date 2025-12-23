import pool from '../config/database.js';

// 신고 생성
export const createReport = async (req, res) => {
  try {
    const reporterId = req.userId;
    const { reportType, targetId, reason, description } = req.body;

    // 입력값 검증
    if (!reportType || !targetId || !reason) {
      return res.status(400).json({ error: '신고 유형, 대상 ID, 신고 사유를 입력해주세요.' });
    }

    // 신고 유형 검증
    const validTypes = ['PRODUCT', 'USER', 'MESSAGE'];
    if (!validTypes.includes(reportType)) {
      return res.status(400).json({ error: '올바른 신고 유형을 선택해주세요.' });
    }

    // 중복 신고 확인 (같은 사용자가 같은 대상을 이미 신고했는지)
    const [existingReports] = await pool.execute(
      'SELECT id FROM reports WHERE reporter_id = ? AND report_type = ? AND target_id = ? AND status = ?',
      [reporterId, reportType, targetId, 'PENDING']
    );

    if (existingReports.length > 0) {
      return res.status(400).json({ error: '이미 신고한 항목입니다.' });
    }

    // 신고 저장
    const [result] = await pool.execute(
      'INSERT INTO reports (reporter_id, report_type, target_id, reason, description) VALUES (?, ?, ?, ?, ?)',
      [reporterId, reportType, targetId, reason, description || null]
    );

    console.log(`✅ 신고 생성: ${reportType} #${targetId} by user #${reporterId}`);

    res.status(201).json({
      message: '신고가 접수되었습니다. 관리자가 검토 후 조치하겠습니다.',
      reportId: result.insertId
    });
  } catch (error) {
    console.error('❌ Create report error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      reporterId: req.userId,
      body: req.body
    });
    res.status(500).json({ 
      error: '신고 접수에 실패했습니다.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// 모든 신고 조회 (관리자)
export const getAllReports = async (req, res) => {
  try {
    const { status, reportType } = req.query;

    let query = `
      SELECT 
        r.*,
        reporter.email as reporter_email,
        reporter.nickname as reporter_nickname,
        reviewer.email as reviewer_email,
        reviewer.nickname as reviewer_nickname,
        p.title as product_title,
        p.price as product_price,
        p.image_url as product_image_url,
        target_user.email as target_user_email,
        target_user.nickname as target_user_nickname
      FROM reports r
      LEFT JOIN users reporter ON r.reporter_id = reporter.id
      LEFT JOIN users reviewer ON r.reviewed_by = reviewer.id
      LEFT JOIN products p ON r.report_type = 'PRODUCT' AND r.target_id = p.id
      LEFT JOIN users target_user ON r.report_type = 'USER' AND r.target_id = target_user.id
    `;

    const conditions = [];
    const params = [];

    if (status) {
      conditions.push('r.status = ?');
      params.push(status);
    }

    if (reportType) {
      conditions.push('r.report_type = ?');
      params.push(reportType);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY r.created_at DESC';

    const [reports] = await pool.execute(query, params);

    // 신고 대상 정보는 이미 JOIN으로 가져왔으므로 그대로 반환
    res.json({ reports });
  } catch (error) {
    console.error('Get all reports error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

// 신고 상태 업데이트 (관리자)
export const updateReportStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const adminId = req.userId;

    // 상태 검증
    const validStatuses = ['PENDING', 'REVIEWED', 'RESOLVED', 'REJECTED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: '올바른 상태를 선택해주세요.' });
    }

    // 신고 존재 확인
    const [reports] = await pool.execute('SELECT * FROM reports WHERE id = ?', [id]);
    if (reports.length === 0) {
      return res.status(404).json({ error: '신고를 찾을 수 없습니다.' });
    }

    // 상태 업데이트
    if (status === 'PENDING') {
      await pool.execute(
        'UPDATE reports SET status = ?, reviewed_at = NULL, reviewed_by = NULL WHERE id = ?',
        [status, id]
      );
    } else {
      await pool.execute(
        'UPDATE reports SET status = ?, reviewed_at = NOW(), reviewed_by = ? WHERE id = ?',
        [status, adminId, id]
      );
    }

    console.log(`✅ 신고 상태 업데이트: #${id} -> ${status} by admin #${adminId}`);

    res.json({ message: '신고 상태가 업데이트되었습니다.' });
  } catch (error) {
    console.error('Update report status error:', error);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};

