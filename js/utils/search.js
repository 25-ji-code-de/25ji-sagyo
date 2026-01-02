/**
 * Search Utilities Module
 * Provides text normalization, romaji conversion, and search indexing
 */

// Pre-compiled regular expressions
const RE_FULLWIDTH_ALPHANUM = /[Ａ-Ｚａ-ｚ０-９]/g;
const RE_FULLWIDTH_SPACE = /　/g;
const RE_KATAKANA = /[\u30A1-\u30F6]/g;
const RE_BRACKETS = /[「」『』【】〈〉《》（）()［］\[\]]/g;
const RE_MULTI_SPACE = /\s+/g;
const RE_ALL_SPACE = /\s/g;

// Kana constants
const KATAKANA_OFFSET = 0x30A1 - 0x3041;

// Romaji conversion rules (sorted by length, longer patterns first)
const ROMAJI_RULES = [
  // Two-character rules (youon)
  ['きゃ','kya'],['きゅ','kyu'],['きょ','kyo'],
  ['しゃ','sha'],['しゅ','shu'],['しょ','sho'],
  ['ちゃ','cha'],['ちゅ','chu'],['ちょ','cho'],
  ['にゃ','nya'],['にゅ','nyu'],['にょ','nyo'],
  ['ひゃ','hya'],['ひゅ','hyu'],['ひょ','hyo'],
  ['みゃ','mya'],['みゅ','myu'],['みょ','myo'],
  ['りゃ','rya'],['りゅ','ryu'],['りょ','ryo'],
  ['ぎゃ','gya'],['ぎゅ','gyu'],['ぎょ','gyo'],
  ['じゃ','ja'],['じゅ','ju'],['じょ','jo'],
  ['びゃ','bya'],['びゅ','byu'],['びょ','byo'],
  ['ぴゃ','pya'],['ぴゅ','pyu'],['ぴょ','pyo'],
  // Single characters
  ['あ','a'],['い','i'],['う','u'],['え','e'],['お','o'],
  ['か','ka'],['き','ki'],['く','ku'],['け','ke'],['こ','ko'],
  ['さ','sa'],['し','shi'],['す','su'],['せ','se'],['そ','so'],
  ['た','ta'],['ち','chi'],['つ','tsu'],['て','te'],['と','to'],
  ['な','na'],['に','ni'],['ぬ','nu'],['ね','ne'],['の','no'],
  ['は','ha'],['ひ','hi'],['ふ','fu'],['へ','he'],['ほ','ho'],
  ['ま','ma'],['み','mi'],['む','mu'],['め','me'],['も','mo'],
  ['や','ya'],['ゆ','yu'],['よ','yo'],
  ['ら','ra'],['り','ri'],['る','ru'],['れ','re'],['ろ','ro'],
  ['わ','wa'],['を','wo'],['ん','n'],
  ['が','ga'],['ぎ','gi'],['ぐ','gu'],['げ','ge'],['ご','go'],
  ['ざ','za'],['じ','ji'],['ず','zu'],['ぜ','ze'],['ぞ','zo'],
  ['だ','da'],['ぢ','di'],['づ','du'],['で','de'],['ど','do'],
  ['ば','ba'],['び','bi'],['ぶ','bu'],['べ','be'],['ぼ','bo'],
  ['ぱ','pa'],['ぴ','pi'],['ぷ','pu'],['ぺ','pe'],['ぽ','po'],
  ['ー','-'],
];

// Quick lookup maps
const ROMAJI_MAP = new Map(ROMAJI_RULES);
const TWO_CHAR_ROMAJI = new Set(ROMAJI_RULES.filter(r => r[0].length === 2).map(r => r[0]));

/**
 * Normalize text for search
 * - Converts to lowercase
 * - Converts fullwidth to halfwidth
 * - Converts katakana to hiragana
 * - Normalizes brackets and spaces
 * @param {string} text
 * @returns {string}
 */
