// ===== صفحة المدرسة 🎓 =====
import {
  GRADES, NAMES, getStudentCost, getGradeLetters,
  getStudentIncomePerHour, normalizeArabic,
} from '../core/school-data.js';
import {
  getSchoolState, getStudentsInGrade, isGradeUnlocked, isStudentUnlocked,
  unlockGrade, unlockStudent, tickIncome, getTotalHourlyIncome, getStudentCount,
  getHighestUnlockedGrade, findOpenSlotGrade,
} from '../core/school-storage.js';
import { getStock, getTotalLetters } from '../core/storage.js';

let _showPage = null;
let _activeTab = 'grades';
let _activeFilter = 'affordable';
let _searchQuery = '';
let _refreshTimer = null;

const ARABIC_NUMBER_FMT = new Intl.NumberFormat('ar-EG');
const fmt = n => ARABIC_NUMBER_FMT.format(Math.floor(n));

export function initSchool(showPage) {
  _showPage = showPage;

  const cardBtn = document.getElementById('btn-school-menu');
  if (cardBtn) cardBtn.addEventListener('click', () => showPage('school'));

  // تبويبات
  document.querySelectorAll('.school-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeTab = btn.dataset.schoolTab;
      _setActiveTab();
      renderSchool();
    });
  });

  // فلاتر تبويب التجنيد
  document.querySelectorAll('.school-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeFilter = btn.dataset.schoolFilter;
      _setActiveFilter();
      renderSchool();
    });
  });

  // بحث
  const searchInput = document.getElementById('school-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      _searchQuery = searchInput.value.trim();
      renderSchool();
    });
  }

  // زر "جنّد كل المتاح"
  const bulkBtn = document.getElementById('school-bulk-recruit-btn');
  if (bulkBtn) {
    bulkBtn.addEventListener('click', _bulkRecruit);
  }
}

// جنّد كل الأسماء التي تستطيع تكلفتها وفيها مكان فاضي
function _bulkRecruit() {
  let recruited = 0;
  let stopReason = null;
  const names = NAMES.filter(n => !isStudentUnlocked(n));
  const stockSnapshot = () => getStock(); // نقرأ كل دورة لأن المخزن يتغير

  // رتّب من الأقل تكلفة → الأكثر (عشان نضمن أكبر عدد)
  const sortedByCost = names.slice().sort((a, b) => {
    const aCost = Object.values(getStudentCost(a)).reduce((s, n) => s + n, 0);
    const bCost = Object.values(getStudentCost(b)).reduce((s, n) => s + n, 0);
    return aCost - bCost;
  });

  for (const name of sortedByCost) {
    const stock = stockSnapshot();
    if (!_canAfford(name, stock)) continue;
    const result = unlockStudent(name);
    if (result.ok) {
      recruited++;
    } else if (result.reason === 'no_capacity') {
      stopReason = 'no_capacity';
      break;
    }
  }

  if (recruited > 0) {
    _renderRecruit();
    _renderSummary();
    const msg = stopReason === 'no_capacity'
      ? `جنّدت ${recruited} طالب! 🎉 (الصفوف صارت ممتلئة — افتح صفاً جديداً)`
      : `جنّدت ${recruited} طالب! 🎉`;
    alert(msg);
  } else {
    alert('لا يوجد طالب متاح للتجنيد الآن');
  }
}

function _setActiveTab() {
  document.querySelectorAll('.school-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.schoolTab === _activeTab)
  );
  document.querySelectorAll('.school-tab-content').forEach(el =>
    el.hidden = el.dataset.schoolContent !== _activeTab
  );
}

function _setActiveFilter() {
  document.querySelectorAll('.school-filter').forEach(t =>
    t.classList.toggle('active', t.dataset.schoolFilter === _activeFilter)
  );
}

// ===== التهيئة عند فتح صفحة المدرسة =====
export function renderSchool() {
  // أوقف أي timer سابق
  if (_refreshTimer) {
    clearInterval(_refreshTimer);
    _refreshTimer = null;
  }

  // اعمل tick أول شي عشان الإنتاج يتحدّث
  const tick = tickIncome();
  _showOfflineBanner(tick);

  _renderSummary();
  if (_activeTab === 'grades') _renderGrades();
  else _renderRecruit();

  // حدّث كل 10 ثوان (لأن الإنتاج بطيء، ما نحتاج refresh عالي)
  _refreshTimer = setInterval(() => {
    tickIncome();
    _renderSummary();
    if (_activeTab === 'grades') _renderGrades();
  }, 10000);
}

// أوقف الـtimer لما تطلع من الصفحة
export function stopSchoolRefresh() {
  if (_refreshTimer) {
    clearInterval(_refreshTimer);
    _refreshTimer = null;
  }
}

