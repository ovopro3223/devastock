// ===== نظام الأحرف النادرة والمضاعفات =====
import { saveLetterToStock } from './storage.js';
import { recordLetter, getAccountLetterMultiplier } from './lifetime-storage.js';
import { getLetterMultiplier } from './game-progression.js';

// تصنيف الحروف العربية حسب التكرار في الكلمات
// الشائعة كلها = ندرة عادية، الحروف الأقل تكراراً = نادرة، أصعبها = ملحمية
const RARITY = {
  // common: متاح بكثرة
  'ا': 'common', 'ل': 'common', 'م': 'common', 'ي': 'common', 'ن': 'common',
  'ت': 'common', 'ر': 'common', 'و': 'common', 'ب': 'common', 'ه': 'common',
  // uncommon: أقل تكراراً
  'س': 'uncommon', 'ك': 'uncommon', 'د': 'uncommon', 'ع': 'uncommon', 'ف': 'uncommon',
  'ق': 'uncommon', 'ج': 'uncommon', 'ح': 'uncommon',
  // rare: نادر
  'ش': 'rare', 'ص': 'rare', 'خ': 'rare', 'ث': 'rare', 'ز': 'rare', 'ط': 'rare',
  // epic: أندر
  'ذ': 'epic', 'ض': 'epic', 'ظ': 'epic', 'غ': 'epic',
};

export const RARITY_INFO = {
  common:   { label: 'عادي',  color: '#FFFFFF', emoji: '',   weight: 1 },
  uncommon: { label: 'مميز',  color: '#5DD3D3', emoji: '✦',  weight: 1.05 },
  rare:     { label: 'نادر',  color: '#9B6BFF', emoji: '◆',  weight: 1.15 },
  epic:     { label: 'ملحمي', color: '#FF6B9D', emoji: '★',  weight: 1.3 },
};

export function getLetterRarity(letter) {
  return RARITY[letter] || 'common';
}

export function getRarityInfo(rarity) {
  return RARITY_INFO[rarity] || RARITY_INFO.common;
}

// تحديد ما إذا كان الحرف "ذهبي" عند الالتقاط — احتمالات أقل
const GOLDEN_BASE_CHANCE = 0.02;
const RAINBOW_CHANCE     = 0.002;

export function rollSpecial(letter) {
  const r = Math.random();
  if (r < RAINBOW_CHANCE) return 'rainbow';   // ×5
  const rarity = getLetterRarity(letter);
  const goldenChance = GOLDEN_BASE_CHANCE * (rarity === 'epic' ? 2 : rarity === 'rare' ? 1.5 : 1);
  if (r < RAINBOW_CHANCE + goldenChance) return 'golden';   // ×3
  return null;
}

// ===== الحرف الذهبي/قوس قزح في الـ spawner — قبل الالتقاط =====
// يستخدم لتمييز الحرف المتساقط بصرياً
export function tagSpawn(letter) {
  return {
    letter,
    rarity: getLetterRarity(letter),
    special: rollSpecial(letter),  // null | 'golden' | 'rainbow'
  };
}

// ===== مكافأة الالتقاط =====
// gameId: 'letter-rain' | 'taxi' | ...
// baseCount: العدد الأساسي قبل أي مضاعفات (افتراضي 1)
// spawnTag: من tagSpawn — اختياري
// returns { letter, count, special, rarity }
export function awardLetter(gameId, letter, baseCount = 1, spawnTag = null) {
  // التوافق مع الاستدعاء القديم: awardLetter(gameId, letter, spawnTag)
  if (typeof baseCount === 'object' && baseCount !== null) {
    spawnTag = baseCount;
    baseCount = 1;
  }

  const rarity = spawnTag?.rarity || getLetterRarity(letter);
  const special = spawnTag?.special || null;

  const gameMult = getLetterMultiplier(gameId);
  const rarityMult = RARITY_INFO[rarity].weight;
  const specialMult = special === 'rainbow' ? 5 : special === 'golden' ? 3 : 1;
  const accountMult = getAccountLetterMultiplier();

  const totalMult = gameMult * rarityMult * specialMult * accountMult;
  const exact = baseCount * totalMult;
  const baseFloor = Math.floor(exact);
  const fractional = exact - baseFloor;
  const finalCount = Math.max(1, baseFloor + (Math.random() < fractional ? 1 : 0));

  for (let i = 0; i < finalCount; i++) {
    saveLetterToStock(letter);
    recordLetter(letter, 1);
  }

  return { letter, count: finalCount, special, rarity };
}
