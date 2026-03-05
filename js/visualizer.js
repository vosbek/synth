// ============================================
// SynthGrid — Audio Visualizer
// Real-time waveform + frequency spectrum on canvas
// ============================================

class Visualizer {
  constructor(canvas, audioEngine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.engine = audioEngine;
    this.running = false;
    this.animFrame = null;
    this.mode = 'both'; // 'waveform', 'spectrum', 'both'

    // Colors
    this.waveColor = '#00f0ff';
    this.spectrumColors = ['#00f0ff', '#00ff88', '#ffe600', '#ff6622', '#ff00aa'];
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._resize();
    this._draw();
  }

  stop() {
    this.running = false;
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
    this._drawIdle();
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.width = rect.width;
    this.height = rect.height;
  }

  _draw() {
    if (!this.running) return;
    this.animFrame = requestAnimationFrame(() => this._draw());

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Clear
    ctx.fillStyle = '#12121a';
    ctx.fillRect(0, 0, w, h);

    if (!this.engine.initialized || !this.engine.analyser) {
      this._drawIdle();
      return;
    }

    const analyser = this.engine.analyser;

    if (this.mode === 'both') {
      // Left half: waveform, Right half: spectrum
      this._drawWaveform(analyser, 0, 0, w * 0.5, h);
      this._drawSpectrum(analyser, w * 0.5, 0, w * 0.5, h);

      // Divider
      ctx.strokeStyle = 'rgba(42, 42, 58, 0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w * 0.5, 0);
      ctx.lineTo(w * 0.5, h);
      ctx.stroke();
    } else if (this.mode === 'waveform') {
      this._drawWaveform(analyser, 0, 0, w, h);
    } else {
      this._drawSpectrum(analyser, 0, 0, w, h);
    }

    // Border glow
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  }

  _drawWaveform(analyser, x, y, w, h) {
    const ctx = this.ctx;
    const bufferLength = analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);
    analyser.getFloatTimeDomainData(dataArray);

    // Subtle grid
    ctx.strokeStyle = 'rgba(42, 42, 58, 0.5)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y + h / 2);
    ctx.lineTo(x + w, y + h / 2);
    ctx.stroke();

    // Glow effect
    ctx.save();
    ctx.shadowBlur = 8;
    ctx.shadowColor = this.waveColor;

    // Waveform
    ctx.strokeStyle = this.waveColor;
    ctx.lineWidth = 2;
    ctx.beginPath();

    const sliceWidth = w / bufferLength;
    let px = x;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i];
      const py = y + (h / 2) + (v * h * 0.45);

      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
      px += sliceWidth;
    }

    ctx.stroke();
    ctx.restore();

    // Label
    ctx.fillStyle = 'rgba(136, 136, 170, 0.4)';
    ctx.font = '10px sans-serif';
    ctx.fillText('WAVEFORM', x + 6, y + 14);
  }

  _drawSpectrum(analyser, x, y, w, h) {
    const ctx = this.ctx;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    // Draw bars — use a subset for visual clarity
    const barCount = Math.min(64, bufferLength);
    const barWidth = (w - 8) / barCount;
    const gap = 1;

    for (let i = 0; i < barCount; i++) {
      // Use logarithmic scaling for frequency bins
      const logIndex = Math.floor(Math.pow(bufferLength, i / barCount));
      const value = dataArray[Math.min(logIndex, bufferLength - 1)];
      const barHeight = (value / 255) * (h - 10);

      // Color gradient across spectrum
      const colorIndex = Math.floor((i / barCount) * this.spectrumColors.length);
      const color = this.spectrumColors[Math.min(colorIndex, this.spectrumColors.length - 1)];

      const bx = x + 4 + i * barWidth;
      const by = y + h - 4 - barHeight;

      // Glow
      ctx.save();
      ctx.shadowBlur = 4;
      ctx.shadowColor = color;

      // Bar
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.6 + (value / 255) * 0.4;
      ctx.fillRect(bx, by, barWidth - gap, barHeight);

      // Top cap (brighter)
      ctx.globalAlpha = 1;
      ctx.fillRect(bx, by, barWidth - gap, 2);

      ctx.restore();
    }

    ctx.globalAlpha = 1;

    // Label
    ctx.fillStyle = 'rgba(136, 136, 170, 0.4)';
    ctx.font = '10px sans-serif';
    ctx.fillText('SPECTRUM', x + 6, y + 14);
  }

  _drawIdle() {
    const ctx = this.ctx;
    const w = this.width || this.canvas.clientWidth;
    const h = this.height || this.canvas.clientHeight;

    ctx.fillStyle = '#12121a';
    ctx.fillRect(0, 0, w, h);

    // Subtle center line
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Text
    ctx.fillStyle = 'rgba(136, 136, 170, 0.3)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Press Play to start visualizer', w / 2, h / 2 + 4);
    ctx.textAlign = 'start';
  }
}

window.Visualizer = Visualizer;
