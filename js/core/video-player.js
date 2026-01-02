// js/core/video-player.js
// 主视频播放器核心逻辑

(function() {
  'use strict';

  const R2_BASE = window.AssetLoader ? window.AssetLoader.R2_BASE : 'https://assets.nightcord.de5.net';
  const getAssetUrl = window.AssetLoader ? window.AssetLoader.getAssetUrl : async (path) => `${R2_BASE}${path}`;

  // DOM 元素
  const video = document.getElementById('video');
  const videoLoader = document.getElementById('videoLoader');
  const localTimeEl = document.getElementById('localTime');
  const tzLabelEl = document.getElementById('tzLabel');
  const muteBtn = document.getElementById('muteBtn');
  const volumeSlider = document.getElementById('volumeSlider');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const tzToggleBtn = document.getElementById('tzToggleBtn');
  const audioProcessBtn = document.getElementById('audioProcessBtn');
  const orientationWarning = document.getElementById('orientation-warning');
  const overlay = document.getElementById('overlay');

  if (!video) {
    console.error('Video element not found');
    return;
  }

  // 视频源配置
  const DEFAULT_SOURCES = { p1: 'p1.mp4', p2: 'p2.mp4', p3: 'p3.mp4' };
  const sources = window.TIME_SYNC_SOURCES || DEFAULT_SOURCES;

  // 确定播放模式
  const has6Parts = !!(sources.p1 && sources.p2 && sources.p3 && sources.p4 && sources.p5 && sources.p6);
  const has3Parts = !!(sources.p1 && sources.p2 && sources.p3) && !has6Parts;
  const hasHLS = !!(sources.m3u8);
  
  let playbackMode;
  if (hasHLS) {
    playbackMode = 'hls';
  } else if (has6Parts) {
    playbackMode = 'mp4-6';
  } else if (has3Parts) {
    playbackMode = 'mp4-3';
  } else {
    playbackMode = 'mp4-3';
  }

  // 状态变量
  let hlsFailed = false;
  let hlsInstance = null;
  let hlsReady = false;
  let hlsCodecUnsupported = false;
  let timezoneMode = 'local';
  let savedVolume = 1;
  let lastPartIndex = null;
  let firstUserClick = true;

  // 音频处理
  let audioContext = null;
  let audioSource = null;
  let compressor = null;
  let gainNode = null;
  let vocalReducer = null;
  let isAudioProcessing = false;

  // 计算 part 长度
  function getPartLengthSeconds() {
    return playbackMode === 'mp4-3' ? 8 * 3600 : 4 * 3600;
  }
  
  let PART_LENGTH_SECONDS = getPartLengthSeconds();
  const DAY_LENGTH_SECONDS = 24 * 3600;

  // 设置持久化
  const SETTINGS_KEY = 'videoPlayerSettings';

  function saveSettings() {
    try {
      const s = {
        muted: !!video.muted,
        volume: Number(video.volume) || 0,
        timezoneMode: timezoneMode,
        audioProcessing: isAudioProcessing
      };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch (e) {}
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.volume === 'number') video.volume = s.volume;
      if (typeof s.muted === 'boolean') video.muted = s.muted;
      if (s.timezoneMode) timezoneMode = s.timezoneMode;
      if (typeof s.audioProcessing === 'boolean' && s.audioProcessing) {
        const enableOnInteraction = () => {
          if (!isAudioProcessing) {
            toggleAudioProcessing();
          }
          document.removeEventListener('click', enableOnInteraction);
          document.removeEventListener('keydown', enableOnInteraction);
        };
        document.addEventListener('click', enableOnInteraction, { once: true });
        document.addEventListener('keydown', enableOnInteraction, { once: true });
      }
    } catch (e) {}
  }

  // 视频加载器显示/隐藏
  function hideVideoLoader() {
    if (videoLoader) videoLoader.classList.add('hidden');
  }

  function showVideoLoader() {
    if (videoLoader) videoLoader.classList.remove('hidden');
  }

  video.addEventListener('canplay', hideVideoLoader);
  video.addEventListener('playing', hideVideoLoader);

  // 时间格式化
  function formatTime(d) {
    return d.toLocaleTimeString();
  }

  // 计算当前时间对应的 part 和偏移量
  function computePartAndOffset(date) {
    const base = new Date(date);
    base.setHours(1, 0, 0, 0);
    if (date < base) {
      base.setDate(base.getDate() - 1);
    }
    let diffSeconds = Math.floor((date.getTime() - base.getTime()) / 1000);
    diffSeconds = ((diffSeconds % 86400) + 86400) % 86400;

    const partIndex = Math.floor(diffSeconds / PART_LENGTH_SECONDS);
    const offset = diffSeconds % PART_LENGTH_SECONDS;
    return { partIndex, offset };
  }

  function partIndexToKey(i) {
    return ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'][i] || 'p1';
  }

  // HLS 模式的全天偏移量计算
  function computeDayOffset(date) {
    const base = new Date(date);
    base.setHours(1, 0, 0, 0);
    if (date < base) {
      base.setDate(base.getDate() - 1);
    }
    let diffSeconds = Math.floor((date.getTime() - base.getTime()) / 1000);
    diffSeconds = ((diffSeconds % 86400) + 86400) % 86400;
    return diffSeconds;
  }

  // HLS 回退到 MP4
  function fallbackToMP4() {
    if (hlsFailed) return;
    
    console.warn('HLS failed, falling back to MP4 mode...');
    hlsFailed = true;
    hlsReady = false;
    
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }
    
    video.src = '';
    video.load();
    
    if (has6Parts) {
      playbackMode = 'mp4-6';
    } else if (has3Parts) {
      playbackMode = 'mp4-3';
    } else {
      console.error('No fallback MP4 sources available!');
      showHEVCWarning();
      return;
    }
    
    PART_LENGTH_SECONDS = getPartLengthSeconds();
    lastPartIndex = null;
    
    console.log('Switched to playback mode:', playbackMode);
    resyncOnce();
  }

  // 初始化 HLS
  function initHLS() {
    if (hlsInstance) return Promise.resolve();
    if (hlsFailed) return Promise.reject(new Error('HLS already failed'));
    
    return new Promise((resolve, reject) => {
      if (typeof Hls !== 'undefined') {
        createHLSInstance(resolve, reject);
        return;
      }
      
      const script = document.createElement('script');
      script.src = 'https://s4.zstatic.net/npm/hls.js@latest/dist/hls.min.js';
      script.onload = () => createHLSInstance(resolve, reject);
      script.onerror = () => {
        console.warn('Failed to load HLS.js library');
        reject(new Error('Failed to load HLS.js'));
        fallbackToMP4();
      };
      document.head.appendChild(script);
    });
  }

  function createHLSInstance(resolve, reject) {
    if (!Hls.isSupported()) {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = sources.m3u8;
        video.addEventListener('error', () => {
          console.warn('Native HLS playback failed');
          fallbackToMP4();
        }, { once: true });
        hlsReady = true;
        resolve();
        return;
      }
      reject(new Error('HLS not supported'));
      fallbackToMP4();
      return;
    }

    hlsInstance = new Hls({
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      startLevel: -1,
      enableWorker: true,
      enableSoftwareAES: true,
      manifestLoadingTimeOut: 10000,
      levelLoadingTimeOut: 10000,
      fragLoadingTimeOut: 20000,
      startFragPrefetch: true
    });

    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      hlsReady = true;
      resolve();
    });

    hlsInstance.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        console.error('HLS fatal error:', data);
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.warn('HLS network error, attempting recovery...');
            hlsInstance.startLoad();
            setTimeout(() => {
              if (!hlsReady) fallbackToMP4();
            }, 5000);
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            if (data.details === 'bufferAddCodecError') {
              console.warn('Browser does not support this codec. Falling back to MP4.');
              hlsCodecUnsupported = true;
              fallbackToMP4();
              break;
            }
            console.warn('HLS media error, attempting recovery...');
            hlsInstance.recoverMediaError();
            break;
          default:
            console.warn('HLS unrecoverable error, falling back to MP4');
            hlsInstance.destroy();
            hlsInstance = null;
            hlsReady = false;
            fallbackToMP4();
            break;
        }
      }
    });

    hlsInstance.loadSource(sources.m3u8);
    hlsInstance.attachMedia(video);
  }

  // HLS seek
  function hlsSeekTo(offsetSeconds) {
    return new Promise((resolve) => {
      const doSeek = () => {
        try {
          if (video.duration && offsetSeconds > video.duration) {
            offsetSeconds = offsetSeconds % video.duration;
          }
        } catch (e) {}

        function onSeeked() {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        }

        video.addEventListener('seeked', onSeeked);
        try {
          video.currentTime = Math.max(0, offsetSeconds);
        } catch (err) {
          setTimeout(() => {
            try { video.currentTime = Math.max(0, offsetSeconds); } catch (e) {}
          }, 300);
        }
      };

      if (video.readyState >= 1) {
        doSeek();
      } else {
        video.addEventListener('loadedmetadata', function onMeta() {
          video.removeEventListener('loadedmetadata', onMeta);
          doSeek();
          video.play().catch(() => {});
        });
      }
    });
  }

  // MP4 加载和 seek
  function loadAndSeekTo(partIndex, offsetSeconds) {
    const key = partIndexToKey(partIndex);
    const src = sources[key];
    if (!src) return Promise.reject(new Error('Missing source for part ' + key));

    return new Promise((resolve, reject) => {
      const doSeek = () => {
        try {
          if (video.duration && offsetSeconds > video.duration) {
            offsetSeconds = offsetSeconds % video.duration;
          }
        } catch (e) {}

        function onSeeked() {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        }

        video.addEventListener('seeked', onSeeked);
        try {
          video.currentTime = Math.max(0, offsetSeconds);
        } catch (err) {
          setTimeout(() => {
            try { video.currentTime = Math.max(0, offsetSeconds); } catch (e) {}
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

  // 控制 UI 更新
  function volumeIconForLevel(v, muted) {
    if (muted || v === 0) return '🔇';
    if (v < 0.33) return '🔈';
    if (v < 0.66) return '🔉';
    return '🔊';
  }

  function updateControlsUI() {
    if (muteBtn) {
      const icon = volumeIconForLevel(video.volume, video.muted);
      muteBtn.textContent = icon;
      muteBtn.setAttribute('aria-pressed', String(!video.muted));
      muteBtn.title = video.muted ? 'Muted — click to unmute' : 'Click to mute';
    }
    if (volumeSlider) {
      volumeSlider.value = video.muted ? '0' : String(video.volume);
    }
    if (tzLabelEl) tzLabelEl.textContent = timezoneMode === 'local' ? 'Local' : 'Tokyo';
  }

  // 静音按钮
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      if (!video.muted) {
        savedVolume = video.volume || savedVolume || 1;
        video.muted = true;
        if (volumeSlider) volumeSlider.value = '0';
      } else {
        video.muted = false;
        video.volume = savedVolume || 1;
        if (volumeSlider) volumeSlider.value = String(video.volume);
        video.play().catch(() => {});
      }
      updateControlsUI();
      saveSettings();
    });
  }

  // 音量滑块
  if (volumeSlider) {
    volumeSlider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      const vol = isNaN(v) ? 1 : v;
      video.volume = vol;
      if (vol > 0) {
        video.muted = false;
        savedVolume = vol;
      } else {
        video.muted = true;
      }
      updateControlsUI();
      saveSettings();
    });
  }

  // 全屏和方向切换
  const toggleFullscreenAndOrientation = async () => {
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
  };

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', toggleFullscreenAndOrientation);
  }
  if (orientationWarning) {
    orientationWarning.addEventListener('click', toggleFullscreenAndOrientation);
  }

  // 时区切换
  if (tzToggleBtn) {
    tzToggleBtn.addEventListener('click', () => {
      timezoneMode = timezoneMode === 'local' ? 'tokyo' : 'local';
      updateControlsUI();
      showVideoLoader();
      resyncOnce();
      saveSettings();
    });
  }

  // 音频处理初始化
  function initAudioProcessing() {
    if (audioContext) return;
    
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioSource = audioContext.createMediaElementSource(video);
      
      compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -40;
      compressor.knee.value = 0;
      compressor.ratio.value = 20;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      
      gainNode = audioContext.createGain();
      gainNode.gain.value = 1.3;
      
      const vocalFilter1 = audioContext.createBiquadFilter();
      vocalFilter1.type = 'peaking';
      vocalFilter1.frequency.value = 800;
      vocalFilter1.Q.value = 1.0;
      vocalFilter1.gain.value = -8;
      
      const vocalFilter2 = audioContext.createBiquadFilter();
      vocalFilter2.type = 'peaking';
      vocalFilter2.frequency.value = 2000;
      vocalFilter2.Q.value = 1.0;
      vocalFilter2.gain.value = -8;
      
      audioSource.connect(compressor);
      compressor.connect(gainNode);
      gainNode.connect(vocalFilter1);
      vocalFilter1.connect(vocalFilter2);
      
      vocalReducer = vocalFilter2;
    } catch (e) {
      console.error('Failed to initialize audio processing:', e);
      audioContext = null;
    }
  }

  function toggleAudioProcessing() {
    if (!audioContext) {
      initAudioProcessing();
      if (!audioContext) return;
    }
    
    try {
      if (isAudioProcessing) {
        vocalReducer.disconnect();
        audioSource.disconnect();
        audioSource.connect(audioContext.destination);
        isAudioProcessing = false;
      } else {
        audioSource.disconnect();
        audioSource.connect(compressor);
        vocalReducer.connect(audioContext.destination);
        isAudioProcessing = true;
      }
      
      if (audioProcessBtn) {
        audioProcessBtn.setAttribute('aria-pressed', String(isAudioProcessing));
        audioProcessBtn.title = isAudioProcessing ? 
          '音频处理已开启（点击关闭）' : 
          '音频处理（限幅+降低人声）';
      }
      
      saveSettings();
    } catch (e) {
      console.error('Failed to toggle audio processing:', e);
    }
  }

  if (audioProcessBtn) {
    audioProcessBtn.addEventListener('click', toggleAudioProcessing);
  }

  // 获取当前时间（根据时区模式）
  function getNowByMode() {
    if (timezoneMode === 'local') return new Date();
    const utcMs = Date.now() + new Date().getTimezoneOffset() * 60000;
    const tokyoMs = utcMs + 9 * 3600 * 1000;
    return new Date(tokyoMs);
  }

  // 同步播放位置
  function resyncOnce() {
    const now = getNowByMode();
    if (localTimeEl) localTimeEl.textContent = formatTime(now);

    if (playbackMode === 'hls' && !hlsFailed) {
      const dayOffset = computeDayOffset(now);

      if (!hlsReady) {
        if (hlsCodecUnsupported || hlsFailed) return;
        initHLS().then(() => {
          hlsSeekTo(dayOffset).then(() => {
            video.play().catch(() => {});
          });
        }).catch((err) => {
          console.warn('HLS init failed:', err);
        });
        return;
      }

      const current = video.currentTime || 0;
      const drift = Math.abs(current - dayOffset);
      if (drift > 30) {
        hlsSeekTo(dayOffset).catch(console.warn);
      }
      if (video.paused) video.play().catch(() => {});
      updateControlsUI();
    } else {
      const { partIndex, offset } = computePartAndOffset(now);
      const desired = offset;

      if (lastPartIndex === null || lastPartIndex !== partIndex) {
        return loadAndSeekTo(partIndex, desired).catch(console.warn).finally(updateControlsUI);
      }

      const current = video.currentTime || 0;
      const drift = Math.abs(current - desired);
      if (drift > 30) {
        try {
          video.currentTime = desired;
        } catch (e) {
          loadAndSeekTo(partIndex, desired).catch(console.warn);
        }
      }
      if (video.paused) video.play().catch(() => {});
      updateControlsUI();
    }
  }

  // HEVC 警告
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

  // Overlay 切换
  function toggleOverlay() {
    if (!overlay) return;
    overlay.classList.toggle('hidden');
  }

  // 视频点击事件
  video.addEventListener('click', (e) => {
    if (firstUserClick) {
      if (video.muted) {
        video.muted = false;
        video.volume = savedVolume || 1;
        video.play().catch(() => {});
        updateControlsUI();
      }
      firstUserClick = false;
    }
    toggleOverlay();
  });

  // Overlay 点击不传播
  if (overlay) {
    overlay.addEventListener('click', (ev) => {
      ev.stopPropagation();
    });
  }

  // 键盘快捷键
  document.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    const tag = active && active.tagName && active.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (active && active.isContentEditable)) return;

    const k = (e.key || '').toLowerCase();
    if (k === 'm') {
      e.preventDefault();
      if (muteBtn) muteBtn.click();
      return;
    }
    if (k === 'f') {
      e.preventDefault();
      if (fullscreenBtn) fullscreenBtn.click();
      return;
    }
  });

  // 初始化
  if (typeof video.muted === 'undefined') video.muted = true;
  loadSettings();
  if (volumeSlider) {
    volumeSlider.value = String(video.volume || 1);
  }
  updateControlsUI();
  resyncOnce();

  // 定期同步
  setInterval(resyncOnce, 5000);

  // 每秒更新时钟
  setInterval(() => {
    const now = getNowByMode();
    if (localTimeEl) localTimeEl.textContent = formatTime(now);
  }, 1000);

  // 导出到全局命名空间
  window.VideoPlayer = {
    resync: resyncOnce,
    toggleMute: () => muteBtn && muteBtn.click(),
    toggleFullscreen: toggleFullscreenAndOrientation,
    toggleAudioProcessing,
    getTimezoneMode: () => timezoneMode,
    setTimezoneMode: (mode) => {
      if (mode === 'local' || mode === 'tokyo') {
        timezoneMode = mode;
        updateControlsUI();
        showVideoLoader();
        resyncOnce();
        saveSettings();
      }
    }
  };
})();
