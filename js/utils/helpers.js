// js/utils/helpers.js
// 通用辅助函数

(function() {
  'use strict';

  /**
   * 格式化时间为 HH:MM:SS 或 MM:SS
   * @param {number} seconds - 秒数
   * @param {boolean} [showHours=false] - 是否显示小时
   * @returns {string}
   */
  function formatTimeSeconds(seconds, showHours = false) {
    if (!isFinite(seconds) || seconds < 0) return showHours ? '0:00:00' : '0:00';
    
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (showHours || hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  /**
   * 格式化 Date 对象为本地时间字符串
   * @param {Date} date
   * @returns {string}
   */
  function formatTime(date) {
    return date.toLocaleTimeString();
  }

  /**
   * HTML 转义
   * @param {string} text
   * @returns {string}
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 防抖函数
   * @param {Function} func
   * @param {number} wait
   * @returns {Function}
   */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * 节流函数
   * @param {Function} func
   * @param {number} limit
   * @returns {Function}
   */
  function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * RGB 转 HSL
   * @param {number} r - 0-255
   * @param {number} g - 0-255
   * @param {number} b - 0-255
   * @returns {{h: number, s: number, l: number}}
   */
  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    return {
      h: h * 360,
      s: s * 100,
      l: l * 100
    };
  }

  // 导出到全局命名空间
  window.AppHelpers = {
    formatTimeSeconds,
    formatTime,
    escapeHtml,
    debounce,
    throttle,
    rgbToHsl
  };
})();
