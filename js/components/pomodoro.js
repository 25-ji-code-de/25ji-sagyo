// js/components/pomodoro.js
// 番茄钟计时器组件

(function() {
  'use strict';

  const pomodoroBtn = document.getElementById('pomodoroBtn');
  const pomodoroPanel = document.getElementById('pomodoroPanel');
  const pomodoroCloseBtn = document.getElementById('pomodoroCloseBtn');
  const pomodoroDisplay = document.getElementById('pomodoroDisplay');
  const pomodoroStatus = document.querySelector('.pomodoro-status');
  const startBtn = document.getElementById('pomodoroStartBtn');
  const pauseBtn = document.getElementById('pomodoroPauseBtn');
  const resetBtn = document.getElementById('pomodoroResetBtn');
  const workDurationInput = document.getElementById('workDuration');
  const shortBreakInput = document.getElementById('shortBreak');
  const longBreakInput = document.getElementById('longBreak');
  const pomodoroRound = document.getElementById('pomodoroRound');

  if (!pomodoroBtn || !pomodoroPanel) return;

  let timer = null;
  let remainingSeconds = 25 * 60;
  let isRunning = false;
  let currentMode = 'work'; // 'work', 'short-break', 'long-break'
  let workRounds = 0;
  const maxRounds = 4;

  // SessionStorage keys for Pomodoro
  const POMODORO_STORAGE_KEYS = {
    REMAINING: 'pomodoro_remaining',
    MODE: 'pomodoro_mode',
    ROUNDS: 'pomodoro_rounds',
    IS_RUNNING: 'pomodoro_isRunning'
  };

  /**
   * 保存番茄钟状态到 sessionStorage
   */
  function savePomodoroState() {
    try {
      sessionStorage.setItem(POMODORO_STORAGE_KEYS.REMAINING, remainingSeconds);
      sessionStorage.setItem(POMODORO_STORAGE_KEYS.MODE, currentMode);
      sessionStorage.setItem(POMODORO_STORAGE_KEYS.ROUNDS, workRounds);
      sessionStorage.setItem(POMODORO_STORAGE_KEYS.IS_RUNNING, isRunning);
    } catch (e) {
      console.warn('Failed to save pomodoro state:', e);
    }
  }

  /**
   * 从 sessionStorage 加载番茄钟状态
   */
  function loadPomodoroState() {
    try {
      const savedRemaining = sessionStorage.getItem(POMODORO_STORAGE_KEYS.REMAINING);
      const savedMode = sessionStorage.getItem(POMODORO_STORAGE_KEYS.MODE);
      const savedRounds = sessionStorage.getItem(POMODORO_STORAGE_KEYS.ROUNDS);
      const savedRunning = sessionStorage.getItem(POMODORO_STORAGE_KEYS.IS_RUNNING);

      if (savedRemaining !== null) {
        remainingSeconds = parseInt(savedRemaining);
      }
      if (savedMode !== null) {
        currentMode = savedMode;
      }
      if (savedRounds !== null) {
        workRounds = parseInt(savedRounds);
      }

      updateDisplay();

      // 如果之前在运行，恢复计时器
      if (savedRunning === 'true') {
        startTimer();
      }
    } catch (e) {
      console.warn('Failed to load pomodoro state:', e);
    }
  }

  /**
   * 格式化时间
   */
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  /**
   * 更新显示
   */
  function updateDisplay() {
    if (pomodoroDisplay) {
      pomodoroDisplay.textContent = formatTime(remainingSeconds);
    }
    if (pomodoroRound) {
      pomodoroRound.textContent = `${workRounds} / ${maxRounds}`;
    }

    // 更新状态文本
    if (pomodoroStatus) {
      if (currentMode === 'work') {
        pomodoroStatus.textContent = '工作时间 🎯';
        if (pomodoroDisplay) pomodoroDisplay.style.color = '#ff6b6b';
      } else if (currentMode === 'short-break') {
        pomodoroStatus.textContent = '短休息 ☕';
        if (pomodoroDisplay) pomodoroDisplay.style.color = '#51cf66';
      } else if (currentMode === 'long-break') {
        pomodoroStatus.textContent = '长休息 🌟';
        if (pomodoroDisplay) pomodoroDisplay.style.color = '#339af0';
      }
    }
  }

  /**
   * 启动计时器
   */
  function startTimer() {
    if (isRunning) return;
    isRunning = true;
    if (startBtn) startBtn.disabled = true;
    if (pauseBtn) pauseBtn.disabled = false;
    savePomodoroState();

    // 广播开始番茄钟
    if (currentMode === 'work' && window.LiveStatus && window.BroadcastMessages) {
      const username = window.LiveStatus.getCurrentUsername() || '某位用户';
      const message = window.BroadcastMessages.generate('pomodoro_start', username);
      window.LiveStatus.sendBroadcast(message);
    }

    timer = setInterval(() => {
      remainingSeconds--;
      updateDisplay();
      savePomodoroState();

      if (remainingSeconds <= 0) {
        clearInterval(timer);
        isRunning = false;
        savePomodoroState();
        handleTimerComplete();
      }
    }, 1000);
  }

  /**
   * 暂停计时器
   */
  function pauseTimer() {
    if (!isRunning) return;
    clearInterval(timer);
    isRunning = false;
    if (startBtn) startBtn.disabled = false;
    if (pauseBtn) pauseBtn.disabled = true;
    savePomodoroState();
  }

  /**
   * 重置计时器
   */
  function resetTimer() {
    pauseTimer();
    currentMode = 'work';
    remainingSeconds = parseInt(workDurationInput?.value || 25) * 60;
    workRounds = 0;
    updateDisplay();
    if (startBtn) startBtn.disabled = false;
    if (pauseBtn) pauseBtn.disabled = true;
    savePomodoroState();
  }

  /**
   * 播放番茄钟提示音
   */
  let alarmInterval = null;

  function playAlarmSound() {
    // 停止之前的铃声（如果有）
    stopAlarmSound();

    // 使用 Web Audio API 生成铃声
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContext();

      function playBeep() {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.frequency.value = 880; // A5 音符
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.5);
      }

      // 播放三次短促的铃声
      playBeep();
      setTimeout(playBeep, 200);
      setTimeout(playBeep, 400);

      // 每隔3秒重复播放，直到用户交互
      alarmInterval = setInterval(() => {
        playBeep();
        setTimeout(playBeep, 200);
        setTimeout(playBeep, 400);
      }, 3000);

      // 30秒后自动停止
      setTimeout(stopAlarmSound, 30000);
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  function stopAlarmSound() {
    if (alarmInterval) {
      clearInterval(alarmInterval);
      alarmInterval = null;
    }
  }

  /**
   * 显示番茄钟完成的应用内通知（toast）
   */
  function showPomodoroToast(text, icon) {
    const toast = document.createElement('div');
    toast.className = 'pomodoro-toast';
    toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-text">${text}</span><button class="toast-dismiss">确定</button>`;
    document.body.appendChild(toast);

    // 动态添加样式（如果不存在）
    if (!document.getElementById('pomodoro-toast-style')) {
      const style = document.createElement('style');
      style.id = 'pomodoro-toast-style';
      style.textContent = `
        .pomodoro-toast {
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%) translateY(-100px);
          background: rgba(30, 30, 45, 0.95);
          color: #fff;
          padding: 16px 24px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
          z-index: 2100;
          transition: transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          border: 2px solid rgba(255,107,107,0.5);
          backdrop-filter: blur(10px);
        }
        .pomodoro-toast.show {
          transform: translateX(-50%) translateY(0);
        }
        .pomodoro-toast .toast-icon { font-size: 28px; }
        .pomodoro-toast .toast-text { font-size: 16px; font-weight: 600; }
        .pomodoro-toast .toast-dismiss {
          background: rgba(255,255,255,0.15);
          border: none;
          color: #fff;
          padding: 6px 14px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          margin-left: 8px;
          transition: background 0.2s;
        }
        .pomodoro-toast .toast-dismiss:hover {
          background: rgba(255,255,255,0.25);
        }
      `;
      document.head.appendChild(style);
    }

    // 点击确定按钮时停止铃声并关闭通知
    toast.querySelector('.toast-dismiss').addEventListener('click', () => {
      stopAlarmSound();
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 500);
    });

    // 触发动画
    requestAnimationFrame(() => toast.classList.add('show'));

    // 如果不点击，30秒后自动关闭
    setTimeout(() => {
      if (toast.parentNode) {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
      }
    }, 30000);
  }

  /**
   * 计时器完成处理
   */
  function handleTimerComplete() {
    // 播放铃声提示
    playAlarmSound();

    // 显示应用内 toast 通知
    const title = currentMode === 'work' ? '工作完成!' : '休息结束!';
    const body = currentMode === 'work' ? '该休息一下了 ☕' : '开始下一个番茄钟 🍅';
    const icon = currentMode === 'work' ? '🍅' : '⏰';
    showPomodoroToast(`${title} ${body}`, icon);

    // 同时尝试浏览器通知（作为备用）
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: '🍅' });
      }
    } catch (e) {
      console.warn('Notification error:', e);
    }

    // 切换模式
    if (currentMode === 'work') {
      workRounds++;
      // 追踪成就
      if (window.achievementSystem) {
        window.achievementSystem.incrementPomodoro();
        // 添加专注时间（25分钟或自定义）
        const duration = parseInt(workDurationInput?.value || 25) * 60;
        window.achievementSystem.addFocusTime(duration);
      }

      // 广播完成番茄钟
      if (window.LiveStatus && window.BroadcastMessages) {
        const username = window.LiveStatus.getCurrentUsername() || '某位用户';
        const message = window.BroadcastMessages.generate('pomodoro_complete', username);
        window.LiveStatus.sendBroadcast(message);
      }
      
      if (workRounds >= maxRounds) {
        currentMode = 'long-break';
        remainingSeconds = parseInt(longBreakInput?.value || 15) * 60;
        workRounds = 0;
      } else {
        currentMode = 'short-break';
        remainingSeconds = parseInt(shortBreakInput?.value || 5) * 60;
      }
    } else {
      currentMode = 'work';
      remainingSeconds = parseInt(workDurationInput?.value || 25) * 60;
    }

    updateDisplay();
    if (startBtn) startBtn.disabled = false;
    if (pauseBtn) pauseBtn.disabled = true;
    savePomodoroState();
  }

  /**
   * 切换面板显示
   */
  function togglePanel() {
    if (pomodoroPanel) {
      pomodoroPanel.classList.toggle('hidden');
    }
  }

  // 事件监听器
  if (pomodoroBtn) {
    pomodoroBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePanel();
      // 请求通知权限（如果未授权）
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    });
  }

  if (pomodoroCloseBtn) {
    pomodoroCloseBtn.addEventListener('click', togglePanel);
  }

  if (startBtn) {
    startBtn.addEventListener('click', startTimer);
  }

  if (pauseBtn) {
    pauseBtn.addEventListener('click', pauseTimer);
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', resetTimer);
  }

  // 设置更改时更新计时器时长（仅在未运行时）
  if (workDurationInput) {
    workDurationInput.addEventListener('change', () => {
      if (!isRunning && currentMode === 'work') {
        remainingSeconds = parseInt(workDurationInput.value) * 60;
        updateDisplay();
      }
    });
  }

  if (shortBreakInput) {
    shortBreakInput.addEventListener('change', () => {
      if (!isRunning && currentMode === 'short-break') {
        remainingSeconds = parseInt(shortBreakInput.value) * 60;
        updateDisplay();
      }
    });
  }

  if (longBreakInput) {
    longBreakInput.addEventListener('change', () => {
      if (!isRunning && currentMode === 'long-break') {
        remainingSeconds = parseInt(longBreakInput.value) * 60;
        updateDisplay();
      }
    });
  }

  // 防止面板内点击传播
  if (pomodoroPanel) {
    pomodoroPanel.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  // 初始化显示并加载保存的状态
  updateDisplay();
  loadPomodoroState();

  // 导出到全局命名空间（如果需要外部访问）
  window.PomodoroTimer = {
    start: startTimer,
    pause: pauseTimer,
    reset: resetTimer,
    toggle: togglePanel,
    getState: () => ({
      remainingSeconds,
      isRunning,
      currentMode,
      workRounds
    })
  };
})();
