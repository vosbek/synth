// ============================================
// SynthGrid — Step Sequencer
// Pattern management, timing, playback
// ============================================

class Sequencer {
  constructor(audioEngine) {
    this.engine = audioEngine;
    this.playing = false;
    this.bpm = 120;
    this.swing = 0; // 0-100
    this.currentStep = -1;
    this.numSteps = 16;
    this.timerID = null;
    this.nextStepTime = 0;
    this.scheduleAheadTime = 0.1; // seconds
    this.lookAhead = 25; // ms

    // 5 tracks: kick, snare, hihat, clap, synth
    this.tracks = [
      {
        name: 'Kick',
        type: 'drum',
        drumType: 'kick',
        waveType: 'sine',
        octave: 3,
        volume: 0.8,
        muted: false,
        solo: false,
        pattern: new Array(16).fill(false)
      },
      {
        name: 'Snare',
        type: 'drum',
        drumType: 'snare',
        waveType: 'sine',
        octave: 3,
        volume: 0.7,
        muted: false,
        solo: false,
        pattern: new Array(16).fill(false)
      },
      {
        name: 'Hi-Hat',
        type: 'drum',
        drumType: 'hihat',
        waveType: 'sine',
        octave: 3,
        volume: 0.5,
        muted: false,
        solo: false,
        pattern: new Array(16).fill(false)
      },
      {
        name: 'Clap',
        type: 'drum',
        drumType: 'clap',
        waveType: 'sine',
        octave: 3,
        volume: 0.6,
        muted: false,
        solo: false,
        pattern: new Array(16).fill(false)
      },
      {
        name: 'Synth',
        type: 'synth',
        drumType: 'kick',
        waveType: 'sawtooth',
        octave: 4,
        volume: 0.7,
        muted: false,
        solo: false,
        // Synth pattern: each step stores a note or false
        // Notes are semitone offsets from C of the octave: 0=C, 2=D, 4=E, 5=F, 7=G, 9=A, 11=B
        pattern: new Array(16).fill(false),
        notePattern: new Array(16).fill(0) // semitone offsets
      }
    ];

    this.onStepChange = null; // callback(stepIndex)
  }

  get stepDuration() {
    // 16th notes: 4 steps per beat
    return 60.0 / this.bpm / 4;
  }

  start() {
    if (this.playing) return;
    this.engine.init();
    this.engine.resume();
    this.playing = true;
    this.currentStep = -1;
    this.nextStepTime = this.engine.ctx.currentTime;
    this._schedule();
  }

  stop() {
    this.playing = false;
    if (this.timerID !== null) {
      clearTimeout(this.timerID);
      this.timerID = null;
    }
    this.currentStep = -1;
    if (this.onStepChange) this.onStepChange(-1);
  }

  _schedule() {
    if (!this.playing) return;

    try {
      // Resume audio context if it was suspended (e.g., browser policy)
      if (this.engine.ctx.state === 'suspended') {
        this.engine.ctx.resume();
      }

      while (this.nextStepTime < this.engine.ctx.currentTime + this.scheduleAheadTime) {
        this.currentStep = (this.currentStep + 1) % this.numSteps;

        try {
          this._playStep(this.currentStep, this.nextStepTime);
        } catch (e) {
          console.warn('SynthGrid: error playing step', e);
        }

        // Apply swing: delay odd-numbered 16th notes
        let stepLen = this.stepDuration;
        if (this.currentStep % 2 === 0) {
          const swingAmount = (this.swing / 100) * stepLen * 0.5;
          stepLen -= swingAmount;
        } else {
          const swingAmount = (this.swing / 100) * stepLen * 0.5;
          stepLen += swingAmount;
        }

        this.nextStepTime += stepLen;
      }
    } catch (e) {
      console.warn('SynthGrid: scheduler error', e);
    }

    // Always re-schedule to keep the loop alive
    if (this.playing) {
      this.timerID = setTimeout(() => this._schedule(), this.lookAhead);
    }
  }

  _playStep(step, time) {
    // Notify UI
    if (this.onStepChange) {
      // Use setTimeout for visual sync (approximate)
      const delay = Math.max(0, (time - this.engine.ctx.currentTime) * 1000);
      setTimeout(() => {
        if (this.onStepChange) this.onStepChange(step);
      }, delay);
    }

    // Determine if any track is solo'd
    const hasSolo = this.tracks.some(t => t.solo);

    for (const track of this.tracks) {
      // Skip if muted, or if solo mode is on and this track isn't solo'd
      if (track.muted) continue;
      if (hasSolo && !track.solo) continue;
      if (!track.pattern[step]) continue;

      if (track.type === 'drum') {
        this.engine.playDrum(track.drumType, track.volume);
      } else if (track.type === 'synth') {
        const semitone = track.notePattern ? track.notePattern[step] : 0;
        const baseFreq = 440 * Math.pow(2, (track.octave - 4));
        const cFreq = baseFreq * Math.pow(2, -9 / 12);
        const freq = cFreq * Math.pow(2, semitone / 12);
        // Ensure note is long enough to hear (min 0.15s)
        const noteDuration = Math.max(0.15, this.stepDuration * 0.9);
        this.engine.playNote(freq, track.waveType, track.volume, 0.002, 0.02, 0.8, 0.05, noteDuration);
      }
    }
  }

