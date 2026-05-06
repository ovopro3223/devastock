// ===== إعدادات نمط مطر الأحرف =====
// كل الأرقام القابلة للتعديل مركّزة هنا
export const LETTER_RAIN_CONFIG = {

  // الفيزياء — سرعة ثابتة لكل الأحرف بنفس الوقت (تنمو مع الوقت)
  // MIN == MAX يعني ما في تفاوت بين حرف وحرف
  LETTER_FALL_SPEED_MIN: 1.6,
  LETTER_FALL_SPEED_MAX: 1.6,
  // مضاعف السرعة: ينمو مع الوقت
  SPEED_RAMP_PER_SEC: 0.025,   // كل ثانية: +0.025 على المضاعف
  SPEED_MULT_MAX: 4.5,         // حد أقصى أعلى — لعبة أسرع بشكل عام

  // معدلات الظهور
  LETTER_SPAWN_RATE:          22,    // كل 22 frame يُولَّد كائن جديد (أعلى كثافة)
  BOMB_SPAWN_PROBABILITY:     0.15,  // 15% احتمال أن يكون القنبلة
  SNOWFLAKE_SPAWN_PROBABILITY: 0.05, // 5%  احتمال أن تكون ثلجة

  // الأرواح
  INITIAL_LIVES: 3,

  // التجميد
  FREEZE_DURATION_MS: 3000,

  // الأحجام
  ENTITY_SIZE: 52,

  // الألوان
  LETTER_COLOR:    '#FFD700',
  LETTER_GLOW:     'rgba(255,215,0,0.55)',
  BOMB_EMOJI:      '💣',
  SNOWFLAKE_EMOJI: '❄️',
  SNOWFLAKE_GLOW:  'rgba(135,206,235,0.7)',

  // شريط الأحرف الملتقطة
  CAUGHT_STRIP_MAX: 10,

  // الحد الأدنى للمسافة بين كيانين عند الظهور
  SPAWN_SAFE_DIST: 115,
};
