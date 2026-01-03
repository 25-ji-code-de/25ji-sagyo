// js/core/video-player.js
// 主视频播放器核心逻辑

(function() {
  'use strict';

  // DOM 元素
  const video = document.getElementById('video');
  const elements = {
    video,
    videoLoader: document.getElementById('videoLoader'),
    localTimeEl: document.getElementById('localTime'),
    tzLabel: document.getElementById('tzLabel'),
    muteBtn: document.getElementById('muteBtn'),
    volumeSlider: document.getElementById('volumeSlider'),
    fullscreenBtn: document.getElementById('fullscreenBtn'),
    tzToggleBtn: document.getElementById('tzToggleBtn'),
    audioProcessBtn: document.getElementById('audioProcessBtn'),
    orientationWarning: document.getElementById('orientation-warning'),
    overlay: document.getElementById('overlay'),
    infoEl: document.getElementById('info')
  };

  if (!video) {
    console.error('Video element not found');
    return;
  }

  // 视频源配置
  const DEFAULT_SOURCES = { p1: 'p1.mp4', p2: 'p2.mp4', p3: 'p3.mp4' };
  const sources = window.TIME_SYNC_SOURCES || DEFAULT_SOURCES;

  const has6Parts = !!(sources.p1 && sources.p2 && sources.p3 && sources.p4 && sources.p5 && sources.p6);
  const has3Parts = !!(sources.p1 && sources.p2 && sources.p3) && !has6Parts;
  const hasHLS = !!(sources.m3u8);

  let playbackMode = hasHLS ? 'hls' : (has6Parts ? 'mp4-6' : 'mp4-3');
  let PART_LENGTH_SECONDS = TimeSync.getPartLengthSeconds(playbackMode);

  // 状态变量
  let timezoneMode = 'local';
  let lastPartIndex = null;

  // 初始化控制器实例
  const controller = PlayerControls.createController(elements);

  // 辅助函数
  function getState() {
    return {
      volume: video.volume,
      muted: video.muted,
      timezoneMode,
      audioProcessing: AudioProcessor.isProcessing()
    };
  }

  function saveSettings() {
    VideoSettings.save(getState());
  }

  function updateControlsUI() {
    controller.updateAll(getState());
  }

  // MP4 加载和 Seek
  function loadAndSeekTo(partIndex, offsetSeconds) {
    const key = TimeSync.partIndexToKey(partIndex);
    const src = sources[key];
    if (!src) return Promise.reject(new Error('Missing source for part ' + key));

    return new Promise((resolve) => {
      const doSeek = () => {
        let targetOffset = offsetSeconds;
        try {
          if (video.duration && targetOffset > video.duration) {
            targetOffset = targetOffset % video.duration;
          }
        } catch (e) {}

        function onSeeked() {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        }

        video.addEventListener('seeked', onSeeked);
        try {
          if (isFinite(targetOffset)) {
            video.currentTime = Math.max(0, targetOffset);
          }
        } catch (err) {
          setTimeout(() => {
            try {
              if (isFinite(targetOffset)) {
                video.currentTime = Math.max(0, targetOffset);
              }
            } catch (e) {}
          }, 300);
        }
      };

      if (!video.src || !video.src.endsWith(src)) {
        lastPartIndex = partIndex;
        video.src = src;
        video.load();
        video.addEventListener('loadedmetadata', function onMeta() {
          video.removeEventListener('loadedmetadata', onMeta);
          doSeek();
          video.play().catch(() => {});
        });
      } else {
        if (video.readyState >= 1) {
          doSeek();
        } else {
          video.addEventListener('loadedmetadata', function onMeta2() {
            video.removeEventListener('loadedmetadata', onMeta2);
            doSeek();
          });
        }
      }
    });
  }

  // HLS 回退处理
  function fallbackToMP4() {
    const hlsState = HLSHandler.getState();
    if (hlsState.failed) return;

    console.warn('HLS failed, falling back to MP4 mode...');
    HLSHandler.markFailed();

    video.src = '';
    video.load();

    if (has6Parts) {
      playbackMode = 'mp4-6';
    } else if (has3Parts) {
      playbackMode = 'mp4-3';
    } else {
      console.error('No fallback MP4 sources available!');
      controller.showHEVCWarning();
      return;
    }

    PART_LENGTH_SECONDS = TimeSync.getPartLengthSeconds(playbackMode);
    lastPartIndex = null;

    console.log('Switched to playback mode:', playbackMode);
    resyncOnce();
  }

  // 核心同步逻辑
  function resyncOnce() {
    const now = TimeSync.getNowByMode(timezoneMode);
    controller.updateTime(TimeSync.formatTime(now));

    const hlsState = HLSHandler.getState();

    if (playbackMode === 'hls' && !hlsState.failed) {
      const dayOffset = TimeSync.computeDayOffset(now);

      if (!hlsState.ready) {
        if (hlsState.codecUnsupported || hlsState.failed) return;

        HLSHandler.init(video, sources.m3u8, {
          onReady: () => {
            HLSHandler.seekTo(video, dayOffset).then(() => {
              video.play().catch(() => {});
            });
          },
          onFallback: fallbackToMP4
        }).catch((err) => {
          console.warn('HLS init failed:', err);
        });
        return;
      }

      const current = video.currentTime || 0;
      if (TimeSync.isDrifted(current, dayOffset)) {
        HLSHandler.seekTo(video, dayOffset).catch(console.warn);
      }
      if (video.paused) video.play().catch(() => {});
      updateControlsUI();
    } else {
      // MP4 模式
      const { partIndex, offset } = TimeSync.computePartAndOffset(now, PART_LENGTH_SECONDS);

      if (lastPartIndex === null || lastPartIndex !== partIndex) {
        return loadAndSeekTo(partIndex, offset).catch(console.warn).finally(updateControlsUI);
      }

      const current = video.currentTime || 0;
      if (TimeSync.isDrifted(current, offset)) {
        try {
          video.currentTime = offset;
        } catch (e) {
          loadAndSeekTo(partIndex, offset).catch(console.warn);
        }
      }
      if (video.paused) video.play().catch(() => {});
      updateControlsUI();
    }
  }

  // 事件绑定
  // 视频加载器显示/隐藏
  video.addEventListener('canplay', () => controller.hideLoader());
  video.addEventListener('playing', () => controller.hideLoader());

  // 静音按钮
  if (elements.muteBtn) {
    elements.muteBtn.addEventListener('click', () => {
      if (!video.muted) {
        controller.setSavedVolume(video.volume || 1);
        video.muted = true;
      } else {
        video.muted = false;
        video.volume = controller.getSavedVolume();
        video.play().catch(() => {});
      }
      updateControlsUI();
      saveSettings();
    });
  }

  // 音量滑块
  if (elements.volumeSlider) {
    elements.volumeSlider.addEventListener('input', (e) => {
      const vol = parseFloat(e.target.value) || 0;
      video.volume = vol;
      video.muted = vol === 0;
      if (vol > 0) controller.setSavedVolume(vol);
      updateControlsUI();
      saveSettings();
    });
  }

  // 全屏按钮
  if (elements.fullscreenBtn) {
    elements.fullscreenBtn.addEventListener('click', controller.toggleFullscreen);
  }
  if (elements.orientationWarning) {
    elements.orientationWarning.addEventListener('click', controller.toggleFullscreen);
  }

  // 时区切换
  const toggleTimezone = () => {
    timezoneMode = timezoneMode === 'local' ? 'tokyo' : 'local';
    updateControlsUI();
    controller.showLoader();
    resyncOnce();
    saveSettings();
  };

  if (elements.tzToggleBtn) {
    elements.tzToggleBtn.addEventListener('click', toggleTimezone);
  }
  if (elements.infoEl) {
    elements.infoEl.addEventListener('click', toggleTimezone);
    elements.infoEl.title = "点击切换时区 (本地 / 东京)";
  }

  // 音频处理按钮
  if (elements.audioProcessBtn) {
    elements.audioProcessBtn.addEventListener('click', () => {
      AudioProcessor.toggle(video);
      updateControlsUI();
      saveSettings();
    });
  }

  // 视频点击事件
  video.addEventListener('click', () => {
    if (controller.isFirstClick() && video.muted) {
      video.muted = false;
      video.volume = controller.getSavedVolume();
      video.play().catch(() => {});
      updateControlsUI();
    }
    controller.markFirstClickHandled();
    controller.toggleOverlay();
  });

  // Overlay 点击不传播
  if (elements.overlay) {
    elements.overlay.addEventListener('click', (e) => e.stopPropagation());
  }

  // 键盘快捷键
  document.addEventListener('keydown', (e) => {
    if (controller.isInputFocused()) return;
    const k = (e.key || '').toLowerCase();
    if (k === 'm') {
      e.preventDefault();
      elements.muteBtn?.click();
    } else if (k === 'f') {
      e.preventDefault();
      elements.fullscreenBtn?.click();
    }
  });

  // 初始化
  const savedSettings = VideoSettings.getWithDefaults();
  video.volume = savedSettings.volume;
  video.muted = savedSettings.muted;
  timezoneMode = savedSettings.timezoneMode;

  // 恢复音频处理状态（需要用户交互）
  if (savedSettings.audioProcessing) {
    const enableOnInteraction = () => {
      if (!AudioProcessor.isProcessing()) {
        AudioProcessor.toggle(video);
        updateControlsUI();
      }
      document.removeEventListener('click', enableOnInteraction);
      document.removeEventListener('keydown', enableOnInteraction);
    };
    document.addEventListener('click', enableOnInteraction, { once: true });
    document.addEventListener('keydown', enableOnInteraction, { once: true });
  }

  if (elements.volumeSlider) {
    elements.volumeSlider.value = String(video.volume || 1);
  }

  updateControlsUI();
  resyncOnce();

  // 定期同步
  setInterval(resyncOnce, 5000);

  // 每秒更新时钟
  setInterval(() => {
    const now = TimeSync.getNowByMode(timezoneMode);
    controller.updateTime(TimeSync.formatTime(now));
  }, 1000);

  // 全局导出
  window.VideoPlayer = {
    resync: resyncOnce,
    toggleMute: () => elements.muteBtn?.click(),
    toggleFullscreen: controller.toggleFullscreen,
    toggleAudioProcessing: () => {
      AudioProcessor.toggle(video);
      updateControlsUI();
      saveSettings();
    },
    getTimezoneMode: () => timezoneMode,
    setTimezoneMode: (mode) => {
      if (mode === 'local' || mode === 'tokyo') {
        timezoneMode = mode;
        updateControlsUI();
        controller.showLoader();
        resyncOnce();
        saveSettings();
      }
    }
  };
})();
