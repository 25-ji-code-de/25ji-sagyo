// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2025-2026 The 25-ji-code-de Team

// js/core/time-sync.js
// 时间同步与计算模块

(function() {
  'use strict';

  const DAY_SECONDS = 24 * 3600;
  const TOKYO_OFFSET_MS = 9 * 3600 * 1000;

  /**
   * 获取 part 的长度（秒）
   * @param {string} playbackMode - 播放模式 ('mp4-3' | 'mp4-6' | 'hls')
   * @returns {number} part 长度（秒）
   */
  function getPartLengthSeconds(playbackMode) {
    return playbackMode === 'mp4-3' ? 8 * 3600 : 4 * 3600;
  }

  /**
   * 计算当天基准时间（凌晨1点）
   * @param {Date} date - 当前时间
   * @returns {Date} 基准时间
   */
  function getDayBase(date) {
    const base = new Date(date);
    base.setHours(1, 0, 0, 0);
    if (date < base) {
      base.setDate(base.getDate() - 1);
    }
    return base;
  }

  /**
   * 计算当前时间对应的 part 索引和偏移量
   * @param {Date} date - 当前时间
   * @param {number} partLengthSeconds - 每个 part 的长度（秒）
   * @returns {{ partIndex: number, offset: number }} part 索引和偏移量
   */
  function computePartAndOffset(date, partLengthSeconds) {
    const base = getDayBase(date);
    let diffSeconds = Math.floor((date.getTime() - base.getTime()) / 1000);
    diffSeconds = ((diffSeconds % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;

    const partIndex = Math.floor(diffSeconds / partLengthSeconds);
    const offset = diffSeconds % partLengthSeconds;
    return { partIndex, offset };
  }

  /**
   * 计算 HLS 模式下的全天偏移量（秒）
   * @param {Date} date - 当前时间
   * @returns {number} 从凌晨1点开始的秒数
   */
  function computeDayOffset(date) {
    const base = getDayBase(date);
    let diffSeconds = Math.floor((date.getTime() - base.getTime()) / 1000);
    diffSeconds = ((diffSeconds % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
    return diffSeconds;
  }

  /**
   * 将 part 索引转换为 key
   * @param {number} index - part 索引 (0-5)
   * @returns {string} key (p1-p6)
   */
  function partIndexToKey(index) {
    return ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'][index] || 'p1';
  }

  /**
   * 获取本地时间
   * @returns {Date}
   */
  function getLocalTime() {
    return new Date();
  }

  /**
   * 获取东京时间
   * @returns {Date}
   */
  function getTokyoTime() {
    const utcMs = Date.now() + new Date().getTimezoneOffset() * 60000;
    const tokyoMs = utcMs + TOKYO_OFFSET_MS;
    return new Date(tokyoMs);
  }

  /**
   * 根据时区模式获取当前时间
   * @param {string} mode - 时区模式 ('local' | 'tokyo')
   * @returns {Date}
   */
  function getNowByMode(mode) {
    return mode === 'local' ? getLocalTime() : getTokyoTime();
  }

  /**
   * 格式化时间为本地时间字符串
   * @param {Date} date
   * @returns {string}
   */
  function formatTime(date) {
    return date.toLocaleTimeString();
  }

  /**
   * 检测播放位置漂移是否超过阈值
   * @param {number} current - 当前播放位置
   * @param {number} expected - 期望播放位置
   * @param {number} threshold - 阈值（秒），默认30秒
   * @returns {boolean}
   */
  function isDrifted(current, expected, threshold = 30) {
    return Math.abs(current - expected) > threshold;
  }

  // 导出模块
  window.TimeSync = {
    DAY_SECONDS,
    getPartLengthSeconds,
    getDayBase,
    computePartAndOffset,
    computeDayOffset,
    partIndexToKey,
    getLocalTime,
    getTokyoTime,
    getNowByMode,
    formatTime,
    isDrifted
  };
})();
