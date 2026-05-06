// ===== حالة المدرسة: الصفوف، الطلاب، الإنتاج التلقائي =====
import { getState, setState } from './app-state.js';
import { saveLetterToStock, spendLetters, getStock } from './storage.js';
import { GRADES, getStudentCost, getStudentIncomePerHour, NAMES } from './school-data.js';

const STATE_KEY = 'school_v1';

// شكل الحالة:
// {
//   unlockedGrades: [0, 1, 2, ...],            // مصفوفة معرّفات الصفوف المفتوحة
//   students: { [name]: { gradeId } },          // الطلاب المفتوحون وصفهم
//   lastTickAt: timestamp ms,                   // آخر مرة جمعنا الإنتاج
// }

function _load() {
  const def = {
    unlockedGrades: [0],   // الروضة مفتوحة افتراضياً
    students: {},
    lastTickAt: Date.now(),
  };
  const raw = getState(STATE_KEY, def);
  // احتياط: تأكد من البنية
  if (!Array.isArray(raw.unlockedGrades) || raw.unlockedGrades.length === 0) raw.unlockedGrades = [0];
  if (!raw.students || typeof raw.students !== 'object') raw.students = {};
  if (!raw.lastTickAt) raw.lastTickAt = Date.now();
  return raw;
}

function _save(state) {
  setState(STATE_KEY, state);
}

// ===== استعلام =====
export function getSchoolState() {
  return _load();
}

export function isGradeUnlocked(gradeId) {
  return _load().unlockedGrades.includes(gradeId);
}

export function getHighestUnlockedGrade() {
  const state = _load();
  return Math.max(...state.unlockedGrades);
}

// عدد الطلاب في صف معين
export function getStudentsInGrade(gradeId) {
  const state = _load();
  return Object.entries(state.students)
    .filter(([_, s]) => s.gradeId === gradeId)
    .map(([name]) => name);
}

// كل الطلاب المفتوحون
export function getAllStudents() {
  return _load().students;
}

// تحقق هل تم فتح طالب معين
export function isStudentUnlocked(name) {
  return !!_load().students[name];
}

// ===== فتح صف =====
// يرجع { ok, reason? }
export function unlockGrade(gradeId) {
  const grade = GRADES.find(g => g.id === gradeId);
  if (!grade) return { ok: false, reason: 'invalid_grade' };

  const state = _load();
  if (state.unlockedGrades.includes(gradeId)) return { ok: false, reason: 'already_unlocked' };

  // يجب أن يكون الصف السابق مفتوحاً
  if (gradeId > 0 && !state.unlockedGrades.includes(gradeId - 1)) {
    return { ok: false, reason: 'previous_locked' };
  }

  // التكلفة تصرف من المخزن (أي حروف، حسب التوفر — توزيع تنازلي على الأحرف الموجودة)
  const cost = grade.unlockCost;
  const stock = getStock();
  const totalAvailable = Object.values(stock).reduce((s, n) => s + n, 0);
  if (totalAvailable < cost) return { ok: false, reason: 'not_enough_letters', need: cost, have: totalAvailable };

  // اخصم cost حرف من المخزن، أكثرها وفرة أولاً
  let toDeduct = cost;
  const sorted = Object.entries(stock).sort((a, b) => b[1] - a[1]);
  const deduction = {};
  for (const [letter, count] of sorted) {
    if (toDeduct <= 0) break;
    const take = Math.min(toDeduct, count);
    if (take > 0) {
      deduction[letter] = take;
      toDeduct -= take;
    }
  }
  if (toDeduct > 0) return { ok: false, reason: 'not_enough_letters', need: cost, have: totalAvailable };

  spendLetters(deduction);
  state.unlockedGrades.push(gradeId);
  state.unlockedGrades.sort((a, b) => a - b);
  _save(state);
  return { ok: true };
}

