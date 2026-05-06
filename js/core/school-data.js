// ===== بيانات المدرسة: الصفوف والأسماء العربية =====

export const ARABIC_LETTERS = ['ا','ب','ت','ث','ج','ح','خ','د','ذ','ر','ز','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ك','ل','م','ن','ه','و','ي'];

// تطبيع الأحرف العربية: أ/إ/آ → ا، ة → ه، ى → ي، إزالة التشكيل
export function normalizeArabic(s) {
  return String(s)
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ء/g, '')
    .replace(/[ً-ٰٟ]/g, '');
}

// استخراج الأحرف الفريدة من اسم
export function getNameLetters(name) {
  const norm = normalizeArabic(name);
  return [...new Set(norm.split(''))].filter(c => ARABIC_LETTERS.includes(c));
}

// تكلفة فتح طالب: 20 من كل حرف فريد في اسمه
const COST_PER_LETTER = 20;
export function getStudentCost(name) {
  const letters = getNameLetters(name);
  const cost = {};
  for (const c of letters) cost[c] = COST_PER_LETTER;
  return cost;
}

// التحقق من إمكانية فتح طالب باستخدام المخزن الحالي
export function canAffordStudent(name, stock) {
  const cost = getStudentCost(name);
  for (const [letter, count] of Object.entries(cost)) {
    if ((stock[letter] || 0) < count) return false;
  }
  return true;
}

// ===== تعريف الصفوف =====
// كل صف: id, name, emoji, capacity (عدد الطلاب), letterCount (كم حرف ينتجون),
//        ratePerHour (لكل تلميذ، لكل حرف بالساعة), unlockCost (إجمالي حروف للفتح)
export const GRADES = [
  { id:  0, name: 'الروضة',           emoji: '🧸', capacity: 10, letterCount:  2, ratePerHour:  20, unlockCost:      0 },
  { id:  1, name: 'الصف الأول',       emoji: '🌱', capacity: 12, letterCount:  3, ratePerHour:  30, unlockCost:  10000 },
  { id:  2, name: 'الصف الثاني',      emoji: '📘', capacity: 14, letterCount:  4, ratePerHour:  40, unlockCost:  20000 },
  { id:  3, name: 'الصف الثالث',      emoji: '✏️', capacity: 16, letterCount:  6, ratePerHour:  50, unlockCost:  30000 },
  { id:  4, name: 'الصف الرابع',      emoji: '📚', capacity: 18, letterCount:  8, ratePerHour:  60, unlockCost:  40000 },
  { id:  5, name: 'الصف الخامس',      emoji: '📖', capacity: 20, letterCount: 10, ratePerHour:  70, unlockCost:  50000 },
  { id:  6, name: 'الصف السادس',      emoji: '📝', capacity: 22, letterCount: 12, ratePerHour:  80, unlockCost:  60000 },
  { id:  7, name: 'الصف السابع',      emoji: '🧮', capacity: 24, letterCount: 14, ratePerHour:  90, unlockCost:  70000 },
  { id:  8, name: 'الصف الثامن',      emoji: '🔬', capacity: 26, letterCount: 17, ratePerHour: 100, unlockCost:  80000 },
  { id:  9, name: 'الصف التاسع',      emoji: '⚗️', capacity: 28, letterCount: 20, ratePerHour: 110, unlockCost:  90000 },
  { id: 10, name: 'الأول الثانوي',    emoji: '🎒', capacity: 30, letterCount: 23, ratePerHour: 120, unlockCost: 100000 },
  { id: 11, name: 'الثاني الثانوي',   emoji: '📐', capacity: 32, letterCount: 26, ratePerHour: 130, unlockCost: 110000 },
  { id: 12, name: 'الثالث الثانوي',   emoji: '🎓', capacity: 34, letterCount: 28, ratePerHour: 140, unlockCost: 120000 },
  { id: 13, name: 'الجامعة',          emoji: '🏛', capacity: 36, letterCount: 28, ratePerHour: 280, unlockCost: 240000 },
];

