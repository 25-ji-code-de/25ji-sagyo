// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2025-2026 The 25-ji-code-de Team

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

  /**
   * 获取翻译后的消息
   */
  function getTranslatedMessage(type) {
    const key = `health_reminder.${type}.message`;
    return window.I18n?.t(key) || DEFAULT_CONFIG[type].message;
  }

  /**
   * 获取翻译后的标题
   */
  function getTranslatedTitle(type) {
    const key = `health_reminder.${type}.title`;
    return window.I18n?.t(key) || (type === 'sedentary' ? '久坐提醒' : '喝水提醒');
  }

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
      getConfig: () => ({
        sedentary: { ...config.sedentary },
        hydration: { ...config.hydration }
      }),
      updateConfig: updateConfig,
      resetTimers: resetTimers
    };
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
    // 深层合并配置
    if (newConfig.sedentary) {
      config.sedentary = { ...config.sedentary, ...newConfig.sedentary };
    }
    if (newConfig.hydration) {
      config.hydration = { ...config.hydration, ...newConfig.hydration };
    }
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
      const message = getTranslatedMessage('sedentary');
      showToast(message, 'sedentary');
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
      const message = getTranslatedMessage('hydration');
      showToast(message, 'hydration');
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

    const icon = type === 'sedentary' ? window.SVG_ICONS.activity : window.SVG_ICONS.droplet;
    const title = getTranslatedTitle(type);

    toast.innerHTML = `
      <div class="toast-icon sekai-icon-lg">${icon}</div>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close sekai-icon">${window.SVG_ICONS.x}</button>
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
  let fadeInTimer = null;

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

  function playAlarmSound() {
    // 停止之前的铃声（如果有）
    stopAlarmSound();

    try {
      const soundFile = 'sounds/Radar.mp3';
      alarmAudio = new Audio(soundFile);
      
      // 使用自适应音量
      const targetVolume = getAdaptiveAlarmVolume();
      const startVolume = targetVolume * 0.3; // 从目标音量的30%开始
      alarmAudio.volume = startVolume;

      // 播放铃声
      alarmAudio.play().catch(e => console.warn('Audio playback error:', e));

      // 渐进式增加音量
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
  }

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