// ===== فتح طالب =====
// يضيف الطالب لأول صف فيه مكان فاضي
// يرجع { ok, gradeId?, reason? }
export function unlockStudent(name) {
  if (!NAMES.includes(name)) return { ok: false, reason: 'invalid_name' };
  const state = _load();
  if (state.students[name]) return { ok: false, reason: 'already_unlocked' };

  // تحقق من وجود مكان فاضي في صف مفتوح
  const placement = _findOpenSlot(state);
  if (placement === null) return { ok: false, reason: 'no_capacity' };

  // تحقق من توفر الحروف
  const cost = getStudentCost(name);
  const stock = getStock();
  for (const [letter, count] of Object.entries(cost)) {
    if ((stock[letter] || 0) < count) {
      return { ok: false, reason: 'not_enough_letters', missing: letter, need: count, have: stock[letter] || 0 };
    }
  }

  // اخصم الحروف وأضف الطالب
  spendLetters(cost);
  state.students[name] = { gradeId: placement };
  _save(state);
  return { ok: true, gradeId: placement };
}

// أوّل صف مفتوح فيه مكان فاضي (الأقل أولاً)
function _findOpenSlot(state) {
  const sortedGrades = [...state.unlockedGrades].sort((a, b) => a - b);
  for (const gid of sortedGrades) {
    const grade = GRADES.find(g => g.id === gid);
    if (!grade) continue;
    const count = Object.values(state.students).filter(s => s.gradeId === gid).length;
    if (count < grade.capacity) return gid;
  }
  return null;
}

export function findOpenSlotGrade() {
  return _findOpenSlot(_load());
}

// ===== الإنتاج التلقائي =====
// يحسب الفترة منذ آخر tick، ويضيف للمخزن إنتاج كل الطلاب
// يرجع { lettersAdded: { 'ا': N, ... }, hoursElapsed }
export function tickIncome() {
  const state = _load();
  const now = Date.now();
  const elapsedMs = Math.max(0, now - state.lastTickAt);
  const hours = elapsedMs / (1000 * 60 * 60);

  if (hours < 0.0001) {
    // أقل من ~0.36 ثانية، تجاهل
    return { lettersAdded: {}, hoursElapsed: 0 };
  }

  const lettersAdded = {};
  for (const [name, info] of Object.entries(state.students)) {
    const grade = GRADES.find(g => g.id === info.gradeId);
    if (!grade) continue;
    const studentIncome = getStudentIncomePerHour(grade);  // { letter: rate, ... }
    for (const [letter, ratePerHour] of Object.entries(studentIncome)) {
      const earned = ratePerHour * hours;
      lettersAdded[letter] = (lettersAdded[letter] || 0) + earned;
    }
  }

  // قرّب لأقرب عدد صحيح وأضفه للمخزن
  const granted = {};
  for (const [letter, amount] of Object.entries(lettersAdded)) {
    const whole = Math.floor(amount);
    if (whole > 0) {
      granted[letter] = whole;
      for (let i = 0; i < whole; i++) saveLetterToStock(letter);
    }
  }

  // احفظ آخر tick (حتى لو ما حصل إنتاج كامل، نقدم الزمن جزئياً)
  // عشان الكسور لا تضيع، نحفظ الزمن الذي يعكس الجزء المُحَتَسب فقط
  // الأسهل: نحدّث lastTickAt للوقت الحالي ونتقبل خسارة الكسور
  state.lastTickAt = now;
  _save(state);

  return { lettersAdded: granted, hoursElapsed: hours };
}

// ===== إنتاج المدرسة بالساعة (إجمالي حالي) =====
// مفيد لعرض "الدخل بالساعة" في الواجهة
export function getCurrentHourlyIncome() {
  const state = _load();
  const total = {};
  for (const info of Object.values(state.students)) {
    const grade = GRADES.find(g => g.id === info.gradeId);
    if (!grade) continue;
    const inc = getStudentIncomePerHour(grade);
    for (const [letter, rate] of Object.entries(inc)) {
      total[letter] = (total[letter] || 0) + rate;
    }
  }
  return total;
}

// إجمالي الحروف بالساعة من كل الطلاب (مجموع)
export function getTotalHourlyIncome() {
  const inc = getCurrentHourlyIncome();
  return Object.values(inc).reduce((s, n) => s + n, 0);
}

// عدد الطلاب المفتوحون
export function getStudentCount() {
  return Object.keys(_load().students).length;
}
