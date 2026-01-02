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
   * 计时器完成处理
   */
  function handleTimerComplete() {
    // 播放通知声音（浏览器通知）
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        const title = currentMode === 'work' ? '工作完成!' : '休息结束!';
        const body = currentMode === 'work' ? '该休息一下了 ☕' : '开始下一个番茄钟 🍅';
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
