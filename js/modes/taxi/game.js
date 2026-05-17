// ===== تاكسي الأحرف 🚕 (Phaser 3) =====
import { awardLetter } from '../../core/rare-letters.js';
import { playCollectSound, playLoseLifeSound, startEngine, stopEngine, playCrashSound, playLetterGatheringTaxiSound } from '../../core/audio.js';
import { recordPlayStart, recordPlayEnd } from '../../core/game-stats.js';

const ARABIC_LETTERS = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';
const ASSETS_PATH = 'assets/taxi/';

// ===== ثوابت اللعبة (نفس النسخة السابقة) =====
const NUM_LANES = 9;
const ROAD_WIDTH_RATIO = 0.86;
const LETTER_SPACING = 240;
const SIDE_LETTER_RATE = 0.005;
const MIN_LETTER_DIST = 90;
const TREE_SPAWN_RATE = 0.010;
const ITEM_SPAWN_RATE = 0.010;
const CAR_MAX_SPEED = 6;
const CAR_ACCEL = 0.22;
const CAR_FRICTION = 0.90;

// ===== تحميل Phaser ديناميكياً عند الحاجة =====
const PHASER_CDN = 'https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js';
let _phaserPromise = null;
function ensurePhaser() {
  if (typeof window.Phaser !== 'undefined') return Promise.resolve();
  if (_phaserPromise) return _phaserPromise;
  _phaserPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PHASER_CDN;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      _phaserPromise = null;
      reject(new Error('Failed to load Phaser'));
    };
    document.head.appendChild(s);
  });
  return _phaserPromise;
}

