// js/core/audio-processor.js
// 音频处理模块（压缩 + 人声降低）

(function() {
  'use strict';

  /**
   * 压缩器配置
   */
  const COMPRESSOR_CONFIG = {
    threshold: -40,
    knee: 0,
    ratio: 20,
    attack: 0.003,
    release: 0.25
  };

  /**
   * 人声过滤器配置
   */
  const VOCAL_FILTER_CONFIG = [
    { frequency: 800, Q: 1.0, gain: -8 },
    { frequency: 2000, Q: 1.0, gain: -8 }
  ];

  /**
   * 直通增益值（补偿 AudioContext 接管后的音量损失）
   */
  const BYPASS_GAIN = 1.5;

  /**
   * 处理增益值
   */
  const PROCESSING_GAIN = 1.3;

  /**
   * 音频处理器状态
   */
  const state = {
    context: null,
    source: null,
    compressor: null,
    gainNode: null,
    vocalFilters: [],
    bypassGain: null,
    outputNode: null,
    isProcessing: false,
    initialized: false
  };

  /**
   * 创建压缩器节点
   * @param {AudioContext} ctx
   * @returns {DynamicsCompressorNode}
   */
  function createCompressor(ctx) {
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = COMPRESSOR_CONFIG.threshold;
    compressor.knee.value = COMPRESSOR_CONFIG.knee;
    compressor.ratio.value = COMPRESSOR_CONFIG.ratio;
    compressor.attack.value = COMPRESSOR_CONFIG.attack;
    compressor.release.value = COMPRESSOR_CONFIG.release;
    return compressor;
  }

  /**
   * 创建人声过滤器链
   * @param {AudioContext} ctx
   * @returns {BiquadFilterNode[]}
   */
  function createVocalFilters(ctx) {
    return VOCAL_FILTER_CONFIG.map(config => {
      const filter = ctx.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = config.frequency;
      filter.Q.value = config.Q;
      filter.gain.value = config.gain;
      return filter;
    });
  }

  /**
   * 连接处理链路
   * @param {GainNode} gainNode
   * @param {BiquadFilterNode[]} filters
   */
  function connectProcessingChain(compressor, gainNode, filters) {
    compressor.connect(gainNode);
    
    let prevNode = gainNode;
    filters.forEach(filter => {
      prevNode.connect(filter);
      prevNode = filter;
    });
    
    return prevNode; // 返回最后一个节点作为输出
  }

  /**
   * 初始化音频处理器
   * @param {HTMLVideoElement} video - 视频元素
   * @returns {boolean} 是否初始化成功
   */
  function init(video) {
    if (state.initialized) return true;

    try {
      state.context = new (window.AudioContext || window.webkitAudioContext)();
      state.source = state.context.createMediaElementSource(video);

      // 直通增益
      state.bypassGain = state.context.createGain();
      state.bypassGain.gain.value = BYPASS_GAIN;
      state.bypassGain.connect(state.context.destination);

      // 压缩器
      state.compressor = createCompressor(state.context);

      // 增益
      state.gainNode = state.context.createGain();
      state.gainNode.gain.value = PROCESSING_GAIN;

      // 人声过滤器链
      state.vocalFilters = createVocalFilters(state.context);

      // 连接处理链路
      state.outputNode = connectProcessingChain(
        state.compressor,
        state.gainNode,
        state.vocalFilters
      );

      // 初始状态：直连输出
      state.source.connect(state.bypassGain);
      state.initialized = true;

      return true;
    } catch (e) {
      console.error('Failed to initialize audio processing:', e);
      state.context = null;
      return false;
    }
  }

  /**
   * 启用音频处理
   */
  function enable() {
    if (!state.initialized) return false;

    try {
      state.source.disconnect();
      state.source.connect(state.compressor);
      state.outputNode.connect(state.context.destination);
      state.isProcessing = true;
      return true;
    } catch (e) {
      console.error('Failed to enable audio processing:', e);
      return false;
    }
  }

  /**
   * 禁用音频处理
   */
  function disable() {
    if (!state.initialized) return false;

    try {
      state.outputNode.disconnect();
      state.source.disconnect();
      state.source.connect(state.bypassGain);
      state.isProcessing = false;
      return true;
    } catch (e) {
      console.error('Failed to disable audio processing:', e);
      return false;
    }
  }

  /**
   * 切换音频处理状态
   * @param {HTMLVideoElement} video - 视频元素（首次初始化时需要）
   * @returns {boolean} 切换后的处理状态
   */
  function toggle(video) {
    if (!state.initialized) {
      if (!init(video)) return false;
    }

    if (state.isProcessing) {
      disable();
    } else {
      enable();
    }

    return state.isProcessing;
  }

  /**
   * 获取当前处理状态
   * @returns {boolean}
   */
  function isProcessing() {
    return state.isProcessing;
  }

  /**
   * 检查是否已初始化
   * @returns {boolean}
   */
  function isInitialized() {
    return state.initialized;
  }

  /**
   * 销毁音频处理器
   */
  function destroy() {
    if (state.context) {
      try {
        state.context.close();
      } catch (e) {}
    }
    
    Object.keys(state).forEach(key => {
      if (key === 'isProcessing' || key === 'initialized') {
        state[key] = false;
      } else if (key === 'vocalFilters') {
        state[key] = [];
      } else {
        state[key] = null;
      }
    });
  }

  // 导出模块
  window.AudioProcessor = {
    init,
    enable,
    disable,
    toggle,
    isProcessing,
    isInitialized,
    destroy,
    COMPRESSOR_CONFIG,
    VOCAL_FILTER_CONFIG
  };
})();
