// js/components/breathing.js
// 呼吸练习组件

(function() {
  'use strict';

  const breathingBtn = document.getElementById('breathingBtn');
  const breathingPanel = document.getElementById('breathingPanel');
  const breathingCloseBtn = document.getElementById('breathingCloseBtn');
  const modeSelectStart = document.getElementById('breathingModeSelect');
  const startBtn = document.getElementById('breathingStartBtn');
  const stopBtn = document.getElementById('breathingStopBtn');
  const instructionText = document.getElementById('breathingInstruction');
  const breathingCircle = document.getElementById('breathingCircle');
  const breathingCircleText = document.getElementById('breathingCircleText');
  const breathingContainer = document.querySelector('.breathing-circle-container');

  if (!breathingBtn) return; // Panel might not exist yet if JS runs before HTML update, but we are designing for final state

  let isRunning = false;
  let currentMode = 'sleep';
  let timeoutId = null;
  let animationFrameId = null; // If needed, but CSS transition is better

  const PATTERNS = {
    'sleep': {
      steps: [
        { type: 'inhale', duration: 4000, textKey: 'breathing.instructions.inhale' },
        { type: 'hold', duration: 7000, textKey: 'breathing.instructions.hold' },
        { type: 'exhale', duration: 8000, textKey: 'breathing.instructions.exhale' }
      ]
    },
    'box': {
      steps: [
        { type: 'inhale', duration: 4000, textKey: 'breathing.instructions.inhale' },
        { type: 'hold', duration: 4000, textKey: 'breathing.instructions.hold' },
        { type: 'exhale', duration: 4000, textKey: 'breathing.instructions.exhale' }
      ]
    },
    'resonance': {
      steps: [
        { type: 'inhale', duration: 6000, textKey: 'breathing.instructions.inhale' },
        { type: 'exhale', duration: 6000, textKey: 'breathing.instructions.exhale' }
      ]
    }
  };

  // Helper to get translated text
  function t(key, defaultText) {
    if (window.I18n && window.I18n.t) {
      return window.I18n.t(key);
    }
    // Fallback simple mapping if i18n not ready
    const Map = {
        'breathing.instructions.inhale': '吸气',
        'breathing.instructions.hold': '屏息',
        'breathing.instructions.exhale': '呼气',
        'breathing.instructions.ready': '点击开始'
    };
    return Map[key] || defaultText;
  }

  function init() {
    // Event Listeners
    breathingBtn.addEventListener('click', togglePanel);
    if (breathingCloseBtn) breathingCloseBtn.addEventListener('click', closePanel);
    
    if (startBtn) startBtn.addEventListener('click', startBreathing);
    if (stopBtn) stopBtn.addEventListener('click', stopBreathing);

    // Mode selection (buttons or select)
    const modeBtns = document.querySelectorAll('.breathing-mode-btn');
    modeBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (isRunning) return;
        // remove active class from all
        modeBtns.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        currentMode = e.currentTarget.dataset.mode;
        updateDescription();
      });
    });
  }

  function togglePanel() {
    breathingPanel.classList.toggle('hidden');
    const isHidden = breathingPanel.classList.contains('hidden');
    breathingBtn.setAttribute('aria-pressed', !isHidden);
    
    if (isHidden) {
      stopBreathing();
    }
  }

  function closePanel() {
    breathingPanel.classList.add('hidden');
    breathingBtn.setAttribute('aria-pressed', 'false');
    stopBreathing();
  }

  function updateDescription() {
    const rhythmEl = document.getElementById('breathingModeRhythm');
    const detailEl = document.getElementById('breathingModeDetail');
    if (!rhythmEl || !detailEl) return;
    
    // Rhythm Description
    const rhythmKeys = {
      'sleep': 'breathing.descriptions.sleep',
      'box': 'breathing.descriptions.box',
      'resonance': 'breathing.descriptions.resonance'
    };
    const keyRhythm = rhythmKeys[currentMode];

    // Detail Description
    const detailKeys = {
      'sleep': 'breathing.details.sleep',
      'box': 'breathing.details.box',
      'resonance': 'breathing.details.resonance'
    };
    const keyDetail = detailKeys[currentMode];

    if (window.I18n) {
        rhythmEl.dataset.i18n = keyRhythm;
        rhythmEl.textContent = window.I18n.t(keyRhythm);

        detailEl.dataset.i18n = keyDetail;
        detailEl.textContent = window.I18n.t(keyDetail);
    }
  }

  function startBreathing() {
    if (isRunning) return;
    isRunning = true;
    
    // UI Updates
    breathingContainer.classList.add('active');
    startBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');
    document.querySelectorAll('.breathing-mode-btn').forEach(b => b.disabled = true);

    runCycle(0);
  }

  function stopBreathing() {
    isRunning = false;
    clearTimeout(timeoutId);
    
    // Reset UI
    breathingContainer.classList.remove('active');
    breathingCircle.className = 'breathing-circle'; // remove inhale/hold/exhale classes
    breathingCircle.style.transitionDuration = '0s'; // reset transition
    
    instructionText.textContent = t('breathing.instructions.ready', '点击开始');
    instructionText.dataset.i18n = 'breathing.instructions.ready';
    
    if (breathingCircleText) {
        breathingCircleText.textContent = '';
    }
    
    startBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    document.querySelectorAll('.breathing-mode-btn').forEach(b => b.disabled = false);
  }

  function runCycle(stepIndex) {
    if (!isRunning) return;

    const pattern = PATTERNS[currentMode];
    const steps = pattern.steps;
    const currentStepIndex = stepIndex % steps.length;
    const step = steps[currentStepIndex];
    
    const text = t(step.textKey);

    // Update Text
    instructionText.textContent = text;
    instructionText.dataset.i18n = step.textKey;
    
    // Update Circle Text
    if (breathingCircleText) {
        breathingCircleText.textContent = text;
    }

    // Update Circle State
    // We update class directly. Since patterns are designed to be continuous, this works.
    // Inhale (scale 1->3.3) -> Hold (scale 3.3->3.3) -> Exhale (scale 3.3->1)
    breathingCircle.style.transitionDuration = `${step.duration}ms, ${step.duration}ms, 0.5s, 1s`;
    breathingCircle.className = `breathing-circle ${step.type}`;

    // Schedule next step
    timeoutId = setTimeout(() => {
      runCycle(stepIndex + 1);
    }, step.duration);
  }

  // Initialize if DOM is ready, or wait
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
