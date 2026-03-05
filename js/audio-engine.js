// ============================================
// SynthGrid — Audio Engine
// Web Audio API: oscillators, envelopes, effects, mixing
// ============================================

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.analyser = null;
    this.effects = {};
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Master chain: effects -> analyser -> master gain -> destination
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.75;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;

    // Build effects chain
    this._buildEffects();

    // Connect: effectsOutput -> analyser -> masterGain -> destination
    this.effects.output.connect(this.analyser);
    this.analyser.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    this.initialized = true;
  }

  _buildEffects() {
    const ctx = this.ctx;

    // Filter
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 20000;
    filter.Q.value = 1;

    // Delay
    const delayNode = ctx.createDelay(2.0);
    delayNode.delayTime.value = 0.3;
    const delayFeedback = ctx.createGain();
    delayFeedback.gain.value = 0.3;
    const delayDry = ctx.createGain();
    delayDry.gain.value = 1.0;
    const delayWet = ctx.createGain();
    delayWet.gain.value = 0.0;
    const delayMerge = ctx.createGain();

    // Delay routing: input -> dry -> merge, input -> delay -> wet -> merge, delay -> feedback -> delay
    delayNode.connect(delayFeedback);
    delayFeedback.connect(delayNode);
    delayNode.connect(delayWet);
    delayWet.connect(delayMerge);
    delayDry.connect(delayMerge);

    // Reverb (convolution with generated impulse)
    const convolver = ctx.createConvolver();
    convolver.buffer = this._generateImpulseResponse(2.0, 2.0);
    const reverbDry = ctx.createGain();
    reverbDry.gain.value = 1.0;
    const reverbWet = ctx.createGain();
    reverbWet.gain.value = 0.0;
    const reverbMerge = ctx.createGain();

    convolver.connect(reverbWet);
    reverbWet.connect(reverbMerge);
    reverbDry.connect(reverbMerge);

    // Distortion
    const distortion = ctx.createWaveShaper();
    distortion.curve = this._makeDistortionCurve(0);
    distortion.oversample = '4x';
    const distDry = ctx.createGain();
    distDry.gain.value = 1.0;
    const distWet = ctx.createGain();
    distWet.gain.value = 0.0;
    const distMerge = ctx.createGain();

    distortion.connect(distWet);
    distWet.connect(distMerge);
    distDry.connect(distMerge);

    // Output gain
    const output = ctx.createGain();

    // Chain: input -> filter -> delay(dry/wet) -> reverb(dry/wet) -> distortion(dry/wet) -> output
    // Input node that everything connects to
    const input = ctx.createGain();

    input.connect(filter);

    filter.connect(delayDry);
    filter.connect(delayNode);

    delayMerge.connect(reverbDry);
    delayMerge.connect(convolver);

    reverbMerge.connect(distDry);
    reverbMerge.connect(distortion);

    distMerge.connect(output);

    this.effects = {
      input,
      filter,
      delay: { node: delayNode, feedback: delayFeedback, dry: delayDry, wet: delayWet },
      reverb: { convolver, dry: reverbDry, wet: reverbWet },
      distortion: { node: distortion, dry: distDry, wet: distWet },
      output
    };
  }

  _generateImpulseResponse(duration, decay) {
    const ctx = this.ctx;
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * duration;
    const buffer = ctx.createBuffer(2, length, sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buffer;
  }

  _makeDistortionCurve(amount) {
    const k = amount;
    const samples = 44100;
    const curve = new Float32Array(samples);
    const deg = Math.PI / 180;

    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = k === 0
        ? x
        : ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  // Set master volume (0-1)
  setMasterVolume(value) {
    if (!this.initialized) return;
    this.masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
  }

  // Set filter parameters
  setFilter(type, frequency, q) {
    if (!this.initialized) return;
    this.effects.filter.type = type;
    this.effects.filter.frequency.setTargetAtTime(frequency, this.ctx.currentTime, 0.01);
    this.effects.filter.Q.setTargetAtTime(q, this.ctx.currentTime, 0.01);
  }

  // Set delay parameters
  setDelay(time, feedback, mix) {
    if (!this.initialized) return;
    this.effects.delay.node.delayTime.setTargetAtTime(time, this.ctx.currentTime, 0.01);
    this.effects.delay.feedback.gain.setTargetAtTime(feedback, this.ctx.currentTime, 0.01);
    this.effects.delay.wet.gain.setTargetAtTime(mix, this.ctx.currentTime, 0.01);
    this.effects.delay.dry.gain.setTargetAtTime(1 - mix * 0.5, this.ctx.currentTime, 0.01);
  }

  // Set reverb parameters
  setReverb(size, mix) {
    if (!this.initialized) return;
    // Regenerate impulse for size changes — catch errors from setting buffer during playback
    try {
      this.effects.reverb.convolver.buffer = this._generateImpulseResponse(size, 2.0);
    } catch (e) {
      // Buffer swap can fail if audio is actively routing through the convolver
    }
    this.effects.reverb.wet.gain.setTargetAtTime(mix, this.ctx.currentTime, 0.01);
    this.effects.reverb.dry.gain.setTargetAtTime(1 - mix * 0.5, this.ctx.currentTime, 0.01);
  }

  // Set distortion parameters
  setDistortion(amount, mix) {
    if (!this.initialized) return;
    this.effects.distortion.node.curve = this._makeDistortionCurve(amount);
    this.effects.distortion.wet.gain.setTargetAtTime(mix, this.ctx.currentTime, 0.01);
    this.effects.distortion.dry.gain.setTargetAtTime(1 - mix * 0.5, this.ctx.currentTime, 0.01);
  }

  // Play a note with given parameters
  // Returns a handle that can be used to stop the note
  playNote(frequency, waveType = 'sine', volume = 0.5, attack = 0.01, decay = 0.1, sustain = 0.3, release = 0.2, duration = null) {
    if (!this.initialized) this.init();
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Oscillator
    const osc = ctx.createOscillator();
    osc.type = waveType;
    osc.frequency.setValueAtTime(frequency, now);

    // Gain envelope — use setValueAtTime at full volume then ramp down
    // (same proven pattern as drum synthesis; avoids linearRamp-from-zero browser bugs)
    const env = ctx.createGain();

    if (duration !== null) {
      env.gain.setValueAtTime(volume, now);
      env.gain.exponentialRampToValueAtTime(Math.max(0.001, volume * sustain), now + duration * 0.7);
      env.gain.exponentialRampToValueAtTime(0.001, now + duration + release);
    } else {
      env.gain.setValueAtTime(volume, now);
    }

    osc.connect(env);
    env.connect(this.effects.input);
    osc.start(now);

    if (duration !== null) {
      osc.stop(now + duration + release + 0.05);
    }

    return { osc, env, startTime: now, volume, release };
  }

  // Stop a playing note (for keyboard hold-and-release)
  stopNote(handle) {
    if (!handle || !this.initialized) return;
    const now = this.ctx.currentTime;
    handle.env.gain.cancelScheduledValues(now);
    handle.env.gain.setValueAtTime(handle.env.gain.value, now);
    handle.env.gain.linearRampToValueAtTime(0, now + handle.release);
    handle.osc.stop(now + handle.release + 0.05);
  }

  // Play a drum/percussion sound
  playDrum(type, volume = 0.5) {
    if (!this.initialized) this.init();
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const ctx = this.ctx;
    const now = ctx.currentTime;

    switch (type) {
      case 'kick':
        this._playKick(now, volume);
        break;
      case 'snare':
        this._playSnare(now, volume);
        break;
      case 'hihat':
        this._playHihat(now, volume);
        break;
      case 'clap':
        this._playClap(now, volume);
        break;
      case 'tom':
        this._playTom(now, volume);
        break;
      default:
        this._playKick(now, volume);
    }
  }

  _playKick(time, vol) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.12);

    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);

    osc.connect(gain);
    gain.connect(this.effects.input);
    osc.start(time);
    osc.stop(time + 0.45);
  }

  _playSnare(time, vol) {
    const ctx = this.ctx;

    // Noise burst
    const bufferSize = ctx.sampleRate * 0.15;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 1000;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(vol * 0.8, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.effects.input);
    noise.start(time);
    noise.stop(time + 0.2);

    // Body tone
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, time);
    osc.frequency.exponentialRampToValueAtTime(80, time + 0.05);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(vol * 0.6, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    osc.connect(oscGain);
    oscGain.connect(this.effects.input);
    osc.start(time);
    osc.stop(time + 0.15);
  }

  _playHihat(time, vol) {
    const ctx = this.ctx;

    const bufferSize = ctx.sampleRate * 0.05;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * 0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.effects.input);
    noise.start(time);
    noise.stop(time + 0.08);
  }

  _playClap(time, vol) {
    const ctx = this.ctx;

    // Multiple short noise bursts for clap texture
    for (let i = 0; i < 3; i++) {
      const offset = i * 0.01;
      const bufferSize = ctx.sampleRate * 0.02;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let j = 0; j < bufferSize; j++) {
        data[j] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 2000;
      filter.Q.value = 2;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol * 0.5, time + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, time + offset + 0.1);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.effects.input);
      noise.start(time + offset);
      noise.stop(time + offset + 0.15);
    }
  }

  _playTom(time, vol) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, time);
    osc.frequency.exponentialRampToValueAtTime(60, time + 0.15);

    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);

    osc.connect(gain);
    gain.connect(this.effects.input);
    osc.start(time);
    osc.stop(time + 0.35);
  }

  // Debug: play a raw test tone bypassing playNote entirely
  testTone() {
    if (!this.initialized) this.init();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(261.6, now); // C4
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(gain);
    gain.connect(this.effects.input);
    osc.start(now);
    osc.stop(now + 0.6);
    console.log('testTone: playing C4 sawtooth at', now);
  }

  // Resume audio context if suspended (browser autoplay policy)
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      return this.ctx.resume();
    }
    return Promise.resolve();
  }

  get currentTime() {
    return this.ctx ? this.ctx.currentTime : 0;
  }
}

// Export singleton
window.audioEngine = new AudioEngine();