function _showOfflineBanner(tick) {
  const banner = document.getElementById('school-offline-banner');
  const detail = document.getElementById('school-offline-detail');
  if (!banner || !detail) return;

  const total = Object.values(tick.lettersAdded || {}).reduce((s, n) => s + n, 0);
  if (total > 0 && tick.hoursElapsed > 0.05) {
    const hoursTxt = tick.hoursElapsed >= 1
      ? `${Math.floor(tick.hoursElapsed)} ساعة`
      : `${Math.floor(tick.hoursElapsed * 60)} دقيقة`;
    detail.textContent = `جنيت ${fmt(total)} حرف خلال ${hoursTxt}`;
    banner.hidden = false;
    setTimeout(() => { banner.hidden = true; }, 6000);
  } else {
    banner.hidden = true;
  }
}

function _renderSummary() {
  const highestGradeId = getHighestUnlockedGrade();
  const grade = GRADES.find(g => g.id === highestGradeId);
  const studentCount = getStudentCount();
  const hourly = getTotalHourlyIncome();

  const gradeEl = document.getElementById('school-current-grade');
  const countEl = document.getElementById('school-student-count');
  const rateEl  = document.getElementById('school-hourly-rate');
  if (gradeEl) gradeEl.textContent = grade ? `${grade.emoji} ${grade.name}` : '—';
  if (countEl) countEl.textContent = fmt(studentCount);
  if (rateEl)  rateEl.textContent  = fmt(hourly);

  // معاينة الصف القادم
  const nextEl = document.getElementById('school-next-grade');
  if (nextEl) {
    const next = GRADES.find(g => g.id === highestGradeId + 1);
    if (next) {
      const totalAvailable = getTotalLetters();
      const progress = Math.min(100, Math.floor((totalAvailable / next.unlockCost) * 100));
      const incomePerStudent = next.letterCount * next.ratePerHour;
      nextEl.innerHTML = `
        <div class="school-next-grade-header">
          <span class="school-next-grade-icon">⬆️</span>
          <span>الصف القادم: <b>${next.emoji} ${next.name}</b></span>
        </div>
        <div class="school-next-grade-stats">
          <span>${incomePerStudent}/ساعة لكل تلميذ</span>
          <span>•</span>
          <span>${next.capacity} مكان</span>
        </div>
        <div class="school-next-grade-bar">
          <div class="school-next-grade-bar-fill" style="width:${progress}%"></div>
        </div>
        <div class="school-next-grade-cost">${fmt(totalAvailable)} / ${fmt(next.unlockCost)} حرف</div>
      `;
      nextEl.hidden = false;
    } else {
      nextEl.hidden = true;
    }
  }
}

// ===== تبويب الصفوف =====
function _renderGrades() {
  const list = document.getElementById('school-grades-list');
  if (!list) return;

  list.innerHTML = GRADES.map(grade => {
    const unlocked = isGradeUnlocked(grade.id);
    const students = getStudentsInGrade(grade.id);
    const filled = students.length;
    const capacity = grade.capacity;
    const letters = getGradeLetters(grade);
    const incomePerStudent = getStudentIncomePerHour(grade);
    const totalLetterRatePerStudent = Object.values(incomePerStudent).reduce((s, n) => s + n, 0);
    const totalIncome = totalLetterRatePerStudent * filled;

    if (!unlocked) {
      const totalAvailable = getTotalLetters();
      const canUnlock = totalAvailable >= grade.unlockCost;
      const prevUnlocked = grade.id === 0 || isGradeUnlocked(grade.id - 1);
      const blocked = !prevUnlocked;
      return `
        <div class="school-grade-card locked${blocked ? ' blocked' : ''}">
          <div class="school-grade-header">
            <span class="school-grade-emoji">${grade.emoji}</span>
            <span class="school-grade-name">${grade.name}</span>
            <span class="school-grade-tag locked">🔒</span>
          </div>
          <div class="school-grade-stats">
            <div>سعة: ${capacity} طالب</div>
            <div>${grade.letterCount} حرف × ${grade.ratePerHour}/ساعة</div>
          </div>
          ${blocked
            ? `<div class="school-grade-locked-msg">افتح الصف السابق أولاً</div>`
            : `<button class="school-grade-unlock-btn ${canUnlock ? '' : 'disabled'}" data-unlock-grade="${grade.id}" ${canUnlock ? '' : 'disabled'}>
                 افتح الصف بـ ${fmt(grade.unlockCost)} حرف
                 ${canUnlock ? '' : `<small>(عندك ${fmt(totalAvailable)})</small>`}
               </button>`
          }
        </div>
      `;
    }

    // صف مفتوح
    const lettersHtml = letters.map(l => `<span class="school-grade-letter">${l}</span>`).join('');
    const studentsHtml = students.length === 0
      ? `<div class="school-grade-empty">لا طلاب بعد — افتح طالب جديد</div>`
      : students.map(name => `<span class="school-student-chip">${name}</span>`).join('');

    return `
      <div class="school-grade-card unlocked">
        <div class="school-grade-header">
          <span class="school-grade-emoji">${grade.emoji}</span>
          <span class="school-grade-name">${grade.name}</span>
          <span class="school-grade-tag unlocked">${filled}/${capacity}</span>
        </div>
        <div class="school-grade-stats">
          <div>${totalLetterRatePerStudent}/ساعة لكل طالب</div>
          <div>إنتاج الصف: <b>${fmt(totalIncome)}</b>/ساعة</div>
        </div>
        <div class="school-grade-letters">${lettersHtml}</div>
        <div class="school-grade-students">${studentsHtml}</div>
      </div>
    `;
  }).join('');

  // ربط أزرار فتح الصفوف
  list.querySelectorAll('[data-unlock-grade]').forEach(btn => {
    btn.addEventListener('click', () => {
      const gid = parseInt(btn.dataset.unlockGrade, 10);
      const result = unlockGrade(gid);
      if (result.ok) {
        _renderGrades();
        _renderSummary();
      } else if (result.reason === 'not_enough_letters') {
        alert(`بحاجة ${fmt(result.need)} حرف. عندك ${fmt(result.have)}`);
      } else {
        alert('غير قادر على فتح الصف');
      }
    });
  });
}

