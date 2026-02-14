// js/core/hls-handler.js
// HLS 播放处理模块

(function() {
  'use strict';

  /**
   * HLS 配置选项
   */
  const HLS_CONFIG = {
    maxBufferLength: 30,
    maxMaxBufferLength: 60,
    startLevel: -1,
    enableWorker: true,
    enableSoftwareAES: true,
    manifestLoadingTimeOut: 10000,
    levelLoadingTimeOut: 10000,
    fragLoadingTimeOut: 60000,
    fragLoadingMaxRetry: 3,
    fragLoadingRetryDelay: 2000,
    startFragPrefetch: true
  };

  const HLS_SCRIPT_URL = 'https://s4.zstatic.net/npm/hls.js@latest/dist/hls.min.js';

  /**
   * HLS 处理器状态
   */
  const state = {
    instance: null,
    ready: false,
    failed: false,
    codecUnsupported: false
  };

  /**
   * 加载 HLS.js 库
   * @returns {Promise<void>}
   */
  function loadHLSLibrary() {
    return new Promise((resolve, reject) => {
      if (typeof Hls !== 'undefined') {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = HLS_SCRIPT_URL;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load HLS.js library'));
      document.head.appendChild(script);
    });
  }

  /**
   * 检查 HLS 支持
   * @param {HTMLVideoElement} video - 视频元素
   * @returns {{ supported: boolean, native: boolean }}
   */
  function checkSupport(video) {
    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      return { supported: true, native: false };
    }
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      return { supported: true, native: true };
    }
    return { supported: false, native: false };
  }

  /**
   * 初始化 HLS 实例
   * @param {HTMLVideoElement} video - 视频元素
   * @param {string} source - m3u8 URL
   * @param {Object} callbacks - 回调函数
   * @param {Function} callbacks.onReady - HLS 就绪回调
   * @param {Function} callbacks.onError - 错误回调
   * @param {Function} callbacks.onFallback - 回退到 MP4 回调
   * @returns {Promise<void>}
   */
  async function init(video, source, callbacks = {}) {
    if (state.instance) return;
    if (state.failed) throw new Error('HLS already failed');

    const { onReady, onError, onFallback } = callbacks;

    try {
      await loadHLSLibrary();
    } catch (err) {
      console.warn('Failed to load HLS.js:', err);
      state.failed = true;
      onFallback && onFallback();
      throw err;
    }

    const support = checkSupport(video);

    if (!support.supported) {
      state.failed = true;
      onFallback && onFallback();
      throw new Error('HLS not supported');
    }

    // 原生 HLS 支持（Safari）
    if (support.native) {
      video.src = source;
      video.addEventListener('error', () => {
        console.warn('Native HLS playback failed');
        state.failed = true;
        onFallback && onFallback();
      }, { once: true });
      state.ready = true;
      onReady && onReady();
      return;
    }

    // HLS.js 支持
    state.instance = new Hls(HLS_CONFIG);

    state.instance.on(Hls.Events.MANIFEST_PARSED, () => {
      state.ready = true;
      onReady && onReady();
    });

    state.instance.on(Hls.Events.ERROR, (event, data) => {
      handleHLSError(data, video, callbacks);
    });

    state.instance.loadSource(source);
    state.instance.attachMedia(video);
  }

  /**
   * 处理 HLS 错误
   * @param {Object} data - 错误数据
   * @param {HTMLVideoElement} video - 视频元素
   * @param {Object} callbacks - 回调函数
   */
  function handleHLSError(data, video, callbacks) {
    const { onError, onFallback } = callbacks;

    if (!data.fatal) {
      onError && onError(data, false);
      return;
    }

    console.error('HLS fatal error:', data);
    onError && onError(data, true);

    switch (data.type) {
      case Hls.ErrorTypes.NETWORK_ERROR:
        console.warn('HLS network error, attempting recovery...');
        state.instance.startLoad();
        setTimeout(() => {
          if (!state.ready) {
            destroy();
            onFallback && onFallback();
          }
        }, 5000);
        break;

      case Hls.ErrorTypes.MEDIA_ERROR:
        if (data.details === 'bufferAddCodecError') {
          console.warn('Browser does not support this codec. Falling back to MP4.');
          state.codecUnsupported = true;
          destroy();
          onFallback && onFallback();
          break;
        }
        console.warn('HLS media error, attempting recovery...');
        state.instance.recoverMediaError();
        break;

      default:
        console.warn('HLS unrecoverable error, falling back to MP4');
        destroy();
        onFallback && onFallback();
        break;
    }
  }

  /**
   * Seek 到指定位置
   * @param {HTMLVideoElement} video - 视频元素
   * @param {number} offsetSeconds - 目标位置（秒）
   * @returns {Promise<void>}
   */
  function seekTo(video, offsetSeconds) {
    return AppHelpers.seekVideoWhenReady(video, offsetSeconds, true);
  }

  /**
   * 销毁 HLS 实例
   */
  function destroy() {
    if (state.instance) {
      state.instance.destroy();
      state.instance = null;
    }
    state.ready = false;
  }

  /**
   * 获取当前状态
   * @returns {Object}
   */
  function getState() {
    return { ...state };
  }

  /**
   * 标记为失败
   */
  function markFailed() {
    state.failed = true;
    state.ready = false;
    destroy();
  }

  // 导出模块
  window.HLSHandler = {
    init,
    seekTo,
    destroy,
    getState,
    markFailed,
    checkSupport,
    HLS_CONFIG
  };
})();