// ===== Scene يُعرَّف بعد تحميل Phaser =====
let TaxiScene = null;
function defineTaxiScene() {
  if (TaxiScene) return;
  const Phaser = window.Phaser;

  TaxiScene = class extends Phaser.Scene {
    constructor() { super({ key: 'TaxiScene' }); }

    preload() {
      this.load.image('taxi', ASSETS_PATH + 'taxi.png');
      this.load.image('car-1', ASSETS_PATH + 'car-1.png');
      this.load.image('car-2', ASSETS_PATH + 'car-2.png');
      this.load.image('car-3', ASSETS_PATH + 'car-3.png');
      this.load.image('road', ASSETS_PATH + 'road.png');
      this.load.image('sign', ASSETS_PATH + 'sign.png');
      this.load.image('traffic-light', ASSETS_PATH + 'traffic-light.png');
    }

    create() {
      this.host = this.game.registry.get('taxiHost');
      this.W = this.scale.width;
      this.H = this.scale.height;

      // === الخلفية الخضراء ===
      this.ground = this.add.rectangle(0, 0, this.W, this.H, 0x4A8B3F).setOrigin(0);

      // === الطريق (TileSprite يتمدد عمودياً) ===
      const roadW = this._roadWidth();
      const roadX = (this.W - roadW) / 2;
      this.road = this.add.tileSprite(roadX, 0, roadW, this.H, 'road').setOrigin(0, 0);

      // === حواف الطريق ===
      this.roadEdgeLeft = this.add.rectangle(roadX - 3, 0, 3, this.H, 0xFFFFFF).setOrigin(0);
      this.roadEdgeRight = this.add.rectangle(roadX + roadW, 0, 3, this.H, 0xFFFFFF).setOrigin(0);

      // === خطوط الشوارع (graphics — نُحدّثها كل إطار) ===
      this.laneLines = this.add.graphics();

      // === المجموعات ===
      this.lettersGroup = this.physics.add.group();
      this.obstaclesGroup = this.physics.add.group();
      this.decorationsGroup = this.add.group(); // غير فيزيائية
      this.itemsGroup = this.physics.add.group();

      // === السيارة (اللاعب) ===
      this.car = this.physics.add.image(0, 0, 'taxi');
      this.car.body.allowGravity = false;
      this.car.setRotation(-Math.PI / 2); // الواجهة لأعلى
      this._positionAndScaleCar();

      // === تداخل (overlap) — التقاط الأحرف والعناصر، اصطدام السيارات ===
      this.physics.add.overlap(this.car, this.lettersGroup, this._onCollectLetter, null, this);
      this.physics.add.overlap(this.car, this.obstaclesGroup, this._onHitObstacle, null, this);
      this.physics.add.overlap(this.car, this.itemsGroup, this._onCollectItem, null, this);

      // === الإدخال ===
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);

      // اللمس (سحب)
      this._lastTouchX = null;
      this.input.on('pointerdown', (p) => {
        if (!this.host.running || this.host.paused) return;
        this._lastTouchX = p.x;
      });
      this.input.on('pointermove', (p) => {
        if (!this.host.running || this.host.paused) return;
        if (!p.isDown || this._lastTouchX === null) return;
        const dx = p.x - this._lastTouchX;
        this._lastTouchX = p.x;
        this.car.x += dx;
      });
      this.input.on('pointerup', () => { this._lastTouchX = null; });

      // === مراقبة تغيّر الحجم ===
      this.scale.on('resize', this._onResize, this);

      // === تهيئة المتغيرات ===
      this._resetState();

      // أبلغ الـ host إن الـ scene جاهز
      this.host._onSceneReady(this);
    }

    update(time, delta) {
      if (!this.host.running || this.host.paused) return;
      // نوحّد السرعة بناءً على 60fps
      const dt = delta / 16.67;

      this.scrollY += this.host.speed * dt;
      this.distSinceLastLetter += this.host.speed * dt;

      // تحريك صورة الطريق + التحديث البصري
      this.road.tilePositionY -= this.host.speed * dt;

      // ===== حركة السيارة =====
      let left = false, right = false;
      if (this.cursors.left.isDown || this.keyA.isDown) left = true;
      if (this.cursors.right.isDown || this.keyD.isDown) right = true;

      if (left)  this.host.carVX -= CAR_ACCEL * 6 * dt;
      if (right) this.host.carVX += CAR_ACCEL * 6 * dt;
      if (!left && !right) {
        this.host.carVX *= Math.pow(CAR_FRICTION, dt);
        if (Math.abs(this.host.carVX) < 0.05) this.host.carVX = 0;
      }
      if (this.host.carVX >  CAR_MAX_SPEED) this.host.carVX =  CAR_MAX_SPEED;
      if (this.host.carVX < -CAR_MAX_SPEED) this.host.carVX = -CAR_MAX_SPEED;
      this.car.x += this.host.carVX * dt;

      // حدود الطريق
      const lw = this._laneWidth();
      const roadW = lw * NUM_LANES;
      const roadLeft = (this.W - roadW) / 2;
      const halfCar = this.car.displayWidth / 2;
      if (this.car.x < roadLeft + halfCar) { this.car.x = roadLeft + halfCar; this.host.carVX = 0; }
      if (this.car.x > roadLeft + roadW - halfCar) { this.car.x = roadLeft + roadW - halfCar; this.host.carVX = 0; }

      // ===== ظهور =====
      if (this.distSinceLastLetter >= LETTER_SPACING) {
        this._spawnLetter();
        this.distSinceLastLetter = 0;
      }
      if (Math.random() < SIDE_LETTER_RATE * dt) this._spawnLetter();
      if (Math.random() < TREE_SPAWN_RATE * dt) this._spawnTreeOrCar();
      if (Math.random() < ITEM_SPAWN_RATE * dt) this._spawnItem();

      // ===== تحريك العناصر للأسفل (يدوي لأننا نحتاج تحكم دقيق) =====
      const moveY = this.host.speed * dt;
      this.lettersGroup.children.iterate(o => { if (o) o.y += moveY; });
      this.obstaclesGroup.children.iterate(o => { if (o) o.y += moveY; });
      this.decorationsGroup.children.iterate(o => { if (o) o.y += moveY; });
      this.itemsGroup.children.iterate(o => { if (o) o.y += moveY; });

      // ===== تنظيف العناصر اللي طلعت من الشاشة =====
      const cleanupY = this.H + 80;
      this._cleanupOffscreen(this.lettersGroup, cleanupY);
      this._cleanupOffscreen(this.obstaclesGroup, cleanupY);
      this._cleanupOffscreen(this.decorationsGroup, cleanupY);
      this._cleanupOffscreen(this.itemsGroup, cleanupY);

      // ===== خطوط الشوارع =====
      this._drawLaneLines();

      // ===== سرعة تصاعدية =====
      const baseSpeed = 1.9;
      const speedFromDist = this.scrollY / 4000;
      this.host.speed = Math.min(9.0, baseSpeed + speedFromDist);
    }

    // ===== Helpers =====
    _roadWidth() { return this.W * ROAD_WIDTH_RATIO; }
    _laneWidth() { return this._roadWidth() / NUM_LANES; }
    _laneCenter(i) {
      const lw = this._laneWidth();
      const roadLeft = (this.W - lw * NUM_LANES) / 2;
      return roadLeft + lw * (i + 0.5);
    }
    _objectSize() { return this._laneWidth() * 0.85; }

    _drawLaneLines() {
      this.laneLines.clear();
      this.laneLines.lineStyle(1.5, 0xFFFFFF, 0.35);
      const lw = this._laneWidth();
      const roadLeft = (this.W - lw * NUM_LANES) / 2;
      const dashLen = 22;
      const gapLen = 18;
      const period = dashLen + gapLen;
      const offset = (this.scrollY % period);
      for (let i = 1; i < NUM_LANES; i++) {
        const x = roadLeft + i * lw;
        for (let y = -period + offset; y < this.H; y += period) {
          this.laneLines.beginPath();
          this.laneLines.moveTo(x, y);
          this.laneLines.lineTo(x, y + dashLen);
          this.laneLines.strokePath();
        }
      }
    }

    _positionAndScaleCar() {
      const size = this._objectSize();
      const carDisplayW = Math.max(38, size * 1.25);
      const carDisplayH = carDisplayW * 1.5;
      // الصورة الأصلية أفقية، الواجهة على اليسار. بعد دوران -π/2 يصبح "اليسار = فوق"
      // الـ displayWidth بعد الدوران = الـ height الأصلي... Phaser يحسبها تلقائياً بناءً على setRotation
      // نضبط الـ scale بحيث الحجم الظاهر يطابق المطلوب
      const tex = this.textures.get('taxi').getSourceImage();
      if (tex && tex.width && tex.height) {
        // بعد الدوران: العرض الظاهر = العرض الأصلي * scale، الارتفاع الظاهر = الارتفاع الأصلي * scale
        // نريد displayWidth = carDisplayW (وهذا بعد الدوران = الارتفاع الأصلي)
        const scale = carDisplayW / tex.height;
        this.car.setScale(scale);
      }
      // ضع السيارة في الوسط أفقياً، وقريبة من الأسفل
      const carBottomOffset = Math.max(80, this.H * 0.18);
      this.car.y = this.H - carBottomOffset - carDisplayH / 2;
      if (this.host.firstCarPosition) {
        this.car.x = this._laneCenter(Math.floor(NUM_LANES / 2));
        this.host.firstCarPosition = false;
      }
    }

    _spawnLetter() {
      let lane = -1;
      for (let attempt = 0; attempt < 6; attempt++) {
        const c = Math.floor(Math.random() * NUM_LANES);
        const tooClose = this.lettersGroup.getChildren().some(l =>
          l.getData('lane') === c && Math.abs(l.y - (-50)) < MIN_LETTER_DIST
        );
        if (!tooClose) { lane = c; break; }
      }
      if (lane === -1) return;
      const ch = ARABIC_LETTERS[Math.floor(Math.random() * ARABIC_LETTERS.length)];
      const size = this._objectSize();
      const x = this._laneCenter(lane);

      // كائن مركّب: دائرة + نص
      const container = this.add.container(x, -50);
      const radius = size * 0.5;
      const circle = this.add.circle(0, 0, radius, 0xFFD700);
      circle.setStrokeStyle(2, 0xFFFFFF, 0.6);
      const text = this.add.text(0, 1, ch, {
        fontFamily: 'Cairo, Arial',
        fontSize: Math.round(size * 0.55) + 'px',
        fontStyle: 'bold',
        color: '#1A1A2E',
      }).setOrigin(0.5);
      container.add([circle, text]);
      this.physics.world.enable(container);
      container.body.setSize(size, size);
      container.body.setOffset(-size / 2, -size / 2);
      container.body.allowGravity = false;
      container.setData('lane', lane);
      container.setData('char', ch);
      container.setData('kind', 'letter');
      this.lettersGroup.add(container);
    }

    _spawnTreeOrCar() {
      const lw = this._laneWidth();
      const roadLeft = (this.W - lw * NUM_LANES) / 2;
      const roadRight = roadLeft + lw * NUM_LANES;
      const size = this._objectSize();

      if (Math.random() < 0.75) {
        // ديكور جانبي خارج الطريق — لافتة أو إشارة مرور
        const side = Math.random() < 0.5 ? 'left' : 'right';
        const isSign = Math.random() < 0.55;
        const kind = isSign ? 'sign' : 'traffic-light';
        const offset = isSign ? 25 + Math.random() * 25 : 35 + Math.random() * 25;
        const x = side === 'left'
          ? Math.max(50, roadLeft - offset)
          : Math.min(this.W - 50, roadRight + offset);

        const img = this.add.image(x, -200, kind).setOrigin(0.5, 1);
        const tex = this.textures.get(kind).getSourceImage();
        if (tex && tex.width) {
          const targetW = isSign ? size * 0.7 : size * 0.55;
          img.setDisplaySize(targetW, targetW * (tex.height / tex.width));
        }
        this.decorationsGroup.add(img);
      } else {
        // سيارة منافسة على الطريق
        const variant = Math.floor(Math.random() * 3) + 1;
        const lane = Math.floor(Math.random() * NUM_LANES);
        const x = this._laneCenter(lane);
        const enemy = this.physics.add.image(x, -60, `car-${variant}`);
        enemy.body.allowGravity = false;
        enemy.setRotation(Math.PI / 2); // قادمة من الأعلى نحو اللاعب
        const tex = this.textures.get(`car-${variant}`).getSourceImage();
        if (tex && tex.width) {
          const targetW = size * 0.95;
          const scale = targetW / tex.height; // بعد دوران 90°، الـ height يصبح العرض الظاهر
          enemy.setScale(scale);
        }
        enemy.body.setSize(enemy.displayWidth * 0.55, enemy.displayHeight * 0.55, true);
        enemy.setData('kind', 'enemy-car');
        enemy.setData('lane', lane);
        enemy.setData('hit', false);
        this.obstaclesGroup.add(enemy);
      }
    }

    _spawnItem() {
      const type = Math.random() < 0.5 ? 'post' : 'x2';
      const lane = Math.floor(Math.random() * NUM_LANES);
      const x = this._laneCenter(lane);
      const size = this._objectSize();

      const container = this.add.container(x, -70);
      if (type === 'post') {
        const bg = this.add.rectangle(0, 0, size * 0.8, size * 0.6, 0x2f2f2f);
        const top = this.add.rectangle(0, -size * 0.175, size * 0.8, size * 0.25, 0xffd523);
        const txt = this.add.text(0, -size * 0.18, 'بوست', {
          fontFamily: 'Cairo, Arial', fontSize: Math.round(size * 0.32) + 'px',
          fontStyle: 'bold', color: '#1A1A2E',
        }).setOrigin(0.5);
        container.add([bg, top, txt]);
      } else {
        const circle = this.add.circle(0, 0, size * 0.4, 0xFFD700, 0.95);
        circle.setStrokeStyle(2, 0xe08d00);
        const txt = this.add.text(0, 1, 'x2', {
          fontFamily: 'Cairo, Arial', fontSize: Math.round(size * 0.5) + 'px',
          fontStyle: 'bold', color: '#1A1A2E',
        }).setOrigin(0.5);
        container.add([circle, txt]);
      }
      this.physics.world.enable(container);
      container.body.setSize(size, size);
      container.body.setOffset(-size / 2, -size / 2);
      container.body.allowGravity = false;
      container.setData('kind', 'item');
      container.setData('type', type);
      this.itemsGroup.add(container);
    }

    _onCollectLetter(car, letter) {
      if (letter.getData('collected')) return;
      letter.setData('collected', true);
      const ch = letter.getData('char');
      const r = awardLetter('taxi', ch, this.host.multiplier);
      this.host.score += r.count;
      this.host.lettersThisRun += r.count;
      if (this.host.multiplier > 1) {
        this.host.multiplierUses -= 1;
        if (this.host.multiplierUses <= 0) { this.host.multiplier = 1; this.host.multiplierUses = 0; }
      }
      playCollectSound();
      playLetterGatheringTaxiSound();
      this.host._updateHUD();
      letter.destroy();
    }

    _onHitObstacle(car, obstacle) {
      if (obstacle.getData('hit')) return;
      obstacle.setData('hit', true);
      this.host.lives--;
      playLoseLifeSound();
      playCrashSound();
      try {
        if (navigator.vibrate) navigator.vibrate([60, 30, 80]);
      } catch {}
      this.host.carVX *= -0.5;
      this.host._updateHUD();
      // تأثير وميض على السيارة المنافسة
      this.tweens.add({ targets: obstacle, alpha: 0.4, duration: 100, yoyo: true });
      if (this.host.lives <= 0) {
        this.host._gameOver();
      }
    }

    _onCollectItem(car, item) {
      if (item.getData('collected')) return;
      item.setData('collected', true);
      const type = item.getData('type');
      if (type === 'post') {
        this.host.score += 2;
      } else if (type === 'x2') {
        this.host.multiplier = 2;
        this.host.multiplierUses = 4;
      }
      playCollectSound();
      this.host._updateHUD();
      item.destroy();
    }

    _cleanupOffscreen(group, threshold) {
      const toRemove = [];
      group.children.iterate(o => {
        if (!o) return;
        if (o.y > threshold) toRemove.push(o);
      });
      toRemove.forEach(o => o.destroy());
    }

    _onResize(gameSize) {
      this.W = gameSize.width;
      this.H = gameSize.height;
      const roadW = this._roadWidth();
      const roadX = (this.W - roadW) / 2;
      this.ground.setSize(this.W, this.H);
      this.road.setPosition(roadX, 0);
      this.road.setSize(roadW, this.H);
      this.roadEdgeLeft.setPosition(roadX - 3, 0);
      this.roadEdgeLeft.setSize(3, this.H);
      this.roadEdgeRight.setPosition(roadX + roadW, 0);
      this.roadEdgeRight.setSize(3, this.H);
      this._positionAndScaleCar();
    }

    _resetState() {
      // تنظيف كل الكائنات
      this.lettersGroup.clear(true, true);
      this.obstaclesGroup.clear(true, true);
      this.decorationsGroup.clear(true, true);
      this.itemsGroup.clear(true, true);
      this.scrollY = 0;
      this.distSinceLastLetter = LETTER_SPACING;
      this.host.firstCarPosition = true;
      this._positionAndScaleCar();
    }

    restartGame() {
      this._resetState();
    }
  };
}

