// js/utils/storage.js
// localStorage 和 sessionStorage 封装

(function() {
  'use strict';

  const STORAGE_PREFIX = 'sagyo_';

  /**
   * 安全地从 localStorage 获取值
   * @param {string} key
   * @param {*} defaultValue
   * @returns {*}
   */
  function getLocal(key, defaultValue = null) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + key);
      if (raw === null) return defaultValue;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Storage getLocal error:', e);
      return defaultValue;
    }
  }

  /**
   * 安全地设置 localStorage 值
   * @param {string} key
   * @param {*} value
   * @returns {boolean}
   */
  function setLocal(key, value) {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('Storage setLocal error:', e);
      return false;
    }
  }

  /**
   * 从 localStorage 删除值
   * @param {string} key
   */
  function removeLocal(key) {
    try {
      localStorage.removeItem(STORAGE_PREFIX + key);
    } catch (e) {
      console.warn('Storage removeLocal error:', e);
    }
  }

  /**
   * 安全地从 sessionStorage 获取值
   * @param {string} key
   * @param {*} defaultValue
   * @returns {*}
   */
  function getSession(key, defaultValue = null) {
    try {
      const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
      if (raw === null) return defaultValue;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Storage getSession error:', e);
      return defaultValue;
    }
  }

  /**
   * 安全地设置 sessionStorage 值
   * @param {string} key
   * @param {*} value
   * @returns {boolean}
   */
  function setSession(key, value) {
    try {
      sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('Storage setSession error:', e);
      return false;
    }
  }

  /**
   * 从 sessionStorage 删除值
   * @param {string} key
   */
  function removeSession(key) {
    try {
      sessionStorage.removeItem(STORAGE_PREFIX + key);
    } catch (e) {
      console.warn('Storage removeSession error:', e);
    }
  }

  // 兼容旧代码：直接使用原始 key（无前缀）
  const LegacyStorage = {
    get(key, defaultValue = null) {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) return defaultValue;
        // 尝试解析 JSON，如果失败则返回原始字符串
        try {
          return JSON.parse(raw);
        } catch {
          return raw;
        }
      } catch (e) {
        return defaultValue;
      }
    },
    set(key, value) {
      try {
        if (typeof value === 'string') {
          localStorage.setItem(key, value);
        } else {
          localStorage.setItem(key, JSON.stringify(value));
        }
        return true;
      } catch (e) {
        return false;
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {}
    }
  };

  // 导出到全局命名空间
  window.AppStorage = {
    getLocal,
    setLocal,
    removeLocal,
    getSession,
    setSession,
    removeSession,
    Legacy: LegacyStorage
  };
})();
