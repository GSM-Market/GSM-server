/**
 * 욕설 필터 유틸리티
 * 채팅 메시지에서 욕설/비속어를 탐지하고 차단합니다.
 */

// 욕설 단어 리스트 (추가/수정 가능하도록 별도 파일로 관리)
const PROFANITY_WORDS = [
  // 직접적인 욕설
  '시발', '씨발', '병신', '병딱', '빙신', '빙딱',
  '개새끼', '개새', '개쓰레기', '개같은', '개돼지',
  '좆', '좃', '존나', '존니', '존나게',
  '미친', '미친놈', '미친년', '미친새끼',
  '닥쳐', '닥치', '닥쳐라',
  '죽어', '죽어라', '죽을', '죽여',
  '엿', '엿먹어', '엿먹어라',
  '지랄', '지랄하네', '지랄한다',
  '개소리', '헛소리',
  '바보', '멍청이', '등신', '호구',
  '새끼', '새키', '새퀴',
  '놈', '년', '새끼',
  '쓰레기', '찌질이',
  
  // 자음/모음 분리 형태
  'ㅅㅂ', 'ㅂㅅ', 'ㅅㅣㅂㅏㄹ', 'ㅂㅣㅇㅅㅣㄴ',
  'ㄱㅐㅅㅐㄲㅣ', 'ㅈㅗㄴㄴㅏ',
  
  // 영문 대체
  'sibal', 'sibbal', 'ssibal', 'sibarl',
  'byungsin', 'byungshin', 'byungsin',
  'gae', 'gae saekki', 'gaesaekki',
  'jot', 'jotna', 'jonna',
  'michin', 'michin nom',
  'dakchyeo', 'dakchi',
  'juk', 'juk eo', 'juk eora',
  'yeot', 'yeot meogeo',
  'jiral', 'jiralhane',
  'gaesori', 'heutsori',
  'saekki', 'saeki', 'saekwi',
  'nom', 'nyeon',
  'sseuregi', 'jjijiri',
  
  // 반복 문자 포함 (정규화 후 매칭)
  '시이발', '시발발', '병신신', '개새끼끼',
  
  // 특수문자 포함 (정규화 후 매칭)
  // 실제 검사는 normalizeText에서 처리
];

/**
 * 텍스트 정규화 함수
 * 욕설 우회 시도를 최대한 잡기 위해 텍스트를 정규화합니다.
 */
export const normalizeText = (text) => {
  if (!text || typeof text !== 'string') return '';
  
  let normalized = text.toLowerCase();
  
  // 공백 제거
  normalized = normalized.replace(/\s+/g, '');
  
  // 특수문자 제거 (일부는 유지하여 변형 탐지)
  normalized = normalized.replace(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/g, '');
  
  // 반복 문자 축약 (예: "시이이발" -> "시발", "ㅅㅂㅂㅂ" -> "ㅅㅂ")
  normalized = normalized.replace(/(.)\1{2,}/g, '$1$1');
  
  // 한글 자모 분리/결합 처리
  // 한글 유니코드 범위: AC00-D7A3
  // 초성: ㄱ-ㅎ (0x1100-0x1112)
  // 중성: ㅏ-ㅣ (0x1161-0x1175)
  // 종성: ㄱ-ㅎ (0x11A8-0x11C2)
  
  // 자음만 있는 경우 처리 (예: "ㅅㅂ" -> "시발"로 변환 시도는 하지 않고 그대로 검사)
  // 이미 PROFANITY_WORDS에 자음만 있는 형태가 포함되어 있음
  
  return normalized;
};

/**
 * 욕설 포함 여부 확인
 * @param {string} text - 검사할 텍스트
 * @returns {boolean} - 욕설이 포함되어 있으면 true
 */
export const containsProfanity = (text) => {
  if (!text || typeof text !== 'string') return false;
  
  const normalized = normalizeText(text);
  
  // 욕설 단어 리스트와 비교
  for (const word of PROFANITY_WORDS) {
    const normalizedWord = normalizeText(word);
    
    // 정규화된 텍스트에 정규화된 욕설 단어가 포함되어 있는지 확인
    if (normalized.includes(normalizedWord)) {
      return true;
    }
  }
  
  // 추가 패턴 검사 (공백/특수문자로 분리된 형태)
  // 예: "시 @ 발", "병 # 신" 같은 형태
  const textWithoutSpecial = text.replace(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`\s]/g, '');
  const normalizedWithoutSpecial = normalizeText(textWithoutSpecial);
  
  for (const word of PROFANITY_WORDS) {
    const normalizedWord = normalizeText(word);
    if (normalizedWithoutSpecial.includes(normalizedWord)) {
      return true;
    }
  }
  
  return false;
};

/**
 * 메시지 검증 (욕설 필터)
 * @param {string} message - 검증할 메시지
 * @returns {Object} - { valid: boolean, error?: string }
 */
export const validateMessage = (message) => {
  if (!message || typeof message !== 'string') {
    return { valid: false, error: '메시지가 없습니다.' };
  }
  
  if (message.trim().length === 0) {
    return { valid: false, error: '메시지를 입력해주세요.' };
  }
  
  if (containsProfanity(message)) {
    return { 
      valid: false, 
      error: '부적절한 표현이 포함되어 전송할 수 없습니다.' 
    };
  }
  
  return { valid: true };
};

export default {
  normalizeText,
  containsProfanity,
  validateMessage
};

