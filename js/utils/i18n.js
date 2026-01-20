/**
 * i18n - Internationalization utility
 * Minimal i18n system for static web apps
 */

(function() {
  'use strict';

  const I18n = {
    currentLang: 'zh-CN',
    translations: {},
    fallbackLang: 'zh-CN',

    /**
     * Initialize i18n system
     */
    async init() {
      this.currentLang = localStorage.getItem('app_language') || this.detectLanguage();
      await this.loadLanguage(this.currentLang);
      this.applyTranslations();
    },

    /**
     * Detect browser language
     */
    detectLanguage() {
      const browserLang = navigator.language || navigator.userLanguage;
      const supported = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP'];

      // Exact match
      if (supported.includes(browserLang)) return browserLang;

      // Partial match (e.g., 'zh' -> 'zh-CN')
      const langPrefix = browserLang.split('-')[0];
      const match = supported.find(l => l.startsWith(langPrefix));

      return match || this.fallbackLang;
    },

    /**
     * Load language file
     */
    async loadLanguage(lang) {
      try {
        const response = await fetch(`locales/${lang}.json`);
        if (!response.ok) throw new Error(`Failed to load ${lang}`);
        this.translations = await response.json();
      } catch (error) {
        console.warn(`Failed to load language ${lang}, using fallback`, error);
        if (lang !== this.fallbackLang) {
          const fallback = await fetch(`locales/${this.fallbackLang}.json`);
          this.translations = await fallback.json();
        }
      }
    },

    /**
     * Translate a key
     * @param {string} key - Translation key (e.g., 'pomodoro.start')
     * @param {object} params - Parameters for interpolation
     */
    t(key, params = {}) {
      const keys = key.split('.');
      let value = this.translations;

      for (const k of keys) {
        value = value?.[k];
        if (value === undefined) return key;
      }

      return this.interpolate(String(value), params);
    },

    /**
     * Interpolate parameters into string
     */
    interpolate(str, params) {
      return str.replace(/\{(\w+)\}/g, (match, key) => params[key] || match);
    },

    /**
     * Apply translations to DOM elements with data-i18n attributes
     */
    applyTranslations() {
      document.title = this.t('app.title');
      
      // Text content
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = this.t(key);
      });

      // Placeholder
      document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = this.t(key);
      });

      // Title
      document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        el.title = this.t(key);
      });

      // Aria-label
      document.querySelectorAll('[data-i18n-aria]').forEach(el => {
        const key = el.getAttribute('data-i18n-aria');
        el.setAttribute('aria-label', this.t(key));
      });
    },

    /**
     * Change language
     */
    async setLanguage(lang) {
      await this.loadLanguage(lang);
      this.currentLang = lang;
      localStorage.setItem('app_language', lang);
      this.applyTranslations();

      // Dispatch event for components to react
      window.dispatchEvent(new CustomEvent('languagechange', { detail: { lang } }));
    },

    /**
     * Get current language
     */
    getCurrentLanguage() {
      return this.currentLang;
    },

    /**
     * Get available languages
     */
    getAvailableLanguages() {
      return [
        { code: 'zh-CN', name: '简体中文' },
        { code: 'zh-TW', name: '繁體中文' },
        { code: 'en-US', name: 'English' },
        { code: 'ja-JP', name: '日本語' }
      ];
    }
  };

  // Export to global
  window.I18n = I18n;

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => I18n.init());
  } else {
    I18n.init();
  }
})();
