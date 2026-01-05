// js/components/health-reminder.js
// 久坐/喝水提醒组件

(function () {
  'use strict';

  // 默认配置
  const DEFAULT_CONFIG = {
    sedentary: {
      enabled: true,
      interval: 60, // 分钟
      message: "已经坐了很久了，起来活动一下吧！"
    },
    hydration: {
      enabled: true,
      interval: 45, // 分钟
      message: "记得喝水补充水分哦！"
    }
  };

  // 状态
  let config = { ...DEFAULT_CONFIG };
  let sedentaryTimer = null;
  let hydrationTimer = null;
  let lastSedentaryReminder = Date.now();
  let lastHydrationReminder = Date.now();

  /**
   * 初始化
   */
  function init() {
    loadConfig();
    startTimers();
    createToastContainer();

    // 暴露给全局，以便设置面板调用
    window.healthReminderSystem = {
      getConfig: () => ({ ...config }),
      updateConfig: updateConfig,
      resetTimers: resetTimers
    };

    console.log('Health Reminder System initialized');
  }

  /**
   * 加载配置
   */
  function loadConfig() {
    const savedConfig = localStorage.getItem('health_reminder_config');
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        // 合并配置，确保新字段存在
        config = {
          sedentary: { ...DEFAULT_CONFIG.sedentary, ...parsed.sedentary },
          hydration: { ...DEFAULT_CONFIG.hydration, ...parsed.hydration }
        };
      } catch (e) {
        console.error('Failed to parse health reminder config', e);
      }
    }
  }

  /**
   * 保存配置
   */
  function saveConfig() {
    localStorage.setItem('health_reminder_config', JSON.stringify(config));
  }

  /**
   * 更新配置
   * @param {Object} newConfig 
   */
  function updateConfig(newConfig) {
    config = { ...config, ...newConfig };
    saveConfig();
    resetTimers();
  }

  /**
   * 启动计时器
   */
  function startTimers() {
    stopTimers();

    // 检查间隔（每分钟检查一次）
    sedentaryTimer = setInterval(checkSedentary, 60000);
    hydrationTimer = setInterval(checkHydration, 60000);
  }

  /**
   * 停止计时器
   */
  function stopTimers() {
    if (sedentaryTimer) clearInterval(sedentaryTimer);
    if (hydrationTimer) clearInterval(hydrationTimer);
  }

  /**
   * 重置计时器（例如用户活动后）
   */
  function resetTimers() {
    lastSedentaryReminder = Date.now();
    lastHydrationReminder = Date.now();
  }

  /**
   * 检查久坐提醒
   */
  function checkSedentary() {
    if (!config.sedentary.enabled) return;

    const now = Date.now();
    const elapsed = (now - lastSedentaryReminder) / 1000 / 60; // 分钟

    if (elapsed >= config.sedentary.interval) {
      showToast(config.sedentary.message, 'sedentary');
      lastSedentaryReminder = now;
    }
  }

  /**
   * 检查喝水提醒
   */
  function checkHydration() {
    if (!config.hydration.enabled) return;

    const now = Date.now();
    const elapsed = (now - lastHydrationReminder) / 1000 / 60; // 分钟

    if (elapsed >= config.hydration.interval) {
      showToast(config.hydration.message, 'hydration');
      lastHydrationReminder = now;
    }
  }

  /**
   * 创建 Toast 容器
   */
  function createToastContainer() {
    if (document.getElementById('health-toast-container')) return;

    const container = document.createElement('div');
    container.id = 'health-toast-container';
    document.body.appendChild(container);
  }

  /**
   * 显示 Toast 通知
   * @param {string} message 
   * @param {string} type 'sedentary' | 'hydration'
   */
  function showToast(message, type) {
    const container = document.getElementById('health-toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `health-toast ${type}`;

    const icon = type === 'sedentary' ? '🧘' : '💧';

    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-content">
        <div class="toast-title">${type === 'sedentary' ? '久坐提醒' : '喝水提醒'}</div>
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close">×</button>
    `;

    // 关闭按钮事件
    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.classList.add('hiding');
      stopAlarmSound();
      setTimeout(() => toast.remove(), 300);
    });

    container.appendChild(toast);

    // 播放提示音
    playAlarmSound();

    // 自动消失
    setTimeout(() => {
      if (toast.parentNode) {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
      }
    }, 10000); // 10秒后自动消失
  }

  /**
   * 播放提示音
   */
  let alarmAudio = null;

  function playAlarmSound() {
    // 停止之前的铃声（如果有）
    stopAlarmSound();

    try {
      const soundFile = 'sounds/Radar.mp3';
      alarmAudio = new Audio(soundFile);
      alarmAudio.volume = 0.7;

      // 播放铃声
      alarmAudio.play().catch(e => console.warn('Audio playback error:', e));
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  function stopAlarmSound() {
    if (alarmAudio) {
      alarmAudio.pause();
      alarmAudio.currentTime = 0;
      alarmAudio = null;
    }
  }

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