// ===== الكلاس المُصدَّر — نفس واجهة النسخة القديمة =====
export class TaxiGame {
  constructor(onExit) {
    this.onExit = onExit;
    this.canvas = document.getElementById('taxi-canvas');
    this.phaserGame = null;
    this.scene = null;

    // حالة اللعبة (يستخدمها الـ Scene)
    this.running = false;
    this.paused = false;
    this.score = 0;
    this.lives = 3;
    this.speed = 1.9;
    this.carVX = 0;
    this.multiplier = 1;
    this.multiplierUses = 0;
    this.lettersThisRun = 0;
    this.firstCarPosition = true;

    this._setupButtons();
  }

  _setupButtons() {
    document.getElementById('taxi-btn-pause').onclick = () => this.pause();
    document.getElementById('taxi-btn-resume').onclick = () => this.resume();
    document.getElementById('taxi-btn-quit-pause').onclick = () => this.quit();
    document.getElementById('taxi-btn-restart').onclick = () => this.restart();
    document.getElementById('taxi-btn-quit-gameover').onclick = () => this.quit();
  }

  async start() {
    try {
      await ensurePhaser();
    } catch (e) {
      console.error('Phaser load failed:', e);
      return;
    }
    defineTaxiScene();
    if (!this.phaserGame) {
      this._createPhaserGame();
    } else {
      // إعادة تشغيل
      this._resetState();
      if (this.scene) this.scene.restartGame();
      this._startLoop();
    }
  }

