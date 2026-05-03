// ===== معالجة إدخال اللاعب (لمس + ماوس) =====

export class InputHandler {
  constructor(canvas, onTap) {
    this._canvas  = canvas;
    this._onTap   = onTap;
    this._handler = this._handle.bind(this);
    canvas.addEventListener('pointerdown', this._handler);
  }

  _handle(e) {
    e.preventDefault();
    const rect   = this._canvas.getBoundingClientRect();
    // تحويل إحداثيات الشاشة إلى إحداثيات الكانفاس الفعلية
    const scaleX = this._canvas.width  / rect.width;
    const scaleY = this._canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top)  * scaleY;
    this._onTap(x, y);
  }

  destroy() {
    this._canvas.removeEventListener('pointerdown', this._handler);
  }
}
