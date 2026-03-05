// ============================================
// SynthGrid — Main App
// Initialization and glue
// ============================================

(function () {
  'use strict';

  // Wait for DOM
  document.addEventListener('DOMContentLoaded', () => {
    // Create core modules
    const engine = window.audioEngine;
    const sequencer = new window.Sequencer(engine);
    const canvas = document.getElementById('visualizer');
    const visualizer = new window.Visualizer(canvas, engine);
    const ui = new window.UI(sequencer, engine, visualizer);

    // Initialize UI
    ui.init();

    // Handle first user interaction to unlock audio context
    const unlockAudio = () => {
      engine.init();
      engine.resume();
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
    };
    document.addEventListener('click', unlockAudio);
    document.addEventListener('keydown', unlockAudio);
    document.addEventListener('touchstart', unlockAudio);

    // Expose for console debugging
    window.synthGrid = { engine, sequencer, visualizer, ui };

    console.log(
      '%cSynthGrid%c loaded! Press Play or hit Space to start.',
      'color: #00f0ff; font-weight: bold; font-size: 16px;',
      'color: inherit;'
    );
  });
})();