  _createPhaserGame() {
    const Phaser = window.Phaser;
    const parent = this.canvas.parentElement;
    const w = parent.clientWidth || window.innerWidth;
    const h = parent.clientHeight || (window.innerHeight - 80);

    const config = {
      type: Phaser.AUTO,
      canvas: this.canvas,
      backgroundColor: '#4A8B3F',
      scale: {
        mode: Phaser.Scale.RESIZE,
        parent: parent,
        width: w,
        height: h,
      },
      physics: {
        default: 'arcade',
        arcade: { gravity: { y: 0 }, debug: false },
      },
      scene: [TaxiScene],
      // لا توقف اللعبة لما تتغير الصفحة (نتحكم يدوياً)
      disableContextMenu: true,
      audio: { noAudio: true }, // الصوت عبر نظامنا الخاص
    };
    this.phaserGame = new Phaser.Game(config);
    this.phaserGame.registry.set('taxiHost', this);
  }

  _onSceneReady(scene) {
    this.scene = scene;
    this._startLoop();
  }

  _resetState() {
    this.lives = 3;
    this.score = 0;
    this.speed = 1.9;
    this.carVX = 0;
    this.multiplier = 1;
    this.multiplierUses = 0;
    this.lettersThisRun = 0;
    this.firstCarPosition = true;
  }

