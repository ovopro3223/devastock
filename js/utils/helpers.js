// ===== دوال مساعدة عامة =====

// رقم عشوائي بين min و max
export function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

// عنصر عشوائي من مصفوفة
export function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// اختبار التصادم: دائري للأحرف (فقاعة) ومربع لباقي الكيانات
// منطقة اللمس أكبر من الشكل المرئي عشان اللمس أسهل على الموبايل
export function hitTest(px, py, entity) {
  if (entity.type === 'letter') {
    // 1.0 من الحجم = 52px قطر اللمس (visual ~34) — منطقة لمس مريحة
    const r  = entity.size * 1.0;
    const dx = px - entity.x;
    const dy = py - entity.y;
    return dx * dx + dy * dy <= r * r;
  }
  // باقي الكيانات (قنبلة/ثلجة): مربع أوسع شوي
  const half = entity.size * 0.7;
  return (
    px >= entity.x - half &&
    px <= entity.x + half &&
    py >= entity.y - half &&
    py <= entity.y + half
  );
}
