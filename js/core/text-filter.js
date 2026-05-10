// ===== فلتر الكلمات الممنوعة =====
import { getStock, spendLetters } from './storage.js';

export const BAD_WORDS_PENALTY = 100;

// قائمة الكلمات المحظورة (مع تطبيع الأحرف ةى ↔ هي)
// ملاحظة: بعض الأسماء قد تتشابه مع كلمات سيئة (عمر اسم شائع) — لا نضيفها
const BAD_WORDS_RAW = [
  'زب','كس','طيز','اير','زبر','عير',
  'شرموطة','شرموطه','شراميط','شرمطه',
  'قحبة','قحبه','قحبات','قحاب',
  'نيك','نيج','تنتاك',
  'سكس','ايري',
];

function _normalize(s) {
  return String(s)
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[ً-ٰٟ]/g, '')
    .toLowerCase();
}

const BAD_WORDS = BAD_WORDS_RAW.map(_normalize);

// يفحص النص ويرجع كلمة سيئة لو وجد، أو null
export function findBadWord(text) {
  const norm = _normalize(text);
  for (const bad of BAD_WORDS) {
    // كلمة كاملة أو ضمن كلمة (محاطة بمسافة/علامة ترقيم/طرف)
    const re = new RegExp(`(?:^|[\\s\\W_])${escapeRegex(bad)}(?:[\\s\\W_]|$)`, 'i');
    if (re.test(' ' + norm + ' ')) return bad;
  }
  return null;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// يطبق الفلتر — لو في كلمة سيئة:
//   - يخصم 100 حرف من المخزن (الأكثر وفرة أولاً)
//   - يرجع { blocked: true, word, penaltyApplied, penaltyAmount }
// لو ما في:
//   - يرجع { blocked: false }
export function applyTextFilter(text) {
  const word = findBadWord(text);
  if (!word) return { blocked: false };

  const stock = getStock();
  const total = Object.values(stock).reduce((s, n) => s + n, 0);
  let penaltyApplied = false;
  let penaltyAmount = 0;

  if (total > 0) {
    let toDeduct = Math.min(BAD_WORDS_PENALTY, total);
    penaltyAmount = toDeduct;
    const sorted = Object.entries(stock).sort((a, b) => b[1] - a[1]);
    const cost = {};
    for (const [letter, count] of sorted) {
      if (toDeduct <= 0) break;
      const take = Math.min(toDeduct, count);
      if (take > 0) {
        cost[letter] = take;
        toDeduct -= take;
      }
    }
    if (Object.keys(cost).length > 0) {
      spendLetters(cost);
      penaltyApplied = true;
    }
  }

  return { blocked: true, word, penaltyApplied, penaltyAmount };
}
