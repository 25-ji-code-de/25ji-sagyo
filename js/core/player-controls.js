// js/core/player-controls.js
// 播放器 UI 控制模块

(function() {
  'use strict';

  /**
   * 根据音量级别返回对应的图标
   * @param {number} volume - 音量 (0-1)
   * @param {boolean} muted - 是否静音
   * @returns {string} 图标字符
   */
  function getVolumeIcon(volume, muted) {
    if (muted || volume === 0) return '🔇';
    if (volume < 0.33) return '🔈';
    if (volume < 0.66) return '🔉';
    return '🔊';
  }

  /**
   * 更新静音按钮 UI
   * @param {HTMLElement} muteBtn - 静音按钮元素
   * @param {number} volume - 当前音量
   * @param {boolean} muted - 是否静音
   */
  function updateMuteButton(muteBtn, volume, muted) {
    if (!muteBtn) return;
    
    const icon = getVolumeIcon(volume, muted);
    muteBtn.textContent = icon;
    muteBtn.setAttribute('aria-pressed', String(!muted));
    muteBtn.title = muted ? 'Muted — click to unmute' : 'Click to mute';
  }

  /**
   * 更新音量滑块 UI
   * @param {HTMLInputElement} volumeSlider - 音量滑块元素
   * @param {number} volume - 当前音量
   * @param {boolean} muted - 是否静音
   */
  function updateVolumeSlider(volumeSlider, volume, muted) {
    if (!volumeSlider) return;
    volumeSlider.value = muted ? '0' : String(volume);
  }

  /**
   * 更新时区标签 UI
   * @param {HTMLElement} tzLabel - 时区标签元素
   * @param {string} mode - 时区模式 ('local' | 'tokyo')
   */
  function updateTimezoneLabel(tzLabel, mode) {
    if (!tzLabel) return;
    tzLabel.textContent = mode === 'local' ? 'Local' : 'Tokyo';
  }

  /**
   * 更新音频处理按钮 UI
   * @param {HTMLElement} audioProcessBtn - 音频处理按钮元素
   * @param {boolean} isProcessing - 是否正在处理
   */
  function updateAudioProcessButton(audioProcessBtn, isProcessing) {
    if (!audioProcessBtn) return;
    
    audioProcessBtn.setAttribute('aria-pressed', String(isProcessing));
    audioProcessBtn.title = isProcessing ? 
      '音频处理已开启（点击关闭）' : 
      '音频处理（限幅+降低人声）';
  }

  /**
   * 更新时间显示
   * @param {HTMLElement} timeEl - 时间显示元素
   * @param {string} timeStr - 格式化的时间字符串
   */
  function updateTimeDisplay(timeEl, timeStr) {
    if (!timeEl) return;
    timeEl.textContent = timeStr;
  }

  /**
   * 显示/隐藏视频加载指示器
   * @param {HTMLElement} loader - 加载指示器元素
   * @param {boolean} show - 是否显示
   */
  function toggleLoader(loader, show) {
    if (!loader) return;
    
    if (show) {
      loader.classList.remove('hidden');
    } else {
      loader.classList.add('hidden');
    }
  }

  /**
   * 切换 overlay 显示状态
   * @param {HTMLElement} overlay - overlay 元素
   */
  function toggleOverlay(overlay) {
    if (!overlay) return;
    overlay.classList.toggle('hidden');
  }

  /**
   * 切换全屏和屏幕方向
   * @returns {Promise<void>}
   */
  async function toggleFullscreenAndOrientation() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        await screen.orientation?.lock('landscape').catch(() => {});
      } else {
        await document.exitFullscreen();
        await screen.orientation?.unlock().catch(() => {});
      }
    } catch (e) {
      console.warn('Fullscreen/orientation toggle failed:', e);
    }
  }

  /**
   * 显示 HEVC 不支持警告
   */
  function showHEVCWarning() {
    const existing = document.getElementById('hevcWarning');
    if (existing) return;

    const container = document.createElement('div');
    container.id = 'hevcWarning';
    container.className = 'hevc-warning';
    container.innerHTML = `
      <div class="hevc-inner">
        <span>检测到您的浏览器可能不支持 H.265 / HEVC 编码，播放可能失败。</span>
      </div>
    `;
    
    const app = document.getElementById('app') || document.body;
    app.appendChild(container);
    container.addEventListener('click', (e) => e.stopPropagation());
  }

  /**
   * 检查当前焦点是否在输入元素上
   * @returns {boolean}
   */
  function isInputFocused() {
    const active = document.activeElement;
    if (!active) return false;
    
    const tag = active.tagName && active.tagName.toLowerCase();
    return tag === 'input' || 
           tag === 'textarea' || 
           tag === 'select' || 
           active.isContentEditable;
  }

  /**
   * 创建控制器实例
   * @param {Object} elements - DOM 元素对象
   * @returns {Object} 控制器 API
   */
  function createController(elements) {
    const {
      video,
      muteBtn,
      volumeSlider,
      fullscreenBtn,
      tzToggleBtn,
      tzLabel,
      audioProcessBtn,
      localTimeEl,
      videoLoader,
      overlay,
      orientationWarning,
      infoEl
    } = elements;

    let savedVolume = 1;
    let firstUserClick = true;

    return {
      /**
       * 更新所有控件 UI
       * @param {Object} state - 当前状态
       */
      updateAll(state) {
        updateMuteButton(muteBtn, state.volume, state.muted);
        updateVolumeSlider(volumeSlider, state.volume, state.muted);
        updateTimezoneLabel(tzLabel, state.timezoneMode);
        updateAudioProcessButton(audioProcessBtn, state.audioProcessing);
      },

      /**
       * 更新时间显示
       * @param {string} timeStr
       */
      updateTime(timeStr) {
        updateTimeDisplay(localTimeEl, timeStr);
      },

      /**
       * 显示加载器
       */
      showLoader() {
        toggleLoader(videoLoader, true);
      },

      /**
       * 隐藏加载器
       */
      hideLoader() {
        toggleLoader(videoLoader, false);
      },

      /**
       * 切换 overlay
       */
      toggleOverlay() {
        toggleOverlay(overlay);
      },

      /**
       * 获取保存的音量
       */
      getSavedVolume() {
        return savedVolume;
      },

      /**
       * 设置保存的音量
       */
      setSavedVolume(vol) {
        savedVolume = vol;
      },

      /**
       * 检查是否是首次用户点击
       */
      isFirstClick() {
        return firstUserClick;
      },

      /**
       * 标记已处理首次点击
       */
      markFirstClickHandled() {
        firstUserClick = false;
      },

      /**
       * 切换全屏
       */
      toggleFullscreen: toggleFullscreenAndOrientation,

      /**
       * 显示 HEVC 警告
       */
      showHEVCWarning,

      /**
       * 检查是否在输入元素上
       */
      isInputFocused
    };
  }

  // 导出模块
  window.PlayerControls = {
    getVolumeIcon,
    updateMuteButton,
    updateVolumeSlider,
    updateTimezoneLabel,
    updateAudioProcessButton,
    updateTimeDisplay,
    toggleLoader,
    toggleOverlay,
    toggleFullscreenAndOrientation,
    showHEVCWarning,
    isInputFocused,
    createController
  };
})();
