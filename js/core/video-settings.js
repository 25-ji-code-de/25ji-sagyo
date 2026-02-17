// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2025-2026 The 25-ji-code-de Team

// js/core/video-settings.js
// 视频播放器设置管理模块

(function() {
  'use strict';

  const SETTINGS_KEY = 'videoPlayerSettings';

  /**
   * 默认设置
   */
  const DEFAULT_SETTINGS = {
    muted: true,
    volume: 1,
    timezoneMode: 'local',
    audioProcessing: false
  };

  /**
   * 保存设置到 localStorage
   * @param {Object} settings - 设置对象
   * @param {boolean} settings.muted - 是否静音
   * @param {number} settings.volume - 音量 (0-1)
   * @param {string} settings.timezoneMode - 时区模式 ('local' | 'tokyo')
   * @param {boolean} settings.audioProcessing - 是否开启音频处理
   */
  function save(settings) {
    try {
      const s = {
        muted: !!settings.muted,
        volume: Number(settings.volume) || 0,
        timezoneMode: settings.timezoneMode || 'local',
        audioProcessing: !!settings.audioProcessing
      };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch (e) {
      console.warn('VideoSettings save error:', e);
    }
  }

  /**
   * 从 localStorage 加载设置
   * @returns {Object|null} 设置对象或 null（如果无保存设置）
   */
  function load() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('VideoSettings load error:', e);
      return null;
    }
  }

  /**
   * 获取设置值，带默认值回退
   * @returns {Object} 合并了默认值的设置对象
   */
  function getWithDefaults() {
    const saved = load();
    return { ...DEFAULT_SETTINGS, ...saved };
  }

  /**
   * 清除保存的设置
   */
  function clear() {
    try {
      localStorage.removeItem(SETTINGS_KEY);
    } catch (e) {
      console.warn('VideoSettings clear error:', e);
    }
  }

  // 导出模块
  window.VideoSettings = {
    save,
    load,
    getWithDefaults,
    clear,
    DEFAULT_SETTINGS
  };
})();