export function normalizeText(text) {
  if (!text) return '';
  
  return text
    .toLowerCase()
    .replace(RE_FULLWIDTH_ALPHANUM, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(RE_FULLWIDTH_SPACE, ' ')
    .replace(RE_KATAKANA, c => String.fromCharCode(c.charCodeAt(0) - KATAKANA_OFFSET))
    .replace(RE_BRACKETS, ' ')
    .replace(RE_MULTI_SPACE, ' ')
    .trim();
}

/**
 * Convert hiragana/katakana to romaji
 * @param {string} text
 * @returns {string}
 */
export function toRomaji(text) {
  if (!text) return '';
  
  const normalized = normalizeText(text);
  const len = normalized.length;
  let result = '';
  
  for (let i = 0; i < len; i++) {
    // Try to match two characters
    if (i + 1 < len) {
      const twoChar = normalized[i] + normalized[i + 1];
      if (TWO_CHAR_ROMAJI.has(twoChar)) {
        result += ROMAJI_MAP.get(twoChar);
        i++;
        continue;
      }
    }
    
    const char = normalized[i];
    
    // Sokuon (small tsu) handling
    if (char === 'っ' && i + 1 < len) {
      const next = ROMAJI_MAP.get(normalized[i + 1]);
      if (next?.[0]) result += next[0];
      continue;
    }
    
    result += ROMAJI_MAP.get(char) ?? char;
  }
  
  return result;
}

/**
 * Build search index for music list
 * @param {Array} musics - Music data array
 * @param {Object} titles - Chinese title mapping
 * @returns {Array} Search index
 */
export function buildSearchIndex(musics, titles) {
  return musics.map(m => {
    const title = m.title || '';
    const titleZh = titles[m.id] || '';
    const composer = m.composer || '';
    const lyricist = m.lyricist || '';
    const pronunciation = m.pronunciation || '';
    
    // Pre-compute all variants
    const titleNorm = normalizeText(title);
    const titleZhNorm = normalizeText(titleZh);
    const pronunciationNorm = normalizeText(pronunciation);
    const pronunciationRomaji = toRomaji(pronunciation);
    
    const variants = [
      titleNorm,
      titleZhNorm,
      normalizeText(composer),
      normalizeText(lyricist),
      pronunciationNorm,
      pronunciationRomaji,
      titleNorm.replace(RE_ALL_SPACE, ''),
      pronunciationRomaji.replace(RE_ALL_SPACE, ''),
    ].filter(Boolean);

    return {
      id: m.id,
      variants: [...new Set(variants)],
      _titleNorm: titleNorm,
      _titleZhNorm: titleZhNorm,
    };
  });
}

/**
 * Calculate search score for a song
 * @param {Object} queryData - Prepared query data
 * @param {Object} song - Song from search index
 * @returns {number} Score 0-1
 */
export function calculateScore(queryData, song) {
  const { norm, noSpace } = queryData;
  let maxScore = 0;
  
  for (const variant of song.variants) {
    let score = 0;
    
    if (variant === norm) {
      score = 1.0;
    } else if (variant.startsWith(norm) || variant.startsWith(noSpace)) {
      score = 0.9 - (variant.length - norm.length) * 0.01;
    } else if (variant.includes(norm) || variant.includes(noSpace)) {
      score = 0.7 - (variant.length - norm.length) * 0.005;
    } else if (norm.length >= 2) {
      let matches = 0;
      for (const c of norm) {
        if (variant.includes(c)) matches++;
      }
      if (matches >= norm.length * 0.7) {
        score = 0.3 + (matches / norm.length) * 0.3;
      }
    }
    
    if (score > maxScore) maxScore = score;
    if (maxScore >= 1.0) break;
  }
  
  // Title bonus
  if (song._titleNorm === norm || song._titleZhNorm === norm) {
    maxScore = Math.min(1.0, maxScore + 0.1);
  }
  
  return Math.round(maxScore * 1000) / 1000;
}

/**
 * Prepare query data for search
 * @param {string} query - Raw search query
 * @returns {Object} Prepared query data
 */
export function prepareQueryData(query) {
  const norm = normalizeText(query);
  return {
    norm,
    noSpace: norm.replace(RE_ALL_SPACE, ''),
  };
}