  _startLoop() {
    this._resetState();
    this._updateHUD();
    this.running = true;
    this.paused = false;
    document.getElementById('taxi-overlay-pause').hidden = true;
    document.getElementById('taxi-overlay-gameover').hidden = true;
    recordPlayStart('taxi');
    startEngine();
  }

  pause() {
    if (!this.running) return;
    this.paused = true;
    stopEngine();
    document.getElementById('taxi-overlay-pause').hidden = false;
  }

  resume() {
    this.paused = false;
    document.getElementById('taxi-overlay-pause').hidden = true;
    startEngine();
  }

  quit() {
    this.running = false;
    this.paused = false;
    stopEngine();
    document.getElementById('taxi-overlay-pause').hidden = true;
    document.getElementById('taxi-overlay-gameover').hidden = true;
    if (this.onExit) this.onExit();
  }

  restart() {
    document.getElementById('taxi-overlay-gameover').hidden = true;
    if (this.scene) this.scene.restartGame();
    this._startLoop();
  }

  _gameOver() {
    this.running = false;
    stopEngine();
    recordPlayEnd('taxi', {
      score: this.score,
      lettersCollected: this.lettersThisRun || 0,
      won: false,
    });
    document.getElementById('taxi-final-score').textContent = this.score;
    document.getElementById('taxi-overlay-gameover').hidden = false;
  }

  _updateHUD() {
    document.getElementById('taxi-score-value').textContent = this.score;
    const hearts = document.getElementById('taxi-hud-lives').children;
    for (let i = 0; i < 3; i++) {
      hearts[i].style.opacity = i < this.lives ? 1 : 0.2;
    }
    const bonus = document.getElementById('taxi-bonus-status');
    if (bonus) {
      bonus.textContent = this.multiplier > 1 ? `مضاعف x2 (${this.multiplierUses})` : '';
    }
  }
}
