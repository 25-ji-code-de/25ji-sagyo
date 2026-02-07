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
        pomodoroStatus.textContent = window.I18n?.t('pomodoro.status.work') || '工作时间 🎯';
        if (pomodoroDisplay) pomodoroDisplay.style.color = '#ff6b6b';
      } else if (currentMode === 'short-break') {
        pomodoroStatus.textContent = window.I18n?.t('pomodoro.status.short_break') || '短休息 ☕';
        if (pomodoroDisplay) pomodoroDisplay.style.color = '#51cf66';
      } else if (currentMode === 'long-break') {
        pomodoroStatus.textContent = window.I18n?.t('pomodoro.status.long_break') || '长休息 🌟';
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

    updateActiveTaskDisplay();
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

    updateActiveTaskDisplay();
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
  let alarmAudio = null;
  let alarmInterval = null;

  // 铃声文件路径
  const ALARM_SOUNDS = {
    work: 'sounds/Daybreak.mp3',    // 专注结束
    break: 'sounds/Radar.mp3'       // 休息结束
  };

  // 闹铃音量配置
  const ALARM_VOLUME_CONFIG = {
    min: 0.15,           // 最小音量，确保能听到
    max: 0.7,            // 最大音量
    fadeInDuration: 1500, // 渐进增加时间（毫秒）
    fadeInSteps: 15       // 渐进步数
  };

  /**
   * 获取自适应闹铃音量
   * 基于当前视频/CD播放器音量计算合适的闹铃音量
   */
  function getAdaptiveAlarmVolume() {
    let referenceVolume = 0.5; // 默认参考音量

    // 尝试获取视频播放器音量
    const video = document.getElementById('video');
    if (video && !video.muted && video.volume > 0) {
      referenceVolume = video.volume;
    }

    // 尝试获取 CD 播放器音量
    const cdAudio = document.getElementById('cdAudioPlayer');
    if (cdAudio && !cdAudio.muted && cdAudio.volume > 0) {
      // 如果两者都有，取较高的
      referenceVolume = Math.max(referenceVolume, cdAudio.volume);
    }

    // 计算自适应音量：比参考音量略高
    // 音量 = 参考音量 * 1.2，限制在 min-max 范围内
    const adaptiveVolume = Math.min(
      ALARM_VOLUME_CONFIG.max,
      Math.max(ALARM_VOLUME_CONFIG.min, referenceVolume * 1.2)
    );

    return adaptiveVolume;
  }

  let fadeInTimer = null;

  function playAlarmSound(mode) {
    // 停止之前的铃声（如果有）
    stopAlarmSound();

    try {
      // 根据模式选择铃声：work 模式结束播放 Daybreak，休息模式结束播放 Radar
      const soundFile = mode === 'work' ? ALARM_SOUNDS.work : ALARM_SOUNDS.break;
      alarmAudio = new Audio(soundFile);
      
      // 使用自适应音量
      const targetVolume = getAdaptiveAlarmVolume();
      const startVolume = targetVolume * 0.3; // 从目标音量的30%开始
      alarmAudio.volume = startVolume;

      // 播放铃声
      alarmAudio.play().catch(e => console.warn('Audio playback error:', e));

      const stepDuration = ALARM_VOLUME_CONFIG.fadeInDuration / ALARM_VOLUME_CONFIG.fadeInSteps;
      const volumeStep = (targetVolume - startVolume) / ALARM_VOLUME_CONFIG.fadeInSteps;
      let currentStep = 0;

      fadeInTimer = setInterval(() => {
        currentStep++;
        if (alarmAudio && currentStep <= ALARM_VOLUME_CONFIG.fadeInSteps) {
          alarmAudio.volume = Math.min(targetVolume, startVolume + volumeStep * currentStep);
        } else {
          clearInterval(fadeInTimer);
          fadeInTimer = null;
        }
      }, stepDuration);

      // 音频结束后重复播放，直到用户交互
      alarmAudio.addEventListener('ended', function repeatPlay() {
        if (alarmAudio && alarmInterval !== null) {
          alarmAudio.currentTime = 0;
          // 重复播放时直接使用目标音量
          alarmAudio.volume = targetVolume;
          alarmAudio.play().catch(e => console.warn('Audio replay error:', e));
        }
      });

      // 设置重复播放标记
      alarmInterval = true;
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  function stopAlarmSound() {
    if (fadeInTimer) {
      clearInterval(fadeInTimer);
      fadeInTimer = null;
    }
    if (alarmAudio) {
      alarmAudio.pause();
      alarmAudio.currentTime = 0;
      alarmAudio = null;
    }
    alarmInterval = null;
  }

  /**
   * 显示番茄钟完成的应用内通知（toast）
   */
  function showPomodoroToast(text, icon, onConfirm) {
    const toast = document.createElement('div');
    toast.className = 'pomodoro-toast';
    const dismissText = window.I18n?.t('pomodoro.toast.dismiss') || '确定';
    
    // Check if there's an active task to show
    const activeTask = window.TodoList?.getActiveTask?.();
    const taskInfo = activeTask 
      ? `<div class="toast-task-info">📝 已记录到: ${activeTask.text}</div>` 
      : '';
    
    toast.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <div class="toast-content">
        <span class="toast-text">${text}</span>
        ${taskInfo}
      </div>
      <button class="toast-dismiss">${dismissText}</button>
    `;
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
        .pomodoro-toast .toast-content { display: flex; flex-direction: column; gap: 4px; }
        .pomodoro-toast .toast-text { font-size: 16px; font-weight: 600; }
        .pomodoro-toast .toast-task-info { 
          font-size: 12px; 
          color: rgba(255,255,255,0.7); 
          background: rgba(255,107,107,0.2);
          padding: 4px 8px;
          border-radius: 4px;
          max-width: 200px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
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
  }

  /**
   * 计时器完成处理
   */
  function handleTimerComplete() {
    // 播放铃声提示（根据当前模式选择不同铃声）
    playAlarmSound(currentMode);

    // 显示应用内 toast 通知
    const isWork = currentMode === 'work';
    const title = isWork
      ? (window.I18n?.t('pomodoro.notifications.work_complete.title') || '工作完成!')
      : (window.I18n?.t('pomodoro.notifications.break_complete.title') || '休息结束!');
    const body = isWork
      ? (window.I18n?.t('pomodoro.notifications.work_complete.body') || '该休息一下了 ☕')
      : (window.I18n?.t('pomodoro.notifications.break_complete.body') || '开始下一个番茄钟 🍅');
    const icon = isWork ? '🍅' : '⏰';
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
      
      // 触发番茄钟完成事件，通知待办事项组件
      document.dispatchEvent(new CustomEvent('pomodoroComplete', {
        detail: { mode: 'work', rounds: workRounds }
      }));
      
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

  // 监听语言变化事件
  window.addEventListener('languagechange', () => {
    updateDisplay();
  });
  
  // ======= 待办事项联动 =======
  const activeTaskIndicator = document.getElementById('activeTaskIndicator');
  const activeTaskName = document.getElementById('activeTaskName');
  const activeTaskPomoTrack = document.getElementById('activeTaskPomoTrack');
  const clearActiveTaskBtn = document.getElementById('clearActiveTaskBtn');
  const quickIntInternal = document.getElementById('quickIntInternal');
  const quickIntExternal = document.getElementById('quickIntExternal');
  
  /**
   * 渲染番茄追踪可视化 (Tomato Tokens)
   */
  function renderPomoTrack(task) {
    if (!activeTaskPomoTrack) return;
    
    if (!task) {
      activeTaskPomoTrack.innerHTML = '';
      return;
    }
    
    let html = '<div class="pomo-token-container" style="justify-content: flex-start;">';
    
    // Logic: Show max(est, act) tokens. 
    // If act > est, we just show more done tokens.
    // If est > act, we show done tokens then est (outlined) tokens.
    // Minimum 1 to act as placeholder/start.
    const countToShow = Math.max(task.estPomo, task.actPomo, 1);
    
    for (let i = 0; i < countToShow; i++) {
        let classes = 'pomo-token';
        if (i < task.actPomo) {
            classes += ' done'; 
        } else if (i < task.estPomo) {
            classes += ' est';
        }
        
        html += `<div class="${classes}" title="Pomodoro ${i+1}"></div>`;
    }
    
    html += '</div>';
    activeTaskPomoTrack.innerHTML = html;
  }
  
  /**
   * 更新活动任务显示
   */
  function updateActiveTaskDisplay() {
    if (!activeTaskIndicator || !activeTaskName) return;
    
    const task = window.TodoList?.getActiveTask?.();
    
    if (task) {
      activeTaskIndicator.classList.add('has-task');
      activeTaskName.textContent = task.text;
      activeTaskName.classList.remove('empty');
      renderPomoTrack(task);
    } else {
      activeTaskIndicator.classList.remove('has-task');
      activeTaskName.textContent = window.I18n?.t('todo.no_active_task') || '未选择任务';
      activeTaskName.classList.add('empty');
      renderPomoTrack(null);
    }
    
    // Update running state
    if (isRunning && currentMode === 'work') {
      activeTaskIndicator.classList.add('running');
    } else {
      activeTaskIndicator.classList.remove('running');
    }
  }
  
  // 监听待办事项选择变化
  document.addEventListener('todoActiveTaskChanged', () => {
    updateActiveTaskDisplay();
  });
  
  // 监听待办事项数据变化（番茄数更新等）
  document.addEventListener('todoDataChanged', () => {
    updateActiveTaskDisplay();
  });
  
  // 清除活动任务按钮
  if (clearActiveTaskBtn) {
    clearActiveTaskBtn.addEventListener('click', () => {
      if (window.TodoList?.setActiveTask) {
        window.TodoList.setActiveTask(null);
      }
    });
  }
  
  // 快速干扰记录按钮
  if (quickIntInternal) {
    quickIntInternal.addEventListener('click', () => {
      const taskId = window.TodoList?.getActiveTaskId?.();
      if (taskId && window.todoListInstance) {
        window.todoListInstance.addInterruption(taskId, 'internal');
      }
    });
  }
  
  if (quickIntExternal) {
    quickIntExternal.addEventListener('click', () => {
      const taskId = window.TodoList?.getActiveTaskId?.();
      if (taskId && window.todoListInstance) {
        window.todoListInstance.addInterruption(taskId, 'external');
      }
    });
  }
  
  // 初始化时检查活动任务
  setTimeout(updateActiveTaskDisplay, 500);
  
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