// أحرف كل صف (تتوسع حسب letterCount)
export function getGradeLetters(grade) {
  return ARABIC_LETTERS.slice(0, grade.letterCount);
}

// إنتاج الصف بالساعة (إجمالي): capacity × letterCount × ratePerHour
export function getGradeMaxIncomePerHour(grade) {
  return grade.capacity * grade.letterCount * grade.ratePerHour;
}

// إنتاج تلميذ واحد بالساعة (موزّع على حروف الصف)
export function getStudentIncomePerHour(grade) {
  const letters = getGradeLetters(grade);
  const result = {};
  for (const l of letters) result[l] = grade.ratePerHour;
  return result;
}

// ===== 200 اسم عربي مشهور =====
// بدون ترتيب معيّن — اللاعب يقدر يفتح أي اسم لو عنده الحروف
export const NAMES = [
  // ذكور — أسماء أنبياء وصحابة وكلاسيكية
  'محمد','أحمد','علي','حسن','حسين','عمر','خالد','يوسف','إبراهيم','يعقوب',
  'سليمان','داود','موسى','عيسى','آدم','نوح','زكريا','إسحاق','يحيى','إدريس',
  'يونس','عثمان','عمار','بلال','حمزة','جعفر','معاذ','أنس','أسامة','زيد',
  // ذكور — أسماء حديثة شائعة
  'طارق','ياسر','سامي','ماجد','حمد','سلمان','نواف','باسم','باسل','فادي',
  'رامي','نائل','حسام','أيمن','شريف','طلال','نضال','وسيم','كريم','مازن',
  'مالك','ناصر','وليد','فيصل','عماد','إياد','رياض','فؤاد','رضوان','نزار',
  'غسان','عدنان','شادي','رائد','أكرم','أيهم','بسام','مهند','خليل','رفيق',
  'زهير','سامر','شاكر','عاصم','عاطف','فارس','فاروق','فايز','فتحي','قاسم',
  'قيس','كمال','لؤي','مجدي','محسن','محمود','مروان','مصطفى','منصور','منير',
  'نادر','نبيل','نديم','نعمان','نعيم','هادي','هاشم','هاني','هشام','هيثم',
  'وائل','يزيد','يسري','أمين','شفيق','زياد','فهد','سعد','سعيد','بشار',
  'ضرار','تامر','جمال','حسني','ربيع','رضا','أيوب','شامل','طلعت','ظافر',
  'عابد','صلاح','رشيد','جلال','صدام','نواف','بدر','بندر','عقيل','مهدي',
  'صابر','صالح','صادق','صفوان','جهاد','عوض','شاهر','بشير','نذير','مختار',
  'فضل','رفعت','بركات','شعبان','عرفات','نمر','يحيى','حافظ','واصل','عابر',
  // إناث
  'فاطمة','عائشة','خديجة','زينب','مريم','آمنة','صفية','رقية','أسماء','حفصة',
  'سكينة','ليلى','نور','هدى','سلمى','سها','رهف','لميس','شمس','قمر',
  'نجمة','وردة','ياسمين','ندى','رنا','روان','ربا','رزان','ريم','لينا',
  'رغد','تسنيم','شهد','رنيم','عبير','نسرين','سمر','سهام','حلا','نجلاء',
  'أمل','إيمان','أحلام','نهى','حنان','نعمة','وفاء','صباح','نوال','رؤى',
  'دانة','هيا','جوري','جنى','رتاج','لجين','لمى','منى','هبة','سارة',
  'ميس','نوف','تالا','تيا','عتاب','شذى','جوهرة','وسن','أنغام',
];

// ===== مساعدات للعرض =====
export function getStudentByName(name) {
  return {
    id: name,
    name,
    cost: getStudentCost(name),
    letters: getNameLetters(name),
  };
}
