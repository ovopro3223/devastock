// ===== تنقية مدخلات المستخدم =====
// تحمي من: Unicode tricks (RTL override, zero-width, etc.)، أطوال مفرطة، مسافات متعددة

// رموز Unicode الخطرة اللي تخفي محتوى أو تتلاعب باتجاه النص
const DANGEROUS_CHARS = /[​-‏‪-‮⁠-⁤⁪-⁯﻿­]/g;

// أحرف تحكم (control chars) خارج الـ tab والـ newline
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * نظّف نص من المستخدم — يستخدم لكل اسم/bio/تعليق إلخ.
 * - يحذف Unicode trick characters
 * - يحذف control chars
 * - يقصّ المسافات الزائدة
 * - يطبّق حد أقصى للطول
 * - يقصّ من البداية والنهاية
 */
export function sanitizeUserInput(text, maxLen = 200) {
  if (text == null) return '';
  let s = String(text);
  s = s.replace(DANGEROUS_CHARS, '');
  s = s.replace(CONTROL_CHARS, '');
  s = s.replace(/\s+/g, ' '); // وحّد المسافات
  s = s.trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

/**
 * نسخة خاصة للأسماء — أكثر صرامة (لا newlines، طول أقصر)
 */
export function sanitizeName(name, maxLen = 24) {
  if (name == null) return '';
  let s = String(name);
  s = s.replace(DANGEROUS_CHARS, '');
  s = s.replace(CONTROL_CHARS, '');
  s = s.replace(/[\r\n\t]/g, ' ');
  s = s.replace(/\s+/g, ' ');
  s = s.trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

/**
 * تحقق هل النص فاضي بعد التنقية
 */
export function isEmptyAfterSanitize(text) {
  return sanitizeUserInput(text, 9999).length === 0;
}
