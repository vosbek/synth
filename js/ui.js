// ============================================
// SynthGrid — UI Controller
// DOM interactions, keyboard piano, sequencer grid
// ============================================

class UI {
  constructor(sequencer, audioEngine, visualizer) {
    this.seq = sequencer;
    this.engine = audioEngine;
    this.viz = visualizer;
    this.activeKeys = {}; // keyboard key -> note handle
    this.currentOctave = 4;
  }

  init() {
    this._buildSequencerGrid();
    this._buildTrackControls();
    this._buildPiano();
    this._bindTransport();
    this._bindEffects();
    this._bindKeyboard();
    this._bindPresets();
    this._bindResize();

    // Set sequencer step change callback
    this.seq.onStepChange = (step) => this._highlightStep(step);

    // Initial visualizer idle state
    this.viz._resize();
    this.viz._drawIdle();
  }

  // ---- Sequencer Grid ----

  _buildSequencerGrid() {
    const grid = document.getElementById('sequencer-grid');
    grid.innerHTML = '';

    this.seq.tracks.forEach((track, trackIdx) => {
      const row = document.createElement('div');
      row.className = 'seq-track';
      row.dataset.track = trackIdx;

      const label = document.createElement('div');
      label.className = 'seq-track-label';
      label.textContent = track.name;
      row.appendChild(label);

      const steps = document.createElement('div');
      steps.className = 'seq-steps';

      for (let s = 0; s < this.seq.numSteps; s++) {
        const step = document.createElement('div');
        step.className = 'seq-step';
        step.dataset.track = trackIdx;
        step.dataset.step = s;

        if (track.pattern[s]) step.classList.add('active');

        step.addEventListener('mousedown', (e) => {
          e.preventDefault();
          this.seq.toggleStep(trackIdx, s);
          step.classList.toggle('active');
          // If this is the synth track and we just activated, play a preview
          if (track.pattern[s] && track.type === 'synth') {
            this._previewSynthNote(track, s);
          } else if (track.pattern[s] && track.type === 'drum') {
            this.engine.init();
            this.engine.resume();
            this.engine.playDrum(track.drumType, track.volume * 0.5);
          }
        });

        // Right-click on synth track to change note
        if (track.type === 'synth') {
          step.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (!track.pattern[s]) return;
            // Cycle through notes: C, D, E, F, G, A, B
            const notes = [0, 2, 4, 5, 7, 9, 11];
            const noteNames = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
            const current = track.notePattern[s];
            const idx = notes.indexOf(current);
            const next = (idx + 1) % notes.length;
            track.notePattern[s] = notes[next];
            step.title = noteNames[next] + track.octave;
            this._previewSynthNote(track, s);
          });
        }

        steps.appendChild(step);
      }

      row.appendChild(steps);
      grid.appendChild(row);
    });
  }

  _previewSynthNote(track, stepIdx) {
    this.engine.init();
    this.engine.resume();
    const semitone = track.notePattern ? track.notePattern[stepIdx] : 0;
    const baseFreq = 440 * Math.pow(2, (track.octave - 4));
    const cFreq = baseFreq * Math.pow(2, -9 / 12);
    const freq = cFreq * Math.pow(2, semitone / 12);
    this.engine.playNote(freq, track.waveType, track.volume * 0.6, 0.002, 0.02, 0.8, 0.05, 0.2);
  }

  _highlightStep(step) {
    const allSteps = document.querySelectorAll('.seq-step');
    allSteps.forEach(el => el.classList.remove('playing'));

    if (step < 0) return;

    const playing = document.querySelectorAll(`.seq-step[data-step="${step}"]`);
    playing.forEach(el => el.classList.add('playing'));
  }

  _refreshGrid() {
    const allSteps = document.querySelectorAll('.seq-step');
    allSteps.forEach(el => {
      const t = parseInt(el.dataset.track);
      const s = parseInt(el.dataset.step);
      el.classList.toggle('active', this.seq.tracks[t].pattern[s]);
    });
  }

  // ---- Track Controls ----

  _buildTrackControls() {
    const container = document.getElementById('track-controls');
    container.innerHTML = '';

    this.seq.tracks.forEach((track, idx) => {
      const ctrl = document.createElement('div');
      ctrl.className = 'track-ctrl';

      const name = document.createElement('span');
      name.className = 'track-name';
      name.textContent = track.name;
      ctrl.appendChild(name);

      // Volume
      const volLabel = document.createElement('label');
      volLabel.textContent = 'Vol ';
      const volSlider = document.createElement('input');
      volSlider.type = 'range';
      volSlider.min = '0';
      volSlider.max = '100';
      volSlider.value = String(Math.round(track.volume * 100));
      volSlider.addEventListener('input', () => {
        track.volume = parseInt(volSlider.value) / 100;
      });
      volLabel.appendChild(volSlider);
      ctrl.appendChild(volLabel);

      // Wave type (for synth) or drum type
      if (track.type === 'synth') {
        const waveLabel = document.createElement('label');
        waveLabel.textContent = 'Wave ';
        const waveSelect = document.createElement('select');
        waveSelect.id = `track-wave-${idx}`;
        ['sine', 'square', 'sawtooth', 'triangle'].forEach(w => {
          const opt = document.createElement('option');
          opt.value = w;
          opt.textContent = w.charAt(0).toUpperCase() + w.slice(1);
          if (w === track.waveType) opt.selected = true;
          waveSelect.appendChild(opt);
        });
        waveSelect.addEventListener('change', () => {
          track.waveType = waveSelect.value;
        });
        waveLabel.appendChild(waveSelect);
        ctrl.appendChild(waveLabel);

        // Octave
        const octLabel = document.createElement('label');
        octLabel.textContent = 'Oct ';
        const octSelect = document.createElement('select');
        for (let o = 2; o <= 6; o++) {
          const opt = document.createElement('option');
          opt.value = String(o);
          opt.textContent = String(o);
          if (o === track.octave) opt.selected = true;
          octSelect.appendChild(opt);
        }
        octSelect.addEventListener('change', () => {
          track.octave = parseInt(octSelect.value);
        });
        octLabel.appendChild(octSelect);
        ctrl.appendChild(octLabel);
      }

      // Mute button
      const muteBtn = document.createElement('button');
      muteBtn.className = 'mute-btn' + (track.muted ? ' active' : '');
      muteBtn.textContent = 'M';
      muteBtn.title = 'Mute';
      muteBtn.addEventListener('click', () => {
        track.muted = !track.muted;
        muteBtn.classList.toggle('active', track.muted);
      });
      ctrl.appendChild(muteBtn);

      // Solo button
      const soloBtn = document.createElement('button');
      soloBtn.className = 'solo-btn' + (track.solo ? ' active' : '');
      soloBtn.textContent = 'S';
      soloBtn.title = 'Solo';
      soloBtn.addEventListener('click', () => {
        track.solo = !track.solo;
        soloBtn.classList.toggle('active', track.solo);
      });
      ctrl.appendChild(soloBtn);

      container.appendChild(ctrl);
    });
  }

  // ---- Piano Keyboard ----

  _buildPiano() {
    const piano = document.getElementById('piano');
    piano.innerHTML = '';

    // Build 2 octaves of keys: C3 to B4
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const isBlack = [false, true, false, true, false, false, true, false, true, false, true, false];

    const startOctave = this.currentOctave - 1;
    const numOctaves = 2;

    for (let oct = startOctave; oct < startOctave + numOctaves; oct++) {
      for (let n = 0; n < 12; n++) {
        const noteName = noteNames[n] + oct;
        const semitone = (oct - 4) * 12 + n - 9; // relative to A4
        const freq = 440 * Math.pow(2, semitone / 12);

        const key = document.createElement('div');
        key.className = `piano-key ${isBlack[n] ? 'black' : 'white'}`;
        key.dataset.freq = freq;
        key.dataset.note = noteName;

        if (!isBlack[n]) {
          key.textContent = noteName;
        }

        // Mouse events
        key.addEventListener('mousedown', (e) => {
          e.preventDefault();
          this._pianoKeyDown(key, freq);
        });
        key.addEventListener('mouseup', () => this._pianoKeyUp(key));
        key.addEventListener('mouseleave', () => this._pianoKeyUp(key));

        // Touch events
        key.addEventListener('touchstart', (e) => {
          e.preventDefault();
          this._pianoKeyDown(key, freq);
        });
        key.addEventListener('touchend', () => this._pianoKeyUp(key));

        piano.appendChild(key);
      }
    }
  }

  _pianoKeyDown(keyEl, freq) {
    if (keyEl.classList.contains('pressed')) return;
    this.engine.init();
    this.engine.resume();
    keyEl.classList.add('pressed');
    const handle = this.engine.playNote(freq, 'sawtooth', 0.3, 0.01, 0.1, 0.4, 0.3);
    keyEl._noteHandle = handle;
  }

  _pianoKeyUp(keyEl) {
    if (!keyEl.classList.contains('pressed')) return;
    keyEl.classList.remove('pressed');
    if (keyEl._noteHandle) {
      this.engine.stopNote(keyEl._noteHandle);
      keyEl._noteHandle = null;
    }
  }

  // ---- Computer Keyboard -> Piano ----

  _bindKeyboard() {
    // Bottom row: Z X C V B N M -> white keys (C D E F G A B)
    // Top row: Q W E R T Y U I O P -> next octave white keys + some
    // S D -> C# D# (black keys), G H J -> F# G# A# (black keys)
    // 2 3 -> C# D# up, 5 6 7 -> F# G# A# up

    const keyMap = {
      // Lower octave (currentOctave - 1)
      'z': 0, 's': 1, 'x': 2, 'd': 3, 'c': 4,
      'v': 5, 'g': 6, 'b': 7, 'h': 8, 'n': 9, 'j': 10, 'm': 11,
      // Upper octave (currentOctave)
      'q': 12, '2': 13, 'w': 14, '3': 15, 'e': 16,
      'r': 17, '5': 18, 't': 19, '6': 20, 'y': 21, '7': 22, 'u': 23,
      'i': 24
    };

    document.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

      const k = e.key.toLowerCase();

      // Space = play/stop
      if (k === ' ') {
        e.preventDefault();
        if (this.seq.playing) {
          this._doStop();
        } else {
          this._doPlay();
        }
        return;
      }

      if (keyMap[k] === undefined) return;
      e.preventDefault();

      if (this.activeKeys[k]) return; // already playing

      const semitoneOffset = keyMap[k];
      const startOctave = this.currentOctave - 1;
      const semitone = (startOctave - 4) * 12 + semitoneOffset - 9;
      const freq = 440 * Math.pow(2, semitone / 12);

      this.engine.init();
      this.engine.resume();
      const handle = this.engine.playNote(freq, 'sawtooth', 0.3, 0.01, 0.1, 0.4, 0.3);
      this.activeKeys[k] = handle;

      // Highlight corresponding piano key
      const pianoKeys = document.querySelectorAll('.piano-key');
      if (pianoKeys[semitoneOffset]) {
        pianoKeys[semitoneOffset].classList.add('pressed');
      }
    });

    document.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (!this.activeKeys[k]) return;

      this.engine.stopNote(this.activeKeys[k]);
      delete this.activeKeys[k];

      const keyMap2 = {
        'z': 0, 's': 1, 'x': 2, 'd': 3, 'c': 4,
        'v': 5, 'g': 6, 'b': 7, 'h': 8, 'n': 9, 'j': 10, 'm': 11,
        'q': 12, '2': 13, 'w': 14, '3': 15, 'e': 16,
        'r': 17, '5': 18, 't': 19, '6': 20, 'y': 21, '7': 22, 'u': 23,
        'i': 24
      };

      const idx = keyMap2[k];
      if (idx !== undefined) {
        const pianoKeys = document.querySelectorAll('.piano-key');
        if (pianoKeys[idx]) {
          pianoKeys[idx].classList.remove('pressed');
        }
      }
    });
  }

  // ---- Transport ----

  _bindTransport() {
    const btnPlay = document.getElementById('btn-play');
    const btnStop = document.getElementById('btn-stop');
    const bpmSlider = document.getElementById('bpm');
    const bpmDisplay = document.getElementById('bpm-display');
    const swingSlider = document.getElementById('swing');
    const swingDisplay = document.getElementById('swing-display');
    const masterVol = document.getElementById('master-volume');

    btnPlay.addEventListener('click', () => this._doPlay());
    btnStop.addEventListener('click', () => this._doStop());

    bpmSlider.addEventListener('input', () => {
      this.seq.bpm = parseInt(bpmSlider.value);
      bpmDisplay.textContent = bpmSlider.value;
    });

    swingSlider.addEventListener('input', () => {
      this.seq.swing = parseInt(swingSlider.value);
      swingDisplay.textContent = swingSlider.value + '%';
    });

    masterVol.addEventListener('input', () => {
      const val = parseInt(masterVol.value) / 100;
      this.engine.init();
      this.engine.setMasterVolume(val);
    });
  }

  _doPlay() {
    this.engine.init();
    this.seq.start();
    this.viz.start();
    document.getElementById('btn-play').classList.add('active');
  }

  _doStop() {
    this.seq.stop();
    document.getElementById('btn-play').classList.remove('active');
    // Keep visualizer running briefly then stop
    setTimeout(() => {
      if (!this.seq.playing) {
        this.viz.stop();
      }
    }, 300);
  }

  // ---- Effects ----

  _bindEffects() {
    // Filter
    const filterFreq = document.getElementById('fx-filter-freq');
    const filterQ = document.getElementById('fx-filter-q');
    const filterType = document.getElementById('fx-filter-type');

    const updateFilter = () => {
      this.engine.init();
      this.engine.setFilter(
        filterType.value,
        parseFloat(filterFreq.value),
        parseFloat(filterQ.value)
      );
    };
    filterFreq.addEventListener('input', updateFilter);
    filterQ.addEventListener('input', updateFilter);
    filterType.addEventListener('change', updateFilter);

    // Delay
    const delayTime = document.getElementById('fx-delay-time');
    const delayFeedback = document.getElementById('fx-delay-feedback');
    const delayMix = document.getElementById('fx-delay-mix');

    const updateDelay = () => {
      this.engine.init();
      this.engine.setDelay(
        parseFloat(delayTime.value),
        parseFloat(delayFeedback.value),
        parseFloat(delayMix.value)
      );
    };
    delayTime.addEventListener('input', updateDelay);
    delayFeedback.addEventListener('input', updateDelay);
    delayMix.addEventListener('input', updateDelay);

    // Reverb
    const reverbSize = document.getElementById('fx-reverb-size');
    const reverbMix = document.getElementById('fx-reverb-mix');

    const updateReverb = () => {
      this.engine.init();
      this.engine.setReverb(
        parseFloat(reverbSize.value),
        parseFloat(reverbMix.value)
      );
    };
    reverbSize.addEventListener('input', updateReverb);
    reverbMix.addEventListener('input', updateReverb);

    // Distortion
    const distAmount = document.getElementById('fx-distortion-amount');
    const distMix = document.getElementById('fx-distortion-mix');

    const updateDist = () => {
      this.engine.init();
      this.engine.setDistortion(
        parseFloat(distAmount.value),
        parseFloat(distMix.value)
      );
    };
    distAmount.addEventListener('input', updateDist);
    distMix.addEventListener('input', updateDist);
  }

  // ---- Presets ----

  _bindPresets() {
    const presetSelect = document.getElementById('preset-select');
    presetSelect.addEventListener('change', () => {
      this.seq.loadPreset(presetSelect.value);
      this._refreshGrid();
      this._syncTransportUI();
      this._syncTrackControlsUI();
    });
  }

  _syncTransportUI() {
    document.getElementById('bpm').value = this.seq.bpm;
    document.getElementById('bpm-display').textContent = this.seq.bpm;
    document.getElementById('swing').value = this.seq.swing;
    document.getElementById('swing-display').textContent = this.seq.swing + '%';
  }

  _syncTrackControlsUI() {
    // Rebuild track controls to reflect new settings
    this._buildTrackControls();
  }

  // ---- Resize ----

  _bindResize() {
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        this.viz._resize();
        if (!this.seq.playing) {
          this.viz._drawIdle();
        }
      }, 100);
    });
  }
}

window.UI = UI;