// ===== تبويب التجنيد =====
function _renderRecruit() {
  const list = document.getElementById('school-recruit-list');
  if (!list) return;

  const stock = getStock();
  const slot = findOpenSlotGrade();

  // ترشيح بالاسم — مع تطبيع الأحرف (حفصة = حفصه = حفصء)
  const q = _searchQuery ? normalizeArabic(_searchQuery) : '';
  let names = NAMES.filter(n =>
    !q || normalizeArabic(n).includes(q)
  );

  // ترشيح حسب الحالة
  if (_activeFilter === 'unlocked') {
    names = names.filter(n => isStudentUnlocked(n));
  } else if (_activeFilter === 'affordable') {
    names = names.filter(n => !isStudentUnlocked(n) && _canAfford(n, stock));
  }

  // ترتيب: المفتوحون آخر، الباقي حسب التكلفة (الأرخص أولاً)
  names.sort((a, b) => {
    const aUnl = isStudentUnlocked(a);
    const bUnl = isStudentUnlocked(b);
    if (aUnl !== bUnl) return aUnl ? 1 : -1;
    const aCost = Object.values(getStudentCost(a)).reduce((s, n) => s + n, 0);
    const bCost = Object.values(getStudentCost(b)).reduce((s, n) => s + n, 0);
    return aCost - bCost;
  });

  if (names.length === 0) {
    list.innerHTML = `
      <div class="school-recruit-empty">
        ${_activeFilter === 'affordable'
          ? '🌱 لا أحد متاح الآن — اجمع حروف من اللعب'
          : 'لا نتائج'}
      </div>
    `;
    return;
  }

  list.innerHTML = names.map(name => {
    const cost = getStudentCost(name);
    const letters = Object.entries(cost);
    const unlocked = isStudentUnlocked(name);
    const affordable = _canAfford(name, stock);
    const slotAvailable = slot !== null;
    const canUnlock = !unlocked && affordable && slotAvailable;

    const costHtml = letters.map(([letter, count]) => {
      const have = stock[letter] || 0;
      const ok = have >= count;
      return `<span class="school-cost-chip ${ok ? 'ok' : 'short'}">
        ${letter} <small>${have}/${count}</small>
      </span>`;
    }).join('');

    let actionHtml;
    if (unlocked) {
      const studentInfo = getSchoolState().students[name];
      const grade = GRADES.find(g => g.id === studentInfo.gradeId);
      actionHtml = `<div class="school-recruit-status unlocked">✅ في ${grade?.emoji} ${grade?.name}</div>`;
    } else if (!slotAvailable) {
      actionHtml = `<button class="school-recruit-btn disabled" disabled>الصفوف ممتلئة</button>`;
    } else if (!affordable) {
      actionHtml = `<button class="school-recruit-btn disabled" disabled>غير كافٍ</button>`;
    } else {
      actionHtml = `<button class="school-recruit-btn" data-recruit="${name}">جنّد</button>`;
    }

    return `
      <div class="school-recruit-card ${unlocked ? 'is-unlocked' : ''}">
        <div class="school-recruit-name">${name}</div>
        <div class="school-cost-list">${costHtml}</div>
        ${actionHtml}
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-recruit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.recruit;
      const result = unlockStudent(name);
      if (result.ok) {
        _renderRecruit();
        _renderSummary();
      } else if (result.reason === 'no_capacity') {
        alert('الصفوف ممتلئة — افتح صفاً جديداً');
      } else if (result.reason === 'not_enough_letters') {
        alert(`بحاجة ${result.need} من حرف ${result.missing}`);
      }
    });
  });
}

function _canAfford(name, stock) {
  const cost = getStudentCost(name);
  for (const [letter, count] of Object.entries(cost)) {
    if ((stock[letter] || 0) < count) return false;
  }
  return true;
}