  toggleStep(trackIndex, stepIndex) {
    this.tracks[trackIndex].pattern[stepIndex] = !this.tracks[trackIndex].pattern[stepIndex];
  }

  setNoteForStep(trackIndex, stepIndex, semitone) {
    if (this.tracks[trackIndex].notePattern) {
      this.tracks[trackIndex].notePattern[stepIndex] = semitone;
    }
  }

  clearAll() {
    for (const track of this.tracks) {
      track.pattern.fill(false);
      if (track.notePattern) track.notePattern.fill(0);
    }
  }

  // Load a preset pattern
  loadPreset(name) {
    this.clearAll();
    const presets = Sequencer.PRESETS[name];
    if (!presets) return;

    for (const [trackIdx, steps] of Object.entries(presets.patterns)) {
      const idx = parseInt(trackIdx);
      if (idx >= this.tracks.length) continue;
      for (const step of steps) {
        if (typeof step === 'number') {
          this.tracks[idx].pattern[step] = true;
        } else if (typeof step === 'object') {
          this.tracks[idx].pattern[step.s] = true;
          if (this.tracks[idx].notePattern && step.n !== undefined) {
            this.tracks[idx].notePattern[step.s] = step.n;
          }
        }
      }
    }

    if (presets.bpm) this.bpm = presets.bpm;
    if (presets.swing !== undefined) this.swing = presets.swing;

    // Apply track settings
    if (presets.tracks) {
      for (const [idx, settings] of Object.entries(presets.tracks)) {
        Object.assign(this.tracks[parseInt(idx)], settings);
      }
    }
  }
}

// Preset patterns
Sequencer.PRESETS = {
  'empty': {
    patterns: {},
    bpm: 120,
    swing: 0
  },
  'four-on-floor': {
    bpm: 128,
    swing: 0,
    patterns: {
      0: [0, 4, 8, 12],           // Kick on every beat
      1: [4, 12],                   // Snare on 2 and 4
      2: [0, 2, 4, 6, 8, 10, 12, 14], // Hi-hat on every 8th
      3: [4, 12],                   // Clap with snare
      4: [                           // Synth bass line
        { s: 0, n: 0 }, { s: 2, n: 0 },
        { s: 4, n: 5 }, { s: 6, n: 5 },
        { s: 8, n: 7 }, { s: 10, n: 7 },
        { s: 12, n: 5 }, { s: 14, n: 3 }
      ]
    },
    tracks: {
      4: { waveType: 'sawtooth', octave: 3 }
    }
  },
  'hip-hop': {
    bpm: 90,
    swing: 55,
    patterns: {
      0: [0, 6, 8, 14],            // Kick
      1: [4, 12],                   // Snare
      2: [0, 2, 4, 6, 8, 10, 12, 14], // Hi-hat
      3: [4],                        // Clap
      4: [
        { s: 0, n: 0 }, { s: 3, n: 3 },
        { s: 4, n: 5 }, { s: 8, n: 0 },
        { s: 11, n: 7 }, { s: 12, n: 5 }
      ]
    },
    tracks: {
      4: { waveType: 'square', octave: 3 }
    }
  },
  'dnb': {
    bpm: 174,
    swing: 0,
    patterns: {
      0: [0, 10],                    // Kick
      1: [4, 12],                    // Snare
      2: [0, 2, 4, 6, 8, 10, 12, 14], // Hi-hat
      3: [],
      4: [
        { s: 0, n: 0 }, { s: 4, n: 0 },
        { s: 6, n: 3 }, { s: 8, n: 5 },
        { s: 12, n: 7 }, { s: 14, n: 5 }
      ]
    },
    tracks: {
      4: { waveType: 'sawtooth', octave: 3 }
    }
  },
  'techno': {
    bpm: 135,
    swing: 0,
    patterns: {
      0: [0, 4, 8, 12],            // Four-on-floor kick
      1: [4, 12],                   // Snare
      2: [2, 6, 10, 14],           // Off-beat hi-hat
      3: [4],                       // Clap on 2
      4: [
        { s: 0, n: 0 }, { s: 2, n: 0 },
        { s: 4, n: 0 }, { s: 6, n: 3 },
        { s: 8, n: 5 }, { s: 10, n: 3 },
        { s: 12, n: 0 }, { s: 14, n: 7 }
      ]
    },
    tracks: {
      4: { waveType: 'square', octave: 3 }
    }
  },
  'ambient': {
    bpm: 80,
    swing: 20,
    patterns: {
      0: [0, 8],
      1: [],
      2: [0, 4, 8, 12],
      3: [],
      4: [
        { s: 0, n: 0 }, { s: 4, n: 4 },
        { s: 8, n: 7 }, { s: 12, n: 11 }
      ]
    },
    tracks: {
      4: { waveType: 'sine', octave: 5, volume: 0.3 }
    }
  }
};

window.Sequencer = Sequencer;
