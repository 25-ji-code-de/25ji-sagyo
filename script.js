// script.js
// Logic to choose which video to load and the correct seek offset
// so playback matches visitor's chosen timezone (local or Tokyo).
//
// Supports 3 modes:
//  1. 6-Part MP4: p1-p6, each 4 hours (01:00-05:00, 05:00-09:00, 09:00-13:00, 13:00-17:00, 17:00-21:00, 21:00-01:00)
//  2. 3-Part MP4: p1-p3, each 8 hours (01:00-09:00, 09:00-17:00, 17:00-01:00)
//  3. Single HLS: one m3u8 file covering full 24 hours

(() => {
  const R2_BASE = 'https://assets.nightcord.de5.net';

  const knownAssets = new Set();

  // Get asset URL (for elements that need URL, not Response)
  // Returns the R2 URL and handles upload trigger if needed
  async function getAssetUrl(path) {
    const r2Url = `${R2_BASE}${path}`;

    if (knownAssets.has(path)) {
      return r2Url;
    }

    // Check if asset exists via HEAD request
    const headResp = await fetch(r2Url, { method: 'HEAD' });

    if (headResp.ok) {
      knownAssets.add(path);
      return r2Url;
    }

    if (headResp.status === 404) {
      // 404 时触发上传
      try {
        const uploadResp = await fetch(`${R2_BASE}/upload?path=${encodeURIComponent(path)}`);
        const result = await uploadResp.json();
        
        if (result.status === 'uploaded' || result.status === 'exists') {
          knownAssets.add(path);
          return r2Url;
        }
      } catch (e) {
        console.warn('Upload trigger failed:', e);
      }
    }
    
    // Return R2 URL anyway, let the caller handle any errors
    return r2Url;
  }

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

  // Hide loader when video can play
  function hideVideoLoader() {
    if (videoLoader) {
      videoLoader.classList.add('hidden');
    }
  }

  // Show loader (e.g., when switching sources)
  function showVideoLoader() {
    if (videoLoader) {
      videoLoader.classList.remove('hidden');
    }
  }

  // Listen for video ready events
  video.addEventListener('canplay', hideVideoLoader);
  video.addEventListener('playing', hideVideoLoader);

  const DEFAULT_SOURCES = { p1: 'p1.mp4', p2: 'p2.mp4', p3: 'p3.mp4' };
  const sources = window.TIME_SYNC_SOURCES || DEFAULT_SOURCES;

  // Determine playback mode based on available sources:
  // - 'hls': Single HLS mode (m3u8 file, 24 hours) - PREFERRED
  // - 'mp4-6': 6-Part MP4 mode (p1-p6, each 4 hours) - fallback
  // - 'mp4-3': 3-Part MP4 mode (p1-p3, each 8 hours) - legacy fallback
  const has6Parts = !!(sources.p1 && sources.p2 && sources.p3 && sources.p4 && sources.p5 && sources.p6);
  const has3Parts = !!(sources.p1 && sources.p2 && sources.p3) && !has6Parts;
  const hasHLS = !!(sources.m3u8);
  
  // Prefer HLS first, then fallback to MP4 modes
  let playbackMode;
  if (hasHLS) {
    playbackMode = 'hls';
  } else if (has6Parts) {
    playbackMode = 'mp4-6';
  } else if (has3Parts) {
    playbackMode = 'mp4-3';
  } else {
    // fallback to 3-part mode
    playbackMode = 'mp4-3';
  }

  // Track if HLS has failed and we need to fallback
  let hlsFailed = false;

  // Function to get current part length based on mode
  function getPartLengthSeconds() {
    return playbackMode === 'mp4-3' ? 8 * 3600 : 4 * 3600; // 8 hours for 3-part, 4 hours for 6-part
  }
  
  // Part length depends on mode (initial value, may change on fallback)
  let PART_LENGTH_SECONDS = getPartLengthSeconds();
  const DAY_LENGTH_SECONDS = 24 * 3600; // 24 hours for HLS mode

  // HLS.js instance for HLS mode
  let hlsInstance = null;
  let hlsReady = false;
  let hlsCodecUnsupported = false; // Set to true if codec error (e.g., HEVC not supported) occurs

  // timezone mode: 'local' or 'tokyo'
  let timezoneMode = 'local';
  // remember last non-zero volume so we can restore after unmute
  let savedVolume = 1;

  // Audio processing setup using Web Audio API
  let audioContext = null;
  let audioSource = null;
  let compressor = null;
  let gainNode = null;
  let vocalReducer = null;
  let isAudioProcessing = false;

  function formatTime(d) {
    return d.toLocaleTimeString();
  }

  // Given a Date, compute which part index (0=p1,1=p2,2=p3) and offset seconds into that part
  function computePartAndOffset(date) {
    // base reference: period starts at 25:00. We'll compute seconds since 25:00 of the same repeating cycle.
    const base = new Date(date);
    base.setHours(1, 0, 0, 0);
    if (date < base) {
      // use previous day's 25:00 so diff is positive
      base.setDate(base.getDate() - 1);
    }
    let diffSeconds = Math.floor((date.getTime() - base.getTime()) / 1000);

    // wrap to [0, 86400)
    diffSeconds = ((diffSeconds % 86400) + 86400) % 86400;

    const partIndex = Math.floor(diffSeconds / PART_LENGTH_SECONDS); // 0,1,2
    const offset = diffSeconds % PART_LENGTH_SECONDS;
    return { partIndex, offset };
  }

  function partIndexToKey(i) {
    return ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'][i] || 'p1';
  }

  let lastPartIndex = null;

  // Compute full day offset (0-86399 seconds) for HLS mode
  function computeDayOffset(date) {
    const base = new Date(date);
    base.setHours(1, 0, 0, 0);
    if (date < base) {
      base.setDate(base.getDate() - 1);
    }
    let diffSeconds = Math.floor((date.getTime() - base.getTime()) / 1000);
    // wrap to [0, 86400)
    diffSeconds = ((diffSeconds % 86400) + 86400) % 86400;
    return diffSeconds;
  }

  // Fallback from HLS to MP4 mode
  function fallbackToMP4() {
    if (hlsFailed) return; // Already failed, avoid loops
    
    console.warn('HLS failed, falling back to MP4 mode...');
    hlsFailed = true;
    hlsReady = false;
    
    // Cleanup HLS instance
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }
    
    // Clear video source
    video.src = '';
    video.load();
    
    // Switch to best available MP4 mode
    if (has6Parts) {
      playbackMode = 'mp4-6';
    } else if (has3Parts) {
      playbackMode = 'mp4-3';
    } else {
      console.error('No fallback MP4 sources available!');
      showHEVCWarning();
      return;
    }
    
    // Update part length for new mode
    PART_LENGTH_SECONDS = getPartLengthSeconds();
    lastPartIndex = null; // Force reload
    
    console.log('Switched to playback mode:', playbackMode);
    
    // Trigger resync with new mode
    resyncOnce();
  }

  // Initialize HLS.js for m3u8 playback
  function initHLS() {
    if (hlsInstance) return Promise.resolve();
    if (hlsFailed) return Promise.reject(new Error('HLS already failed, using fallback'));
    
    return new Promise((resolve, reject) => {
      // Check if HLS.js is already loaded
      if (typeof Hls !== 'undefined') {
        createHLSInstance(resolve, reject);
        return;
      }
      
      // Dynamically load HLS.js library
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
      // Check if native HLS is supported (Safari)
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Use native HLS, but still set up error handling
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
      startLevel: -1, // auto quality
      enableWorker: true, // Enable worker for better performance
      // Allow HEVC if browser supports it
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
            // Try to recover from network error once
            console.warn('HLS network error, attempting recovery...');
            hlsInstance.startLoad();
            // If still failing, fallback after a delay
            setTimeout(() => {
              if (!hlsReady) {
                fallbackToMP4();
              }
            }, 5000);
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            // Handle specific codec errors
            if (data.details === 'bufferAddCodecError') {
               console.warn('Browser does not support this codec (likely HEVC). Falling back to MP4.');
               hlsCodecUnsupported = true;
               fallbackToMP4();
               break;
            }
            // Try to recover from other media errors
            console.warn('HLS media error, attempting recovery...');
            hlsInstance.recoverMediaError();
            break;
          default:
            // Unrecoverable error, fallback to MP4
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

  // Seek to position for HLS mode
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

  // Load the right src and seek to offset. Returns a Promise that resolves when seek done.
  function loadAndSeekTo(partIndex, offsetSeconds) {
    const key = partIndexToKey(partIndex);
    const src = sources[key];
    if (!src) return Promise.reject(new Error('Missing source for part ' + key));

    return new Promise((resolve, reject) => {
      // If same video and metadata is loaded, just set currentTime
      const doSeek = () => {
        // clamp offset to available duration if we can
        try {
          if (video.duration && offsetSeconds > video.duration) {
            // if duration smaller than expected, wrap around modulo duration
            offsetSeconds = offsetSeconds % video.duration;
          }
        } catch (e) {
          // ignore
        }

        function onSeeked() {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        }

        video.addEventListener('seeked', onSeeked);
        // Some browsers will throw if setting currentTime before metadata is ready.
        try {
          video.currentTime = Math.max(0, offsetSeconds);
        } catch (err) {
          // fallback: wait a moment and try again
          setTimeout(() => {
            try { video.currentTime = Math.max(0, offsetSeconds); } catch (e) {}
          }, 300);
        }
      };

      if (!video.src || !video.src.endsWith(src)) {
        lastPartIndex = partIndex;
        video.src = src;
        // Ensure metadata loads so we can seek
        video.load();
        video.addEventListener('loadedmetadata', function onMeta() {
          video.removeEventListener('loadedmetadata', onMeta);
          doSeek();
          // ensure play (autoplay might be blocked unless muted; we set muted in HTML)
          video.play().catch(() => {});
        });
      } else {
        // same src; if metadata ready, seek immediately
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

  // Unmute UX: show unmute button when video is muted. Clicking will unmute and attempt play.
  // Controls UI
  function volumeIconForLevel(v, muted) {
    if (muted || v === 0) return '🔇';
    if (v < 0.33) return '🔈';
    if (v < 0.66) return '🔉';
    return '🔊';
  }

  function updateControlsUI() {
    // (no play/pause UI here per UX decision)
    // mute button icon and aria
    if (muteBtn) {
      const icon = volumeIconForLevel(video.volume, video.muted);
      muteBtn.textContent = icon;
      muteBtn.setAttribute('aria-pressed', String(!video.muted));
      muteBtn.title = video.muted ? 'Muted — click to unmute' : 'Click to mute';
    }
    // volume slider reflect current volume
    if (volumeSlider) {
      // when muted, visually show 0; otherwise show actual volume
      volumeSlider.value = video.muted ? '0' : String(video.volume);
    }
    // tz label
    if (tzLabelEl) tzLabelEl.textContent = timezoneMode === 'local' ? 'Local' : 'Tokyo';
  }

  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      // toggle mute
      if (!video.muted) {
        // muting: save current volume and set slider to 0 (visual cue)
        savedVolume = video.volume || savedVolume || 1;
        video.muted = true;
        if (volumeSlider) volumeSlider.value = '0';
      } else {
        // unmuting: restore previous volume
        video.muted = false;
        video.volume = savedVolume || 1;
        if (volumeSlider) volumeSlider.value = String(video.volume);
        // user gesture: try to play with audio
        video.play().catch(() => {});
      }
      updateControlsUI();
      saveSettings();
    });
  }

  if (volumeSlider) {
    // initialize slider value when available
    volumeSlider.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      const vol = isNaN(v) ? 1 : v;
      video.volume = vol;
      if (vol > 0) {
        // unmute when slider > 0
        video.muted = false;
        savedVolume = vol;
      } else {
        // if slider set to 0, mute
        video.muted = true;
      }
      updateControlsUI();
      saveSettings();
    });
  }
  // play/pause and speed selector removed per user request

  // Fullscreen / orientation toggle (shared handler)
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

  if (tzToggleBtn) {
    tzToggleBtn.addEventListener('click', () => {
      timezoneMode = timezoneMode === 'local' ? 'tokyo' : 'local';
      updateControlsUI();
      showVideoLoader();
      // immediate resync with new timezone
      resyncOnce();
      saveSettings();
    });
  }

  // Audio processing functions
  function initAudioProcessing() {
    if (audioContext) return; // Already initialized
    
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioSource = audioContext.createMediaElementSource(video);
      
      // Create compressor (limiter) - set threshold to -40dB
      compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -40; // -40dB threshold
      compressor.knee.value = 0; // Hard knee for limiting
      compressor.ratio.value = 20; // High ratio for limiting
      compressor.attack.value = 0.003; // Fast attack
      compressor.release.value = 0.25; // Release time
      
      // Create gain node
      gainNode = audioContext.createGain();
      gainNode.gain.value = 1.3;
      
      // Create vocal reducer using peaking filter for 300Hz-3kHz range
      // We'll use multiple filters to cover the vocal range
      const vocalFilter1 = audioContext.createBiquadFilter();
      vocalFilter1.type = 'peaking';
      vocalFilter1.frequency.value = 800; // Center frequency for lower vocals
      vocalFilter1.Q.value = 1.0;
      vocalFilter1.gain.value = -8; // -8dB reduction
      
      const vocalFilter2 = audioContext.createBiquadFilter();
      vocalFilter2.type = 'peaking';
      vocalFilter2.frequency.value = 2000; // Center frequency for upper vocals
      vocalFilter2.Q.value = 1.0;
      vocalFilter2.gain.value = -8; // -8dB reduction
      
      // Connect the chain: source -> compressor -> gain -> vocal filters -> destination
      audioSource.connect(compressor);
      compressor.connect(gainNode);
      gainNode.connect(vocalFilter1);
      vocalFilter1.connect(vocalFilter2);
      
      // Store reference to final filter for easy disconnect
      vocalReducer = vocalFilter2;
    } catch (e) {
      console.error('Failed to initialize audio processing:', e);
      audioContext = null;
    }
  }

  function toggleAudioProcessing() {
    if (!audioContext) {
      initAudioProcessing();
      if (!audioContext) return; // Failed to initialize
    }
    
    try {
      if (isAudioProcessing) {
        // Disconnect processing chain and connect directly to destination
        vocalReducer.disconnect();
        audioSource.disconnect();
        audioSource.connect(audioContext.destination);
        isAudioProcessing = false;
      } else {
        // Connect through processing chain
        audioSource.disconnect();
        audioSource.connect(compressor);
        vocalReducer.connect(audioContext.destination);
        isAudioProcessing = true;
      }
      
      // Update button UI
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

  // Audio processing button event listener
  if (audioProcessBtn) {
    audioProcessBtn.addEventListener('click', toggleAudioProcessing);
  }

  // Persist settings to localStorage
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
    } catch (e) {
      // ignore
    }
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.volume === 'number') video.volume = s.volume;
      if (typeof s.muted === 'boolean') video.muted = s.muted;
      if (s.timezoneMode) timezoneMode = s.timezoneMode;
      // Load audio processing setting (will be applied after user interaction)
      if (typeof s.audioProcessing === 'boolean' && s.audioProcessing) {
        // Defer enabling audio processing until after first user interaction
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
      // reflect UI (no playbackRate control)
    } catch (e) {
      // ignore
    }
  }

  // Desired behavior: keep the playback matched to local clock. Periodically check and correct drift.
  function getNowByMode() {
    if (timezoneMode === 'local') return new Date();
    // Tokyo: compute from UTC +9
    const utcMs = Date.now() + new Date().getTimezoneOffset() * 60000;
    const tokyoMs = utcMs + 9 * 3600 * 1000;
    return new Date(tokyoMs);
  }

  function resyncOnce() {
    const now = getNowByMode();
    localTimeEl.textContent = formatTime(now);

    if (playbackMode === 'hls' && !hlsFailed) {
      // HLS mode: use full day offset (0-86399 seconds)
      const dayOffset = computeDayOffset(now);

      // Initialize HLS if not ready
      if (!hlsReady) {
        // Don't retry if codec is unsupported or already failed
        if (hlsCodecUnsupported || hlsFailed) {
          // fallbackToMP4 should have been called already
          return;
        }
        initHLS().then(() => {
          hlsSeekTo(dayOffset).then(() => {
            video.play().catch(() => {});
          });
        }).catch((err) => {
          console.warn('HLS init failed:', err);
          // fallbackToMP4 is called inside initHLS on error
        });
        return;
      }

      // Check drift for HLS
      const current = video.currentTime || 0;
      const drift = Math.abs(current - dayOffset);
      if (drift > 30) {
        hlsSeekTo(dayOffset).catch(console.warn);
      }
      if (video.paused) video.play().catch(() => {});
      updateControlsUI();
    } else {
      // MP4 mode (both 3-part and 6-part)
      const { partIndex, offset } = computePartAndOffset(now);

      const desired = offset;

      // If part changed, load new source and seek
      if (lastPartIndex === null || lastPartIndex !== partIndex) {
        return loadAndSeekTo(partIndex, desired).catch(console.warn).finally(updateControlsUI);
      }

      // Same part: check drift
      const current = video.currentTime || 0;
      const drift = Math.abs(current - desired);
      // allow a small tolerance (30 seconds)
      if (drift > 30) {
        // seek to correct position
        try {
          video.currentTime = desired;
        } catch (e) {
          // if not ready, attempt load/seek sequence
          loadAndSeekTo(partIndex, desired).catch(console.warn);
        }
      }
      // ensure playing
      if (video.paused) video.play().catch(() => {});
      updateControlsUI();
    }
  }

  // initial setup
  // ensure default muted state and slider reflect current volume
  if (typeof video.muted === 'undefined') video.muted = true;
  // load persisted settings (if any) before updating UI
  loadSettings();
  if (!volumeSlider) {
    // nothing
  } else {
    // set initial slider to video.volume (default 1)
    volumeSlider.value = String(video.volume || 1);
  }
  updateControlsUI();
  // initial sync when script loads

  // --- HEVC (H.265) 支持检测 ---
  function browserSupportsHEVC() {
    // Common HEVC codec strings
    const types = [
      'video/mp4; codecs="hvc1"',
      'video/mp4; codecs="hev1"',
      'video/mp4; codecs="hev1.1.6.L93.B0"',
      'video/mp4; codecs="hvc1.1.L63.B0"'
    ];

    // Prefer MediaSource.isTypeSupported when available
    try {
      if (window.MediaSource && typeof MediaSource.isTypeSupported === 'function') {
        for (const t of types) {
          try {
            if (MediaSource.isTypeSupported(t)) return true;
          } catch (e) {
            // ignore individual errors
          }
        }
      }
    } catch (e) {}

    // Fallback: use video.canPlayType
    try {
      for (const t of types) {
        const r = video.canPlayType(t);
        if (r === 'probably' || r === 'maybe') return true;
      }
    } catch (e) {}

    return false;
  }

  function showHEVCWarning() {
    // create a dismissible banner near the top of the app
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
    // insert into #app if present, otherwise body
    const app = document.getElementById('app') || document.body;
    app.appendChild(container);
    // clicking the warning must not toggle the overlay or unmute the video
    container.addEventListener('click', (e) => e.stopPropagation());
  }

  // Run detection and show message if unsupported
  // try {
  //   if (!browserSupportsHEVC()) {
  //     // Delay slightly to avoid layout flash while other inits run
  //     setTimeout(showHEVCWarning, 80);
  //   }
  // } catch (e) {
  //   // safe fallback: don't block the app
  //   console.warn('HEVC detection error', e);
  // }

  resyncOnce();

  // resync every 5 seconds to correct drift and to handle boundary changes
  setInterval(resyncOnce, 5000);

  // update clock display every second (respecting timezone mode)
  setInterval(() => {
    const now = getNowByMode();
    localTimeEl.textContent = formatTime(now);
  }, 1000);

  // Click behavior: toggle overlay visibility and unmute on first user gesture.
  // When the page autoplays muted due to browser policy, the first user click should
  // be able to unmute and resume playback with audio. Also clicking the video toggles
  // showing/hiding the overlay. Clicks on the overlay itself (controls) won't propagate
  // to the video so users can interact with controls normally.
  const overlay = document.getElementById('overlay');
  let firstUserClick = true;

  function toggleOverlay() {
    if (!overlay) return;
    overlay.classList.toggle('hidden');
  }

  // Video click: unmute on first interaction if muted, then toggle overlay
  video.addEventListener('click', (e) => {
    // first user gesture: attempt to unmute if currently muted
    if (firstUserClick) {
      if (video.muted) {
        // restore last saved volume (or 1) and unmute
        video.muted = false;
        video.volume = savedVolume || 1;
        // play with sound (user gesture)
        video.play().catch(() => {});
        updateControlsUI();
      }
      firstUserClick = false;
    }
    // toggle overlay visibility
    toggleOverlay();
  });

  // Prevent clicks inside overlay (controls area) from bubbling to the video
  if (overlay) {
    overlay.addEventListener('click', (ev) => {
      // allow interactions with buttons/inputs inside overlay but stop propagation
      ev.stopPropagation();
    });
  }

  // Keyboard shortcuts: only M (mute) and F (fullscreen). Do not alter play/pause or seek.
  document.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    const tag = active && active.tagName && active.tagName.toLowerCase();
    // don't intercept when typing into inputs/selects/textareas
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

  // --- Pomodoro Timer Logic ---
  (() => {
    const pomodoroBtn = document.getElementById('pomodoroBtn');
    const pomodoroPanel = document.getElementById('pomodoroPanel');
    const pomodoroCloseBtn = document.getElementById('pomodoroCloseBtn');
    const toggleClockWidgetBtn = document.getElementById('toggleClockWidget');
    const worldClockSection = document.getElementById('worldClockSection');
    const pomodoroDisplay = document.getElementById('pomodoroDisplay');
    const pomodoroStatus = document.querySelector('.pomodoro-status');
    const startBtn = document.getElementById('pomodoroStartBtn');
    const pauseBtn = document.getElementById('pomodoroPauseBtn');
    const resetBtn = document.getElementById('pomodoroResetBtn');
    const workDurationInput = document.getElementById('workDuration');
    const shortBreakInput = document.getElementById('shortBreak');
    const longBreakInput = document.getElementById('longBreak');
    const pomodoroRound = document.getElementById('pomodoroRound');

    // World Clock elements - Time.is style
    const localHoursEl = document.getElementById('localHours');
    const localMinutesEl = document.getElementById('localMinutes');
    const localSecondsEl = document.getElementById('localSeconds');
    const localMillisecondsEl = document.getElementById('localMilliseconds');
    const localDateEl = document.getElementById('localDate');

    // Configurable World Clocks
    const clockSelects = [
      document.getElementById('clock1Select'),
      document.getElementById('clock2Select'),
      document.getElementById('clock3Select')
    ];

    const clockTimeEls = [
      document.getElementById('clock1Time'),
      document.getElementById('clock2Time'),
      document.getElementById('clock3Time')
    ];

    const AVAILABLE_TIMEZONES = [
      { label: '东京 🗼', zone: 'Asia/Tokyo' },
      { label: '纽约 🗽', zone: 'America/New_York' },
      { label: '伦敦 🏰', zone: 'Europe/London' },
      { label: '巴黎 🗼', zone: 'Europe/Paris' },
      { label: '洛杉矶 🌴', zone: 'America/Los_Angeles' },
      { label: '悉尼 🐨', zone: 'Australia/Sydney' },
      { label: '上海 🐼', zone: 'Asia/Shanghai' },
      { label: '迪拜 🏙️', zone: 'Asia/Dubai' },
      { label: '莫斯科 🏰', zone: 'Europe/Moscow' },
      { label: '新加坡 🦁', zone: 'Asia/Singapore' },
      { label: '首尔 🏯', zone: 'Asia/Seoul' },
      { label: '温哥华 🍁', zone: 'America/Vancouver' },
      { label: '圣保罗 🇧🇷', zone: 'America/Sao_Paulo' },
      { label: 'UTC 🌍', zone: 'UTC' }
    ];

    // Default selections
    let selectedTimeZones = ['Asia/Tokyo', 'America/New_York', 'Europe/London'];

    // Load saved timezones
    try {
      const saved = localStorage.getItem('worldClockTimeZones');
      if (saved) {
        selectedTimeZones = JSON.parse(saved);
      }
    } catch (e) {}

    // Initialize selects
    clockSelects.forEach((select, index) => {
      if (!select) return;

      // Populate options
      AVAILABLE_TIMEZONES.forEach(tz => {
        const option = document.createElement('option');
        option.value = tz.zone;
        option.textContent = tz.label;
        select.appendChild(option);
      });

      // Set selected value
      if (selectedTimeZones[index]) {
        select.value = selectedTimeZones[index];
      }

      // Add change listener
      select.addEventListener('change', (e) => {
        selectedTimeZones[index] = e.target.value;
        localStorage.setItem('worldClockTimeZones', JSON.stringify(selectedTimeZones));
        updateWorldClocks();
      });
    });

    if (!pomodoroBtn || !pomodoroPanel) return;

    let timer = null;
    let remainingSeconds = 25 * 60;
    let isRunning = false;
    let currentMode = 'work'; // 'work', 'short-break', 'long-break'
    let workRounds = 0;
    const maxRounds = 4;
    let clockWidgetVisible = false;

    // SessionStorage keys for Pomodoro
    const POMODORO_STORAGE_KEYS = {
      REMAINING: 'pomodoro_remaining',
      MODE: 'pomodoro_mode',
      ROUNDS: 'pomodoro_rounds',
      IS_RUNNING: 'pomodoro_isRunning'
    };

    // Save pomodoro state to sessionStorage
    function savePomodoroState() {
      try {
        sessionStorage.setItem(POMODORO_STORAGE_KEYS.REMAINING, remainingSeconds);
        sessionStorage.setItem(POMODORO_STORAGE_KEYS.MODE, currentMode);
        sessionStorage.setItem(POMODORO_STORAGE_KEYS.ROUNDS, workRounds);
        sessionStorage.setItem(POMODORO_STORAGE_KEYS.IS_RUNNING, isRunning);
      } catch (e) {
        console.warn('Failed to save pomodoro state:', e);
      }
    }

    // Load pomodoro state from sessionStorage
    function loadPomodoroState() {
      try {
        const savedRemaining = sessionStorage.getItem(POMODORO_STORAGE_KEYS.REMAINING);
        const savedMode = sessionStorage.getItem(POMODORO_STORAGE_KEYS.MODE);
        const savedRounds = sessionStorage.getItem(POMODORO_STORAGE_KEYS.ROUNDS);
        const savedRunning = sessionStorage.getItem(POMODORO_STORAGE_KEYS.IS_RUNNING);

        if (savedRemaining !== null) {
          remainingSeconds = parseInt(savedRemaining);
        }
        if (savedMode !== null) {
          currentMode = savedMode;
        }
        if (savedRounds !== null) {
          workRounds = parseInt(savedRounds);
        }

        updateDisplay();

        // If it was running, resume the timer
        if (savedRunning === 'true') {
          startTimer();
        }
      } catch (e) {
        console.warn('Failed to load pomodoro state:', e);
      }
    }

    // Toggle clock widget visibility
    function toggleClockWidget() {
      clockWidgetVisible = !clockWidgetVisible;
      if (worldClockSection) {
        worldClockSection.classList.toggle('collapsed', !clockWidgetVisible);
      }
      if (toggleClockWidgetBtn) {
        toggleClockWidgetBtn.classList.toggle('active', clockWidgetVisible);
      }
      // Save preference
      try {
        localStorage.setItem('clockWidgetVisible', clockWidgetVisible);
      } catch (e) {}
    }

    // Load saved preference
    try {
      const saved = localStorage.getItem('clockWidgetVisible');
      if (saved !== null) {
        clockWidgetVisible = saved === 'true';
        if (worldClockSection) {
          worldClockSection.classList.toggle('collapsed', !clockWidgetVisible);
        }
        if (toggleClockWidgetBtn) {
          toggleClockWidgetBtn.classList.toggle('active', clockWidgetVisible);
        }
      } else {
        // Default: show clock widget
        clockWidgetVisible = true;
      }
    } catch (e) {}

    if (toggleClockWidgetBtn) {
      toggleClockWidgetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleClockWidget();
      });
    }

    // High-precision World Clock Update with milliseconds
    function updateWorldClocks() {
      const now = new Date();
      const ms = now.getMilliseconds();

      // Local time with milliseconds
      if (localHoursEl && localMinutesEl && localSecondsEl && localMillisecondsEl) {
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const milliseconds = '.' + String(ms).padStart(3, '0');

        localHoursEl.textContent = hours;
        localMinutesEl.textContent = minutes;
        localSecondsEl.textContent = seconds;
        localMillisecondsEl.textContent = milliseconds;
      }

      // Local date
      if (localDateEl) {
        const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
        const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${weekdays[now.getDay()]}`;
        localDateEl.textContent = dateStr;
      }

      // Update configurable clocks
      clockTimeEls.forEach((el, index) => {
        if (!el) return;
        const zone = selectedTimeZones[index];
        if (!zone) return;

        try {
          const time = new Date(now.toLocaleString('en-US', { timeZone: zone }));
          const h = String(time.getHours()).padStart(2, '0');
          const m = String(time.getMinutes()).padStart(2, '0');
          const s = String(time.getSeconds()).padStart(2, '0');
          el.textContent = `${h}:${m}:${s}`;
        } catch (e) {
          el.textContent = '--:--:--';
        }
      });
    }

    // Update world clocks immediately and then every 50ms for smooth milliseconds
    updateWorldClocks();
    setInterval(updateWorldClocks, 50);

    function formatTime(seconds) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    function updateDisplay() {
      pomodoroDisplay.textContent = formatTime(remainingSeconds);
      pomodoroRound.textContent = `${workRounds} / ${maxRounds}`;

      // Update status text
      if (currentMode === 'work') {
        pomodoroStatus.textContent = '工作时间 🎯';
        pomodoroDisplay.style.color = '#ff6b6b';
      } else if (currentMode === 'short-break') {
        pomodoroStatus.textContent = '短休息 ☕';
        pomodoroDisplay.style.color = '#51cf66';
      } else if (currentMode === 'long-break') {
        pomodoroStatus.textContent = '长休息 🌟';
        pomodoroDisplay.style.color = '#339af0';
      }
    }

    function startTimer() {
      if (isRunning) return;
      isRunning = true;
      startBtn.disabled = true;
      pauseBtn.disabled = false;
      savePomodoroState(); // Save state

      timer = setInterval(() => {
        remainingSeconds--;
        updateDisplay();
        savePomodoroState(); // Save state on each tick

        if (remainingSeconds <= 0) {
          clearInterval(timer);
          isRunning = false;
          savePomodoroState(); // Save state
          handleTimerComplete();
        }
      }, 1000);
    }

    function pauseTimer() {
      if (!isRunning) return;
      clearInterval(timer);
      isRunning = false;
      startBtn.disabled = false;
      pauseBtn.disabled = true;
      savePomodoroState(); // Save state
    }

    function resetTimer() {
      pauseTimer();
      currentMode = 'work';
      remainingSeconds = parseInt(workDurationInput.value) * 60;
      workRounds = 0;
      updateDisplay();
      startBtn.disabled = false;
      pauseBtn.disabled = true;
      savePomodoroState(); // Save state
    }

    function handleTimerComplete() {
      // Play notification sound (browser notification)
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          const title = currentMode === 'work' ? '工作完成!' : '休息结束!';
          const body = currentMode === 'work' ? '该休息一下了 ☕' : '开始下一个番茄钟 🍅';
          new Notification(title, { body, icon: '🍅' });
        }
      } catch (e) {
        console.warn('Notification error:', e);
      }

      // Switch modes
      if (currentMode === 'work') {
        workRounds++;
        // Track achievement
        if (window.achievementSystem) {
          window.achievementSystem.incrementPomodoro();
          // Add focus time (25 mins or custom)
          const duration = parseInt(workDurationInput.value) * 60;
          window.achievementSystem.addFocusTime(duration);
        }
        
        if (workRounds >= maxRounds) {
          currentMode = 'long-break';
          remainingSeconds = parseInt(longBreakInput.value) * 60;
          workRounds = 0;
        } else {
          currentMode = 'short-break';
          remainingSeconds = parseInt(shortBreakInput.value) * 60;
        }
      } else {
        currentMode = 'work';
        remainingSeconds = parseInt(workDurationInput.value) * 60;
      }

      updateDisplay();
      startBtn.disabled = false;
      pauseBtn.disabled = true;
      savePomodoroState(); // Save state after mode switch
    }

    function togglePanel() {
      pomodoroPanel.classList.toggle('hidden');
    }

    // Event listeners
    pomodoroBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePanel();
      // Request notification permission if not granted
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    });

    pomodoroCloseBtn.addEventListener('click', () => {
      togglePanel();
    });

    startBtn.addEventListener('click', startTimer);
    pauseBtn.addEventListener('click', pauseTimer);
    resetBtn.addEventListener('click', resetTimer);

    // Update timer duration when settings change (only when not running)
    workDurationInput.addEventListener('change', () => {
      if (!isRunning && currentMode === 'work') {
        remainingSeconds = parseInt(workDurationInput.value) * 60;
        updateDisplay();
      }
    });

    shortBreakInput.addEventListener('change', () => {
      if (!isRunning && currentMode === 'short-break') {
        remainingSeconds = parseInt(shortBreakInput.value) * 60;
        updateDisplay();
      }
    });

    longBreakInput.addEventListener('change', () => {
      if (!isRunning && currentMode === 'long-break') {
        remainingSeconds = parseInt(longBreakInput.value) * 60;
        updateDisplay();
      }
    });

    // Prevent clicks inside panel from propagating
    pomodoroPanel.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Initialize display and load saved state
    updateDisplay();
    loadPomodoroState(); // Load saved state from sessionStorage
  })();

  // --- CD Player Logic ---
  (() => {
    const cdPlayerBtn = document.getElementById('cdPlayerBtn');
    const cdPlayerPanel = document.getElementById('cdPlayerPanel');
    const cdPlayerCloseBtn = document.getElementById('cdPlayerCloseBtn');
    const toggleVisualizationBtn = document.getElementById('toggleVisualization');
    const musicList = document.getElementById('musicList');
    const musicSearchInput = document.getElementById('musicSearchInput');
    const albumCover = document.getElementById('albumCover');
    const cdAnimation = document.getElementById('cdAnimation');
    const trackTitle = document.getElementById('trackTitle');
    const trackArtist = document.getElementById('trackArtist');
    const trackVocal = document.getElementById('trackVocal');
    const cdAudioPlayer = document.getElementById('cdAudioPlayer');
    const trackLoadingSpinner = document.getElementById('trackLoadingSpinner');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const shuffleBtn = document.getElementById('shuffleBtn');
    const repeatBtn = document.getElementById('repeatBtn');
    const progressBar = document.getElementById('progressBar');
    const currentTimeEl = document.getElementById('currentTime');
    const totalTimeEl = document.getElementById('totalTime');
    const cdVolumeSlider = document.getElementById('cdVolumeSlider');

    if (!cdPlayerBtn || !cdPlayerPanel) return;

    let musicData = [];
    let localMusicData = []; // Store imported local music
    let musicVocalsData = [];
    let musicTitlesZhCN = {}; // Chinese translations
    const gameCharacters = {
      1: '星乃一歌', 2: '天马咲希', 3: '望月穗波', 4: '日野森志步',
      5: '花里实乃里', 6: '桐谷遥', 7: '桃井爱莉', 8: '日野森雫',
      9: '小豆泽心羽', 10: '白石杏', 11: '东云彰人', 12: '青柳冬弥',
      13: '天马司', 14: '凤笑梦', 15: '草薙宁宁', 16: '神代类',
      17: '宵崎奏', 18: '朝比奈真冬', 19: '东云绘名', 20: '晓山瑞希',
      21: '初音未来', 22: '镜音铃', 23: '镜音连', 24: '巡音流歌', 25: 'MEIKO', 26: 'KAITO'
    };
    let filteredMusicData = [];
    let currentTrackIndex = -1;
    let currentMusicId = null; // Currently playing music ID (for tracking across category changes)
    let currentVocalId = null; // Currently selected vocal version
    let preferredVocalType = 'sekai'; // Default preference
    let preferredCharacterIds = []; // Preferred character IDs for next track selection
    let isPlaying = false;
    let isShuffleOn = false;
    let isRepeatOn = false;
    let pendingAutoPlay = false; // Flag to track if we should auto-play after loading
    let favorites = new Set(); // Set of favorite music IDs
    let playlists = []; // Array of { id, name, tracks: Set(musicIds) }
    let currentCategory = 'all'; // Current selected category or playlist ID

    // LocalStorage keys for CD Player
    const STORAGE_KEYS = {
      VOLUME: 'cdPlayer_volume',
      LAST_TRACK_ID: 'cdPlayer_lastTrackId', // Use musicId instead of index
      LAST_VOCAL_ID: 'cdPlayer_lastVocalId', // Also save vocal version
      SHUFFLE: 'cdPlayer_shuffle',
      REPEAT: 'cdPlayer_repeat',
      VOCAL_PREFERENCE: 'cdPlayer_vocalPreference',
      PREFERRED_CHARACTERS: 'cdPlayer_preferredCharacters',
      FAVORITES: 'cdPlayer_favorites',
      PLAYLISTS: 'cdPlayer_playlists'
    };

    // Save settings to localStorage
    function saveSettings() {
      try {
        localStorage.setItem(STORAGE_KEYS.VOLUME, cdAudioPlayer.volume);
        // Save musicId and vocalId instead of index
        if (currentMusicId !== null) {
          localStorage.setItem(STORAGE_KEYS.LAST_TRACK_ID, currentMusicId);
        }
        if (currentVocalId !== null) {
          localStorage.setItem(STORAGE_KEYS.LAST_VOCAL_ID, currentVocalId);
        }
        localStorage.setItem(STORAGE_KEYS.SHUFFLE, isShuffleOn);
        localStorage.setItem(STORAGE_KEYS.REPEAT, isRepeatOn);
        localStorage.setItem(STORAGE_KEYS.VOCAL_PREFERENCE, preferredVocalType);
        localStorage.setItem(STORAGE_KEYS.PREFERRED_CHARACTERS, JSON.stringify(preferredCharacterIds));
        localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify([...favorites]));

        // Serialize playlists (convert Sets to Arrays)
        const serializedPlaylists = playlists.map(p => ({
          id: p.id,
          name: p.name,
          tracks: [...p.tracks]
        }));
        localStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(serializedPlaylists));
      } catch (e) {
        console.warn('Failed to save CD player settings:', e);
      }
    }

    // Load settings from localStorage
    function loadSettings() {
      try {
        const savedVolume = localStorage.getItem(STORAGE_KEYS.VOLUME);
        if (savedVolume !== null) {
          const vol = parseFloat(savedVolume);
          cdAudioPlayer.volume = vol;
          if (cdVolumeSlider) cdVolumeSlider.value = vol;
        }

        const savedShuffle = localStorage.getItem(STORAGE_KEYS.SHUFFLE);
        if (savedShuffle !== null) {
          isShuffleOn = savedShuffle === 'true';
          if (shuffleBtn) shuffleBtn.classList.toggle('active', isShuffleOn);
        }

        const savedRepeat = localStorage.getItem(STORAGE_KEYS.REPEAT);
        if (savedRepeat !== null) {
          isRepeatOn = savedRepeat === 'true';
          if (repeatBtn) repeatBtn.classList.toggle('active', isRepeatOn);
          cdAudioPlayer.loop = isRepeatOn;
        }

        const savedVocalPref = localStorage.getItem(STORAGE_KEYS.VOCAL_PREFERENCE);
        if (savedVocalPref !== null) {
          preferredVocalType = savedVocalPref;
        }

        const savedCharacters = localStorage.getItem(STORAGE_KEYS.PREFERRED_CHARACTERS);
        if (savedCharacters !== null) {
          preferredCharacterIds = JSON.parse(savedCharacters) || [];
        }

        const savedFavorites = localStorage.getItem(STORAGE_KEYS.FAVORITES);
        if (savedFavorites !== null) {
          favorites = new Set(JSON.parse(savedFavorites));
        }

        const savedPlaylists = localStorage.getItem(STORAGE_KEYS.PLAYLISTS);
        if (savedPlaylists !== null) {
          const parsed = JSON.parse(savedPlaylists);
          playlists = parsed.map(p => ({
            id: p.id,
            name: p.name,
            tracks: new Set(p.tracks)
          }));
        }
      } catch (e) {
        console.warn('Failed to load CD player settings:', e);
      }
      return null;
    }

    // Restore last track by musicId (called after data is loaded)
    function restoreLastTrack() {
      try {
        const savedMusicId = localStorage.getItem(STORAGE_KEYS.LAST_TRACK_ID);
        const savedVocalId = localStorage.getItem(STORAGE_KEYS.LAST_VOCAL_ID);
        
        if (savedMusicId !== null) {
          // Find the index of the saved music in current filtered list
          const index = filteredMusicData.findIndex(m => m.id === parseInt(savedMusicId));
          if (index >= 0) {
            // Load the track with saved vocal version (if available)
            loadTrack(index, savedVocalId ? parseInt(savedVocalId) : null);
          }
        }
      } catch (e) {
        console.warn('Failed to restore last track:', e);
      }
    }

    // ============ 搜索辅助函数 ============

    // 预编译正则表达式
    const RE_FULLWIDTH_ALPHANUM = /[Ａ-Ｚａ-ｚ０-９]/g;
    const RE_FULLWIDTH_SPACE = /　/g;
    const RE_KATAKANA = /[\u30A1-\u30F6]/g;
    const RE_BRACKETS = /[「」『』【】〈〉《》（）()［］\[\]]/g;
    const RE_MULTI_SPACE = /\s+/g;
    const RE_ALL_SPACE = /\s/g;

    // 假名常量
    const KATAKANA_OFFSET = 0x30A1 - 0x3041;

    // 罗马音转换规则（按长度预排序，优先匹配长字符）
    const ROMAJI_RULES = [
      // 二字符规则（拗音）
      ['きゃ','kya'],['きゅ','kyu'],['きょ','kyo'],
      ['しゃ','sha'],['しゅ','shu'],['しょ','sho'],
      ['ちゃ','cha'],['ちゅ','chu'],['ちょ','cho'],
      ['にゃ','nya'],['にゅ','nyu'],['にょ','nyo'],
      ['ひゃ','hya'],['ひゅ','hyu'],['ひょ','hyo'],
      ['みゃ','mya'],['みゅ','myu'],['みょ','myo'],
      ['りゃ','rya'],['りゅ','ryu'],['りょ','ryo'],
      ['ぎゃ','gya'],['ぎゅ','gyu'],['ぎょ','gyo'],
      ['じゃ','ja'],['じゅ','ju'],['じょ','jo'],
      ['びゃ','bya'],['びゅ','byu'],['びょ','byo'],
      ['ぴゃ','pya'],['ぴゅ','pyu'],['ぴょ','pyo'],
      // 单字符
      ['あ','a'],['い','i'],['う','u'],['え','e'],['お','o'],
      ['か','ka'],['き','ki'],['く','ku'],['け','ke'],['こ','ko'],
      ['さ','sa'],['し','shi'],['す','su'],['せ','se'],['そ','so'],
      ['た','ta'],['ち','chi'],['つ','tsu'],['て','te'],['と','to'],
      ['な','na'],['に','ni'],['ぬ','nu'],['ね','ne'],['の','no'],
      ['は','ha'],['ひ','hi'],['ふ','fu'],['へ','he'],['ほ','ho'],
      ['ま','ma'],['み','mi'],['む','mu'],['め','me'],['も','mo'],
      ['や','ya'],['ゆ','yu'],['よ','yo'],
      ['ら','ra'],['り','ri'],['る','ru'],['れ','re'],['ろ','ro'],
      ['わ','wa'],['を','wo'],['ん','n'],
      ['が','ga'],['ぎ','gi'],['ぐ','gu'],['げ','ge'],['ご','go'],
      ['ざ','za'],['じ','ji'],['ず','zu'],['ぜ','ze'],['ぞ','zo'],
      ['だ','da'],['ぢ','di'],['づ','du'],['で','de'],['ど','do'],
      ['ば','ba'],['び','bi'],['ぶ','bu'],['べ','be'],['ぼ','bo'],
      ['ぱ','pa'],['ぴ','pi'],['ぷ','pu'],['ぺ','pe'],['ぽ','po'],
      ['ー','-'],
    ];

    // 构建快速查找 Map
    const ROMAJI_MAP = new Map(ROMAJI_RULES);
    const TWO_CHAR_ROMAJI = new Set(ROMAJI_RULES.filter(r => r[0].length === 2).map(r => r[0]));

    // 文本标准化
    function normalizeText(text) {
      if (!text) return '';
      
      return text
        .toLowerCase()
        .replace(RE_FULLWIDTH_ALPHANUM, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .replace(RE_FULLWIDTH_SPACE, ' ')
        .replace(RE_KATAKANA, c => String.fromCharCode(c.charCodeAt(0) - KATAKANA_OFFSET))
        .replace(RE_BRACKETS, ' ')
        .replace(RE_MULTI_SPACE, ' ')
        .trim();
    }

    // 假名转罗马音
    function toRomaji(text) {
      if (!text) return '';
      
      const normalized = normalizeText(text);
      const len = normalized.length;
      let result = '';
      
      for (let i = 0; i < len; i++) {
        // 尝试匹配两字符
        if (i + 1 < len) {
          const twoChar = normalized[i] + normalized[i + 1];
          if (TWO_CHAR_ROMAJI.has(twoChar)) {
            result += ROMAJI_MAP.get(twoChar);
            i++;
            continue;
          }
        }
        
        const char = normalized[i];
        
        // 促音处理
        if (char === 'っ' && i + 1 < len) {
          const next = ROMAJI_MAP.get(normalized[i + 1]);
          if (next?.[0]) result += next[0];
          continue;
        }
        
        result += ROMAJI_MAP.get(char) ?? char;
      }
      
      return result;
    }

    // 构建搜索索引
    function buildSearchIndex(musics, titles) {
      return musics.map(m => {
        const title = m.title || '';
        const titleZh = titles[m.id] || '';
        const composer = m.composer || '';
        const lyricist = m.lyricist || '';
        const pronunciation = m.pronunciation || '';
        
        // 预计算所有变体
        const titleNorm = normalizeText(title);
        const titleZhNorm = normalizeText(titleZh);
        const pronunciationNorm = normalizeText(pronunciation);
        const pronunciationRomaji = toRomaji(pronunciation);
        
        const variants = [
          titleNorm,
          titleZhNorm,
          normalizeText(composer),
          normalizeText(lyricist),
          pronunciationNorm,
          pronunciationRomaji,
          titleNorm.replace(RE_ALL_SPACE, ''),
          pronunciationRomaji.replace(RE_ALL_SPACE, ''),
        ].filter(Boolean);

        return {
          id: m.id,
          variants: [...new Set(variants)],
          _titleNorm: titleNorm,
          _titleZhNorm: titleZhNorm,
        };
      });
    }

    // 计算搜索评分
    function calculateScore(queryData, song) {
      const { norm, noSpace } = queryData;
      let maxScore = 0;
      
      for (const variant of song.variants) {
        let score = 0;
        
        if (variant === norm) {
          score = 1.0;
        } else if (variant.startsWith(norm) || variant.startsWith(noSpace)) {
          score = 0.9 - (variant.length - norm.length) * 0.01;
        } else if (variant.includes(norm) || variant.includes(noSpace)) {
          score = 0.7 - (variant.length - norm.length) * 0.005;
        } else if (norm.length >= 2) {
          let matches = 0;
          for (const c of norm) {
            if (variant.includes(c)) matches++;
          }
          if (matches >= norm.length * 0.7) {
            score = 0.3 + (matches / norm.length) * 0.3;
          }
        }
        
        if (score > maxScore) maxScore = score;
        if (maxScore >= 1.0) break;
      }
      
      // 标题加分
      if (song._titleNorm === norm || song._titleZhNorm === norm) {
        maxScore = Math.min(1.0, maxScore + 0.1);
      }
      
      return Math.round(maxScore * 1000) / 1000;
    }

    // 搜索索引缓存
    let searchIndexCache = null;

    // Helper to determine music category
    function getMusicCategory(music) {
      // Map categories based on Sekai logic

      // 1. Check for Sekai Unit (Human vocals)
      // A song belongs to a unit if it has a 'sekai' version sung by that unit.
      const sekaiVocal = musicVocalsData.find(v => v.musicId === music.id && v.musicVocalType === 'sekai');
      if (sekaiVocal) {
        // Get all game character IDs
        const charIds = sekaiVocal.characters
          .filter(c => c.characterType === 'game_character')
          .map(c => c.characterId);

        if (charIds.length === 0) {
          // No game characters
          return 'other';
        }

        // Check if this is a cross-unit collaboration (characters from multiple units)
        const units = new Set();
        charIds.forEach(id => {
          if (id >= 1 && id <= 4) units.add('leo_need');
          else if (id >= 5 && id <= 8) units.add('more_more_jump');
          else if (id >= 9 && id <= 12) units.add('vivid_bad_squad');
          else if (id >= 13 && id <= 16) units.add('wonderlands_x_showtime');
          else if (id >= 17 && id <= 20) units.add('25_ji_nightcord_de');
        });

        // If multiple units are involved, it's a cross-unit collaboration -> Other
        if (units.size > 1) {
          return 'other';
        }

        // Single unit song
        if (units.has('leo_need')) return 'leo_need';
        if (units.has('more_more_jump')) return 'more_more_jump';
        if (units.has('vivid_bad_squad')) return 'vivid_bad_squad';
        if (units.has('wonderlands_x_showtime')) return 'wonderlands_x_showtime';
        if (units.has('25_ji_nightcord_de')) return '25_ji_nightcord_de';
      }

      // 2. Special check: If music has vocals but all vocals have empty or missing characters
      // (Like some special event songs that have vocals but no credited singers)
      const allVocals = musicVocalsData.filter(v =>
        v.musicId === music.id &&
        v.musicVocalType !== 'instrumental'
      );

      if (allVocals.length > 0) {
        // Check if ALL vocals have no characters
        const allHaveNoCharacters = allVocals.every(v =>
          !v.characters || v.characters.length === 0
        );

        if (allHaveNoCharacters) {
          // All vocals exist but none have credited singers -> Other
          return 'other';
        }

        // Has vocals with characters -> Virtual Singer
        return 'virtual_singer';
      }

      // 3. No vocals at all (pure instrumental) -> Other
      return 'other';
    }

    // Filter music list based on category and search
    function filterMusicList(query = '') {
      let list = musicData.filter(music => {
        // Find any vocal for this music
        const hasVocal = musicVocalsData.some(
          vocal => vocal.musicId === music.id
        );
        return hasVocal;
      });

      // Filter by category
      if (currentCategory === 'favorites') {
        list = list.filter(music => favorites.has(music.id));
      } else if (currentCategory === 'local') {
        list = localMusicData;
      } else if (currentCategory === 'playlists') {
        // Special case: handled by displayPlaylists, but if we are here, it means we are searching
        // or filtering within "all playlists" context? No, 'playlists' category shows playlist grid.
        // If currentCategory is a specific playlist ID:
      } else if (currentCategory.startsWith('playlist_')) {
        const playlistId = currentCategory;
        const playlist = playlists.find(p => p.id === playlistId);
        if (playlist) {
          list = list.filter(music => playlist.tracks.has(music.id));
        } else {
          list = [];
        }
      } else if (currentCategory !== 'all') {
        list = list.filter(music => getMusicCategory(music) === currentCategory);
      }

      // Filter by search query using advanced search algorithm
      if (query) {
        // Build or use cached search index
        if (!searchIndexCache) {
          searchIndexCache = buildSearchIndex(musicData, musicTitlesZhCN);
        }
        
        // Create a map for quick lookup
        const indexMap = new Map(searchIndexCache.map(item => [item.id, item]));
        
        // Prepare query data
        const queryNorm = normalizeText(query);
        const queryData = {
          norm: queryNorm,
          noSpace: queryNorm.replace(RE_ALL_SPACE, ''),
        };
        
        // Score and filter
        const scoredList = [];
        for (const music of list) {
          const indexItem = indexMap.get(music.id);
          if (indexItem) {
            const score = calculateScore(queryData, indexItem);
            if (score > 0.2) {
              scoredList.push({ music, score });
            }
          }
        }
        
        // Sort by score (descending) and extract music
        scoredList.sort((a, b) => b.score - a.score);
        list = scoredList.map(item => item.music);
      }

      filteredMusicData = list;
      displayMusicList(filteredMusicData);
    }

    // IndexedDB for persisting local music files
    const DB_NAME = 'LocalMusicDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'localMusic';
    let db = null;

    // Initialize IndexedDB
    async function initDB() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
          console.error('IndexedDB error:', request.error);
          reject(request.error);
        };

        request.onsuccess = () => {
          db = request.result;
          resolve(db);
        };

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          }
        };
      });
    }

    // Save local music to IndexedDB
    async function saveLocalMusicToDB(musicInfo) {
      if (!db) await initDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        // Store the complete music info including the file
        const request = store.put(musicInfo);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    // Load all local music from IndexedDB
    async function loadLocalMusicFromDB() {
      if (!db) await initDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
          const items = request.result;
          // Recreate audioUrl from stored file
          items.forEach(item => {
            if (item.file) {
              item.audioUrl = URL.createObjectURL(item.file);
            }
          });
          resolve(items);
        };
        request.onerror = () => reject(request.error);
      });
    }

    // Delete local music from IndexedDB
    async function deleteLocalMusicFromDB(id) {
      if (!db) await initDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    // Initialize DB and load saved local music on startup
    (async () => {
      try {
        await initDB();
        const savedMusic = await loadLocalMusicFromDB();
        if (savedMusic.length > 0) {
          localMusicData.push(...savedMusic);
        }
      } catch (error) {
        console.error('Failed to load local music from database:', error);
      }
    })();

    // Dynamically load jsmediatags library
    let jsMediaTagsLoaded = false;
    async function loadJsMediaTags() {
      if (jsMediaTagsLoaded || window.jsmediatags) {
        return true;
      }

      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js';
          script.onload = () => {
            jsMediaTagsLoaded = true;
            resolve();
          };
          script.onerror = () => reject(new Error('Failed to load jsmediatags'));
          document.head.appendChild(script);
        });
        return true;
      } catch (error) {
        console.error('Failed to load jsmediatags library:', error);
        return false;
      }
    }

    // Import Local Music
    function importLocalMusic() {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = 'audio/*';

      input.onchange = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        // Show loading indicator
        musicList.innerHTML = '<div class="loading">正在加载库文件...</div>';

        // Load jsmediatags library
        const loaded = await loadJsMediaTags();
        if (!loaded) {
          musicList.innerHTML = '<div class="loading">加载元数据读取库失败，将使用文件名</div>';
          setTimeout(() => {
            if (currentCategory === 'local') {
              filterMusicList(musicSearchInput ? musicSearchInput.value.toLowerCase().trim() : '');
            }
          }, 1500);
        }

        musicList.innerHTML = '<div class="loading">正在读取文件信息...</div>';

        for (let index = 0; index < files.length; index++) {
          const file = files[index];
          const id = 'local_' + Date.now() + '_' + index;
          const audioUrl = URL.createObjectURL(file);

          // Default values
          let musicInfo = {
            id: id,
            title: file.name.replace(/\.[^/.]+$/, ""), // Remove extension
            composer: 'Unknown Artist',
            lyricist: '',
            album: 'Unknown Album',
            isLocal: true,
            file: file,
            audioUrl: audioUrl,
            assetbundleName: 'local',
            coverUrl: null
          };

          // Try to read metadata using jsmediatags
          if (loaded && window.jsmediatags) {
            try {
              await new Promise((resolve) => {
                window.jsmediatags.read(file, {
                  onSuccess: function (tag) {
                    const tags = tag.tags;

                    // Extract metadata
                    if (tags.title) musicInfo.title = tags.title;
                    if (tags.artist) musicInfo.composer = tags.artist;
                    if (tags.album) musicInfo.album = tags.album;

                    // Extract album cover
                    if (tags.picture) {
                      const picture = tags.picture;
                      let base64String = "";
                      for (let i = 0; i < picture.data.length; i++) {
                        base64String += String.fromCharCode(picture.data[i]);
                      }
                      musicInfo.coverUrl = `data:${picture.format};base64,${window.btoa(base64String)}`;
                    }

                    resolve();
                  },
                  onError: function (error) {
                    console.warn('Failed to read metadata for', file.name, error);
                    resolve(); // Continue with default values
                  }
                });
              });
            } catch (err) {
              console.warn('Error reading tags:', err);
            }
          }

          localMusicData.push(musicInfo);

          // Save to IndexedDB for persistence
          try {
            await saveLocalMusicToDB(musicInfo);
          } catch (error) {
            console.error('Failed to save music to database:', error);
          }
        }

        // Refresh list if currently viewing local music
        if (currentCategory === 'local') {
          filterMusicList(musicSearchInput ? musicSearchInput.value.toLowerCase().trim() : '');
        } else {
          // Switch to local category
          const localBtn = document.querySelector('.category-btn[data-category="local"]');
          if (localBtn) localBtn.click();
        }
      };

      input.click();
    }

    // Playlist Management Functions
    function createPlaylist() {
      const name = prompt('请输入歌单名称:');
      if (name && name.trim()) {
        const id = 'playlist_' + Date.now();
        playlists.push({
          id: id,
          name: name.trim(),
          tracks: new Set()
        });
        saveSettings();
        displayPlaylists();
      }
    }

    function deletePlaylist(id) {
      if (confirm('确定要删除这个歌单吗？')) {
        playlists = playlists.filter(p => p.id !== id);
        saveSettings();
        displayPlaylists();
      }
    }

    function addToPlaylist(musicId, buttonElement) {
      // Close any other open dropdowns
      document.querySelectorAll('.playlist-dropdown.show').forEach(dropdown => {
        dropdown.classList.remove('show');
      });

      // Show simple modal or prompt to select playlist
      if (playlists.length === 0) {
        if (confirm('还没有创建歌单，是否现在创建？')) {
          createPlaylist();
        }
        return;
      }

      // Create dropdown for selection
      const dropdown = document.createElement('div');
      dropdown.className = 'playlist-dropdown show';

      playlists.forEach(p => {
        const item = document.createElement('div');
        item.className = 'playlist-dropdown-item';
        const isAdded = p.tracks.has(musicId);

        const icon = document.createElement('span');
        icon.className = 'playlist-dropdown-icon';
        icon.textContent = '📂';

        const name = document.createElement('span');
        name.className = 'playlist-dropdown-name';
        name.textContent = p.name;

        const check = document.createElement('span');
        check.className = 'playlist-dropdown-check';
        check.textContent = isAdded ? '✓' : '';

        item.appendChild(icon);
        item.appendChild(name);
        item.appendChild(check);

        item.addEventListener('click', (e) => {
          e.stopPropagation();
          if (isAdded) {
            p.tracks.delete(musicId);
          } else {
            p.tracks.add(musicId);
          }
          saveSettings();
          dropdown.remove();
          // Refresh list if we are currently viewing this playlist
          if (currentCategory === p.id) {
            filterMusicList(musicSearchInput ? musicSearchInput.value.toLowerCase().trim() : '');
          }
        });

        dropdown.appendChild(item);
      });

      // New playlist option
      const newItem = document.createElement('div');
      newItem.className = 'playlist-dropdown-item create-new';

      const newIcon = document.createElement('span');
      newIcon.className = 'playlist-dropdown-icon';
      newIcon.textContent = '+';

      const newName = document.createElement('span');
      newName.className = 'playlist-dropdown-name';
      newName.textContent = '新建歌单';

      newItem.appendChild(newIcon);
      newItem.appendChild(newName);

      newItem.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.remove();
        createPlaylist();
      });

      dropdown.appendChild(newItem);

      // Position dropdown relative to the button
      const actionsContainer = buttonElement.closest('.music-item-actions');
      if (actionsContainer) {
        actionsContainer.appendChild(dropdown);
      }

      // Close dropdown when clicking outside - use capture phase and check immediately
      const closeDropdown = (e) => {
        // Check if dropdown still exists in DOM
        if (!document.body.contains(dropdown)) {
          document.removeEventListener('click', closeDropdown, true);
          return;
        }

        // Check if click is outside both the dropdown and the button
        if (!dropdown.contains(e.target) && !buttonElement.contains(e.target)) {
          dropdown.classList.remove('show');
          setTimeout(() => {
            if (document.body.contains(dropdown)) {
              dropdown.remove();
            }
          }, 150); // Wait for animation
          document.removeEventListener('click', closeDropdown, true);
        }
      };

      // Add listener in next tick to avoid immediate trigger
      setTimeout(() => {
        document.addEventListener('click', closeDropdown, true); // Use capture phase
      }, 0);

      // Also close when pressing Escape key
      const handleEscape = (e) => {
        if (e.key === 'Escape') {
          dropdown.classList.remove('show');
          setTimeout(() => dropdown.remove(), 150);
          document.removeEventListener('keydown', handleEscape);
        }
      };
      document.addEventListener('keydown', handleEscape);
    }

    function displayPlaylists() {
      musicList.innerHTML = '';

      const grid = document.createElement('div');
      grid.className = 'playlist-grid';

      // Create New Card
      const createCard = document.createElement('div');
      createCard.className = 'playlist-card create-new';
      createCard.innerHTML = `
        <div class="playlist-icon">✚</div>
        <div class="playlist-name">新建歌单</div>
      `;
      createCard.addEventListener('click', createPlaylist);
      grid.appendChild(createCard);

      // Playlist Cards
      playlists.forEach(p => {
        const card = document.createElement('div');
        card.className = 'playlist-card';
        card.innerHTML = `
          <div class="playlist-icon">📂</div>
          <div class="playlist-name">${p.name}</div>
          <div class="playlist-count">${p.tracks.size} 首歌曲</div>
        `;

        // Right click to delete
        card.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          deletePlaylist(p.id);
        });

        card.addEventListener('click', () => {
          currentCategory = p.id;
          // Update active category button visually (none of the main ones)
          document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
          // Maybe highlight the playlist folder button?
          const plBtn = document.querySelector('.category-btn[data-category="playlists"]');
          if (plBtn) plBtn.classList.add('active');

          filterMusicList('');
        });

        grid.appendChild(card);
      });

      musicList.appendChild(grid);
    }

    // Toggle favorite
    function toggleFavorite(musicId, btn) {
      if (favorites.has(musicId)) {
        favorites.delete(musicId);
        btn.classList.remove('active');
        btn.textContent = '☆';
        btn.title = '添加到收藏';
      } else {
        favorites.add(musicId);
        btn.classList.add('active');
        btn.textContent = '★';
        btn.title = '取消收藏';
      }
      saveSettings();

      // If currently viewing favorites, refresh list
      if (currentCategory === 'favorites') {
        filterMusicList(musicSearchInput ? musicSearchInput.value.toLowerCase().trim() : '');
      }
    }

    // Check if a music has vocals matching preferred characters
    function checkMusicHasPreferredCharacters(musicId) {
      if (!preferredCharacterIds || preferredCharacterIds.length === 0) return false;
      
      // Find vocals for this music that contain any of the preferred characters
      const matchingVocals = musicVocalsData.filter(v => {
        if (v.musicId !== musicId) return false;
        if (!v.characters || v.characters.length === 0) return false;
        
        const vocalCharIds = v.characters
          .filter(c => c.characterType === 'game_character')
          .map(c => c.characterId);
        
        // Check if any preferred character is in this vocal
        return preferredCharacterIds.some(prefId => vocalCharIds.includes(prefId));
      });
      
      return matchingVocals.length > 0;
    }

    // Check if a music has a specific vocal type
    function checkMusicHasVocalType(musicId, type) {
      if (!type) return true;
      return musicVocalsData.some(v => v.musicId === musicId && v.musicVocalType === type);
    }

    // Find next track index based on preference (character preference takes priority)
    function getNextTrackIndex(currentIndex, direction, isShuffle) {
      let attempts = 0;
      let nextIndex = currentIndex;
      const maxAttempts = filteredMusicData.length;

      if (isShuffle) {
        // First try to find music with preferred characters
        if (preferredCharacterIds.length > 0) {
          while (attempts < maxAttempts) {
            const r = Math.floor(Math.random() * filteredMusicData.length);
            const music = filteredMusicData[r];
            if (checkMusicHasPreferredCharacters(music.id)) {
              return r;
            }
            attempts++;
          }
        }
        
        // Fallback to vocal type preference
        attempts = 0;
        while (attempts < maxAttempts) {
          const r = Math.floor(Math.random() * filteredMusicData.length);
          const music = filteredMusicData[r];
          if (checkMusicHasVocalType(music.id, preferredVocalType)) {
            return r;
          }
          attempts++;
        }
        return Math.floor(Math.random() * filteredMusicData.length);
      } else {
        // First try to find music with preferred characters
        if (preferredCharacterIds.length > 0) {
          while (attempts < maxAttempts) {
            nextIndex = (nextIndex + direction + filteredMusicData.length) % filteredMusicData.length;
            const music = filteredMusicData[nextIndex];
            if (checkMusicHasPreferredCharacters(music.id)) {
              return nextIndex;
            }
            attempts++;
          }
        }
        
        // Fallback to vocal type preference
        nextIndex = currentIndex;
        attempts = 0;
        while (attempts < maxAttempts) {
          nextIndex = (nextIndex + direction + filteredMusicData.length) % filteredMusicData.length;
          const music = filteredMusicData[nextIndex];
          if (checkMusicHasVocalType(music.id, preferredVocalType)) {
            return nextIndex;
          }
          attempts++;
        }
        return (currentIndex + direction + filteredMusicData.length) % filteredMusicData.length;
      }
    }

    // Format time helper
    function formatTime(seconds) {
      if (!isFinite(seconds)) return '0:00';
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${String(secs).padStart(2, '0')}`;
    }

    // Load music data from unified API
    async function loadMusicData() {
      try {
        musicList.innerHTML = '<div class="loading">加载音乐列表中...</div>';

        // Fetch unified music_data.json
        const response = await fetch('https://storage.nightcord.de5.net/music_data.json');
        if (!response.ok) throw new Error('Failed to fetch music data');
        const raw = await response.json();

        // Map compressed field names to full names
        // API v2 format: i=id, t=title, p=pronunciation, tz=titleZhCN, c=composer, l=lyricist, a=assetbundleName, f=fillerSec, v=vocals
        // vocals: i=id, t=type, c=caption, a=assetbundleName, ch=characters (array of [id, type])
        musicData = raw.m.map(m => ({
          id: m.i,
          title: m.t,
          pronunciation: m.p,
          titleZhCN: m.tz,
          composer: m.c,
          lyricist: m.l,
          assetbundleName: m.a,
          fillerSec: m.f || 0,
          vocals: m.v ? m.v.map(v => ({
            id: v.i,
            type: v.t,
            caption: v.c,
            assetbundleName: v.a,
            characters: v.ch ? v.ch.map(ch => ({
              id: ch[0],
              type: ch[1]
            })) : []
          })) : []
        }));

        // Build flattened musicVocalsData (add musicId to each vocal)
        musicVocalsData = [];
        musicData.forEach(music => {
          if (music.vocals) {
            music.vocals.forEach(vocal => {
              musicVocalsData.push({
                ...vocal,
                musicId: music.id,
                // Map to legacy field names for compatibility
                musicVocalType: vocal.type,
                characters: vocal.characters.map(c => ({
                  ...c,
                  characterType: c.type,
                  characterId: c.id
                }))
              });
            });
          }
        });

        // Build Chinese title mapping from inline titleZhCN
        musicTitlesZhCN = {};
        musicData.forEach(music => {
          if (music.titleZhCN) {
            musicTitlesZhCN[music.id] = music.titleZhCN;
          }
        });

        // Clear search index cache to rebuild with new data
        searchIndexCache = null;

        // Filter and prepare music list
        // Initial filter (just to populate filteredMusicData correctly for the first time)
        filterMusicList('');

        // Load saved settings first
        loadSettings();
        
        // Setup Media Session API handlers for system media controls
        setupMediaSessionHandlers();
        
        // Restore last track by musicId (instead of index)
        restoreLastTrack();
      } catch (error) {
        console.error('Error loading music data:', error);
        musicList.innerHTML = '<div class="loading">加载失败，请重试</div>';
      }
    }

    // Display music list
    function displayMusicList(list) {
      musicList.innerHTML = '';

      // Show Import button for Local Music category
      if (currentCategory === 'local') {
        const importBtn = document.createElement('div');
        importBtn.className = 'music-item import-item';
        importBtn.style.justifyContent = 'center';
        importBtn.style.cursor = 'pointer';
        importBtn.style.background = 'rgba(255, 255, 255, 0.1)';
        importBtn.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 20px;">📥</span>
            <span>导入本地音乐文件...</span>
          </div>
        `;
        importBtn.addEventListener('click', importLocalMusic);
        musicList.appendChild(importBtn);

        if (list.length === 0) {
          const tip = document.createElement('div');
          tip.style.padding = '20px';
          tip.style.textAlign = 'center';
          tip.style.color = 'rgba(255,255,255,0.5)';
          tip.textContent = '支持 MP3, FLAC, WAV 等格式';
          musicList.appendChild(tip);
          return;
        }
      } else if (list.length === 0) {
        musicList.innerHTML = '<div class="loading">没有找到歌曲</div>';
        return;
      }

      list.forEach((music, index) => {
        const item = document.createElement('div');
        item.className = 'music-item';
        // Use music.id to determine if this is the currently playing track
        if (currentMusicId === music.id) {
          item.classList.add('active');
        }

        // Always display original title + composer
        const displayTitle = music.title;
        let displayArtist = music.composer || 'Unknown';

        // For local music, show album info
        if (music.isLocal && music.album && music.album !== 'Unknown Album') {
          displayArtist = `${displayArtist} · ${music.album}`;
        }

        const isFav = favorites.has(music.id);
        const isLocal = music.isLocal;

        const escapeHtml = (text) => {
          const div = document.createElement('div');
          div.textContent = text;
          return div.innerHTML;
        };

        const escapedTitle = escapeHtml(displayTitle);
        const escapedArtist = escapeHtml(displayArtist);

        item.innerHTML = `
          <div class="music-item-content">
            <div class="music-item-title" data-full-text="${escapedTitle.replace(/"/g, '&quot;')}">${escapedTitle}</div>
            <div class="music-item-artist">${escapedArtist}</div>
          </div>
          <div class="music-item-actions" style="${isLocal ? '' : ''}">
            ${isLocal ? `
              <button class="delete-local-btn" title="删除">🗑️</button>
            ` : `
              <button class="add-to-playlist-btn" title="添加到歌单">✚</button>
              <button class="favorite-btn ${isFav ? 'active' : ''}" title="${isFav ? '取消收藏' : '添加到我喜欢的音乐'}">
                ${isFav ? '★' : '☆'}
              </button>
            `}
          </div>
        `;

        // Check if title is too long and add scrolling animation
        const titleElement = item.querySelector('.music-item-title');
        const contentElement = item.querySelector('.music-item-content');

        // Wait for DOM to render to measure width
        requestAnimationFrame(() => {
          const containerWidth = contentElement.clientWidth;
          const textWidth = titleElement.scrollWidth;

          if (textWidth > containerWidth) {
            titleElement.classList.add('scrolling');
            // Allow overflow to show scrolling text
            contentElement.style.overflow = 'visible';

            // Calculate how much to scroll: move left by (textWidth - containerWidth)
            // This ensures the entire text becomes visible
            const scrollDistance = -(textWidth - containerWidth);
            titleElement.style.setProperty('--scroll-distance', `${scrollDistance}px`);
          }
        });

        // Click on item content to play
        const content = item.querySelector('.music-item-content');
        content.addEventListener('click', () => {
          const trackIndex = filteredMusicData.indexOf(music);
          pendingAutoPlay = true; // Set flag to auto-play after loading
          loadTrack(trackIndex);
        });

        // Handle local music delete button
        if (isLocal) {
          const deleteBtn = item.querySelector('.delete-local-btn');
          if (deleteBtn) {
            deleteBtn.addEventListener('click', async (e) => {
              e.stopPropagation();
              if (confirm(`确定要删除「${music.title}」吗？`)) {
                try {
                  // Remove from IndexedDB
                  await deleteLocalMusicFromDB(music.id);

                  // Remove from local array
                  const idx = localMusicData.findIndex(m => m.id === music.id);
                  if (idx !== -1) {
                    // Revoke object URL to free memory
                    if (localMusicData[idx].audioUrl) {
                      URL.revokeObjectURL(localMusicData[idx].audioUrl);
                    }
                    localMusicData.splice(idx, 1);
                  }

                  // Refresh list
                  filterMusicList(musicSearchInput ? musicSearchInput.value.toLowerCase().trim() : '');

                  // Stop playback if this was the current track
                  if (currentMusicId === music.id) {
                    pauseTrack();
                    currentTrackIndex = -1;
                    currentMusicId = null;
                  }
                } catch (error) {
                  console.error('Failed to delete music:', error);
                  alert('删除失败，请重试');
                }
              }
            });
          }
        } else {
          // Click on add to playlist button
          const addBtn = item.querySelector('.add-to-playlist-btn');
          if (addBtn) {
            addBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              addToPlaylist(music.id, addBtn);
            });
          }

          // Click on favorite button
          const favBtn = item.querySelector('.favorite-btn');
          if (favBtn) {
            favBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              toggleFavorite(music.id, favBtn);
            });
          }
        }

        musicList.appendChild(item);
      });
    }

    // Category buttons
    const categoryBtns = document.querySelectorAll('.category-btn');
    categoryBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        // Update active state
        categoryBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update category and filter
        const cat = btn.dataset.category;

        if (cat === 'playlists') {
          currentCategory = 'playlists';
          displayPlaylists();
        } else {
          currentCategory = cat;
          filterMusicList(musicSearchInput ? musicSearchInput.value.toLowerCase().trim() : '');
        }
      });
    });

    // Search functionality
    if (musicSearchInput) {
      musicSearchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        filterMusicList(query);
      });
    }

    // Get character names for vocal
    function getVocalCharacterNames(vocal) {
      if (!vocal.characters || vocal.characters.length === 0) return '';

      const names = vocal.characters
        .filter(c => c.characterType === 'game_character')
        .map(c => gameCharacters[c.characterId])
        .filter(name => name !== undefined);

      return names.length > 0 ? names.join('・') : '';
    }

    // Load a track
    async function loadTrack(index, vocalId = null) {
      if (index < 0 || index >= filteredMusicData.length) return;

      currentTrackIndex = index;
      const music = filteredMusicData[index];
      currentMusicId = music.id; // Track the current music ID

      // Show loading spinner
      if (trackLoadingSpinner) trackLoadingSpinner.classList.remove('hidden');

      // Handle Local Music
      if (music.isLocal) {
        trackTitle.textContent = music.title;
        trackArtist.textContent = `${music.composer}${music.album ? ' · ' + music.album : ''}`;
        trackVocal.textContent = 'Local File';

        // Use cover from metadata if available, otherwise use placeholder
        if (music.coverUrl) {
          albumCover.src = music.coverUrl;
          albumCover.style.opacity = '1';
          albumCover.onload = () => {
            // Extract colors from loaded cover for visualizer
            dominantColors = extractColorsFromCover();
          };
        } else {
          albumCover.src = await getAssetUrl('/mysekai/music_record_soundtrack/jacket/jacket_s_soundtrack_1.png');
          albumCover.style.opacity = '1';
          albumCover.onload = () => {
            dominantColors = extractColorsFromCover();
          };
        }

        // Set audio source
        cdAudioPlayer.onerror = null;
        cdAudioPlayer.src = music.audioUrl;
        cdAudioPlayer.load();

        // Update active class manually
        const items = musicList.querySelectorAll('.music-item:not(.import-item)');
        items.forEach(item => item.classList.remove('active'));
        if (items[index]) items[index].classList.add('active');

        saveSettings();
        progressBar.value = 0;
        currentTimeEl.textContent = '0:00';

        // Update Media Session for local music
        updateMediaSessionLocal(music);
        return;
      }

      // Get all vocals for this music
      const availableVocals = musicVocalsData.filter(
        vocal => vocal.musicId === music.id
      );

      if (availableVocals.length === 0) {
        console.error('No vocals found for music:', music.id);
        return;
      }

      // Select vocal: use specified vocalId, or prefer preferredVocalType, or sekai, or first available
      let selectedVocal;

      if (vocalId) {
        // Manual selection
        selectedVocal = availableVocals.find(v => v.id === vocalId);
        if (selectedVocal) {
          preferredVocalType = selectedVocal.musicVocalType;
        }
      }

      if (!selectedVocal && preferredVocalType) {
        // Try to match preference
        selectedVocal = availableVocals.find(v => v.musicVocalType === preferredVocalType);
      }

      if (!selectedVocal) {
        // Prefer sekai version as fallback
        selectedVocal = availableVocals.find(v => v.musicVocalType === 'sekai');
      }

      if (!selectedVocal) {
        // Use first available
        selectedVocal = availableVocals[0];
      }

      currentVocalId = selectedVocal.id;

      // Update preferred characters based on selected vocal
      if (selectedVocal.characters && selectedVocal.characters.length > 0) {
        preferredCharacterIds = selectedVocal.characters
          .filter(c => c.characterType === 'game_character')
          .map(c => c.characterId);
        saveSettings(); // Save the preference
      }

      // Always display original title
      const displayTitle = music.title;

      // Update UI
      trackTitle.textContent = displayTitle;
      trackArtist.textContent = `作曲: ${music.composer || 'Unknown'} · 作词: ${music.lyricist || 'Unknown'}`;

      // Create custom vocal selector
      trackVocal.innerHTML = '';

      if (availableVocals.length > 1) {
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; gap: 6px; flex-wrap: wrap; justify-content: center;';

        availableVocals.forEach(vocal => {
          const btn = document.createElement('button');
          const characterNames = getVocalCharacterNames(vocal);
          const vocalLabel = vocal.caption || vocal.musicVocalType;

          btn.textContent = characterNames ? `${vocalLabel} (${characterNames})` : vocalLabel;
          btn.style.cssText = `
            background: ${vocal.id === selectedVocal.id ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.4), rgba(168, 85, 247, 0.4))' : 'rgba(255,255,255,0.1)'};
            border: 1px solid ${vocal.id === selectedVocal.id ? 'rgba(99, 102, 241, 0.6)' : 'rgba(255,255,255,0.2)'};
            color: #fff;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s;
            white-space: nowrap;
          `;

          btn.addEventListener('mouseenter', () => {
            if (vocal.id !== selectedVocal.id) {
              btn.style.background = 'rgba(255,255,255,0.15)';
              btn.style.transform = 'translateY(-1px)';
            }
          });

          btn.addEventListener('mouseleave', () => {
            if (vocal.id !== selectedVocal.id) {
              btn.style.background = 'rgba(255,255,255,0.1)';
              btn.style.transform = 'translateY(0)';
            }
          });

          btn.addEventListener('click', () => {
            // Update preferred characters when manually selecting a vocal
            if (vocal.characters && vocal.characters.length > 0) {
              preferredCharacterIds = vocal.characters
                .filter(c => c.characterType === 'game_character')
                .map(c => c.characterId);
              saveSettings();
            }
            
            const wasPlaying = isPlaying;
            if (wasPlaying) pauseTrack(); // Pause current first
            pendingAutoPlay = wasPlaying; // Set flag if was playing
            loadTrack(currentTrackIndex, vocal.id);
          });

          container.appendChild(btn);
        });

        trackVocal.appendChild(container);
      } else {
        const characterNames = getVocalCharacterNames(selectedVocal);
        const vocalLabel = selectedVocal.caption || 'セカイver.';
        trackVocal.textContent = characterNames ? `${vocalLabel} (${characterNames})` : vocalLabel;
      }

      // Update album cover with R2 CDN (auto-upload on 404)
      const coverPath = `/music/jacket/${music.assetbundleName}/${music.assetbundleName}.png`;

      // Set crossOrigin BEFORE setting src to enable CORS
      albumCover.crossOrigin = "anonymous";
      albumCover.style.display = 'block';
      albumCover.style.opacity = '0.5'; // Dim while loading

      // Load cover via R2 with auto-upload fallback
      (async () => {
        try {
          const coverUrl = await getAssetUrl(coverPath);
          albumCover.src = coverUrl;
        } catch (e) {
          console.warn('Failed to load cover:', e);
          albumCover.src = `${R2_BASE}${coverPath}`; // Try anyway
        }
      })();

      albumCover.onload = () => {
        albumCover.style.opacity = '1';
        // Extract colors from loaded cover for visualizer
        dominantColors = extractColorsFromCover();
      };

      albumCover.onerror = () => {
        console.warn('Cover image failed to load');
      };

      // Build audio URL with R2 CDN (auto-upload on 404)
      const audioPath = `/music/long/${selectedVocal.assetbundleName}/${selectedVocal.assetbundleName}.mp3`;

      // Clear previous onerror handler to prevent conflicts
      cdAudioPlayer.onerror = null;

      // Load audio via R2 with auto-upload fallback
      cdAudioPlayer.crossOrigin = "anonymous"; // Ensure CORS for visualizer

      (async () => {
        try {
          const audioUrl = await getAssetUrl(audioPath);
          cdAudioPlayer.src = audioUrl;
          cdAudioPlayer.load(); // Explicitly load the new source
        } catch (e) {
          console.error('Failed to load audio:', e);
          cdAudioPlayer.src = `${R2_BASE}${audioPath}`; // Try anyway
          cdAudioPlayer.load();
        }
      })();

      cdAudioPlayer.onerror = () => {
        console.error('Audio source failed to load');
        if (trackLoadingSpinner) trackLoadingSpinner.classList.add('hidden');
        pendingAutoPlay = false;
      };

      // Set start time to skip filler (blank audio at beginning)
      const fillerSec = music.fillerSec || 0;
      if (fillerSec > 0) {
        cdAudioPlayer.addEventListener('loadedmetadata', function setStartTime() {
          cdAudioPlayer.removeEventListener('loadedmetadata', setStartTime);
          cdAudioPlayer.currentTime = fillerSec;
        });
      }

      // Update active item in list (use music ID instead of index)
      document.querySelectorAll('.music-item').forEach((item) => {
        // We already set the active class based on currentMusicId in displayMusicList
        // But we need to update it here as well in case the list wasn't re-rendered
        const itemContent = item.querySelector('.music-item-content');
        const itemIndex = Array.from(item.parentElement.children).indexOf(item);
        const itemMusic = filteredMusicData[itemIndex];
        item.classList.toggle('active', itemMusic && itemMusic.id === music.id);
      });

      // Save current track index to localStorage
      saveSettings();

      // Reset progress
      progressBar.value = 0;
      currentTimeEl.textContent = '0:00';

      // Update Media Session API for system media controls
      updateMediaSession(music, selectedVocal, primaryCoverUrl, fallbackCoverUrl);
    }

    // Media Session API - Update system media controls metadata
    function updateMediaSession(music, selectedVocal, primaryCoverUrl, fallbackCoverUrl) {
      if (!('mediaSession' in navigator)) return;

      const characterNames = selectedVocal ? getVocalCharacterNames(selectedVocal) : '';
      const composer = (music.composer || '').trim();
      const names = (characterNames || '').trim();
      const parts = [];
      if (composer) parts.push(composer);
      if (names) parts.push(names);
      let artist = parts.length ? parts.join(' · ') : 'Unknown';

      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: music.title || 'Unknown Title',
          artist: artist,
          album: 'Project SEKAI',
          artwork: [
            { src: primaryCoverUrl, sizes: '512x512', type: 'image/png' },
            { src: primaryCoverUrl, sizes: '256x256', type: 'image/png' },
            { src: primaryCoverUrl, sizes: '128x128', type: 'image/png' },
            { src: primaryCoverUrl, sizes: '96x96', type: 'image/png' }
          ]
        });
        console.log('[MediaSession] Metadata updated:', music.title, artist);
      } catch (e) {
        console.error('[MediaSession] Error setting metadata:', e);
      }
    }

    // Update playback state for Media Session
    function updateMediaSessionPlaybackState(state) {
      if (!('mediaSession' in navigator)) return;
      try {
        navigator.mediaSession.playbackState = state; // 'playing', 'paused', 'none'
      } catch (e) {
        console.warn('[MediaSession] Error setting playbackState:', e);
      }
    }

    // Update position state for Media Session (for seek bar)
    function updateMediaSessionPositionState() {
      if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
      if (!cdAudioPlayer.duration || !isFinite(cdAudioPlayer.duration)) return;
      
      try {
        navigator.mediaSession.setPositionState({
          duration: cdAudioPlayer.duration,
          playbackRate: cdAudioPlayer.playbackRate,
          position: cdAudioPlayer.currentTime
        });
      } catch (e) {
        // Ignore errors - some browsers don't support this
      }
    }

    // Setup Media Session action handlers (called once on init)
    function setupMediaSessionHandlers() {
      if (!('mediaSession' in navigator)) return;

      navigator.mediaSession.setActionHandler('play', () => {
        playTrack();
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        pauseTrack();
      });

      navigator.mediaSession.setActionHandler('previoustrack', () => {
        const wasPlaying = isPlaying;
        pauseTrack();
        pendingAutoPlay = wasPlaying;
        const nextIndex = getNextTrackIndex(currentTrackIndex, -1, isShuffleOn);
        loadTrack(nextIndex);
      });

      navigator.mediaSession.setActionHandler('nexttrack', () => {
        const wasPlaying = isPlaying;
        pauseTrack();
        pendingAutoPlay = wasPlaying;
        const nextIndex = getNextTrackIndex(currentTrackIndex, 1, isShuffleOn);
        loadTrack(nextIndex);
      });

      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.fastSeek && 'fastSeek' in cdAudioPlayer) {
          cdAudioPlayer.fastSeek(details.seekTime);
        } else {
          cdAudioPlayer.currentTime = details.seekTime;
        }
      });

      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        const skipTime = details.seekOffset || 10;
        cdAudioPlayer.currentTime = Math.max(cdAudioPlayer.currentTime - skipTime, 0);
      });

      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        const skipTime = details.seekOffset || 10;
        cdAudioPlayer.currentTime = Math.min(cdAudioPlayer.currentTime + skipTime, cdAudioPlayer.duration || 0);
      });
    }

    // Media Session API - Update for local music files
    async function updateMediaSessionLocal(music) {
      if (!('mediaSession' in navigator)) return;

      const placeholderCover = await getAssetUrl('/mysekai/music_record_soundtrack/jacket/jacket_s_soundtrack_1.png');
      let coverUrl = music.coverUrl || placeholderCover;

      // Generate artwork URLs - use OSS processing for remote URLs, direct URL for local blob
      let artwork;
      if (coverUrl.startsWith('blob:') || coverUrl.startsWith('data:')) {
        // Local file - use same URL for all sizes (browser will scale)
        artwork = [
          { src: coverUrl, sizes: '512x512', type: 'image/png' },
          { src: coverUrl, sizes: '256x256', type: 'image/png' },
          { src: coverUrl, sizes: '128x128', type: 'image/png' },
          { src: coverUrl, sizes: '96x96', type: 'image/png' }
        ];
      } else {
        const baseUrl = coverUrl.split('?')[0];
        artwork = [
          { src: baseUrl, sizes: '512x512', type: 'image/png' },
          { src: baseUrl, sizes: '256x256', type: 'image/png' },
          { src: baseUrl, sizes: '128x128', type: 'image/png' },
          { src: baseUrl, sizes: '96x96', type: 'image/png' }
        ];
      }

      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: music.title || 'Unknown Title',
          artist: music.composer || 'Unknown Artist',
          album: music.album || 'Local Music',
          artwork: artwork
        });
        console.log('[MediaSession] Local metadata updated:', music.title);
      } catch (e) {
        console.error('[MediaSession] Error setting local metadata:', e);
      }
    }

    const albumCoverContainer = document.querySelector('.album-cover-container');
    const albumCoverElement = document.getElementById('albumCover');
    const cdAnimationElement = document.getElementById('cdAnimation');

    // Audio Visualizer Setup
    let audioContext = null;
    let analyser = null;
    let source = null;
    let visualizerCanvas = document.getElementById('visualizerCanvas');
    let canvasCtx = visualizerCanvas ? visualizerCanvas.getContext('2d') : null;
    let animationId = null;
    let dominantColors = []; // Store extracted colors from album cover
    let visualizationEnabled = false; // Track visualization state

    // Toggle visualization visibility and performance
    function toggleVisualization() {
      visualizationEnabled = !visualizationEnabled;
      
      if (visualizerCanvas) {
        visualizerCanvas.classList.toggle('hidden', !visualizationEnabled);
      }
      
      if (toggleVisualizationBtn) {
        toggleVisualizationBtn.classList.toggle('active', visualizationEnabled);
      }
      
      // Stop animation when disabled to save performance
      if (!visualizationEnabled && animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
        // Clear canvas
        if (canvasCtx && visualizerCanvas) {
          canvasCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
        }
      } else if (visualizationEnabled && isPlaying && analyser) {
        // Resume animation when re-enabled
        drawVisualizer();
      }
      
      // Save preference
      try {
        localStorage.setItem('visualizationEnabled', visualizationEnabled);
      } catch (e) {}
    }

    // Load saved preference
    try {
      const saved = localStorage.getItem('visualizationEnabled');
      if (saved !== null) {
        visualizationEnabled = saved === 'true';
        if (visualizerCanvas) {
          visualizerCanvas.classList.toggle('hidden', !visualizationEnabled);
        }
        if (toggleVisualizationBtn) {
          toggleVisualizationBtn.classList.toggle('active', visualizationEnabled);
        }
      } else {
        // Default: hide visualization
        visualizationEnabled = false;
      }
    } catch (e) {}

    // Add event listener for toggle button
    if (toggleVisualizationBtn) {
      toggleVisualizationBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleVisualization();
      });
    }

    // Extract dominant colors from album cover
    function extractColorsFromCover() {
      try {
        const img = albumCoverElement;
        if (!img || !img.complete) return [];

        // Create temporary canvas to read image pixels
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');

        // Resize to small size for faster processing
        const size = 50;
        tempCanvas.width = size;
        tempCanvas.height = size;

        // Draw image
        tempCtx.drawImage(img, 0, 0, size, size);

        // Get image data
        const imageData = tempCtx.getImageData(0, 0, size, size);
        const pixels = imageData.data;

        // Collect color samples (sample every 10th pixel for performance)
        const colorMap = {};
        const lowSatColors = []; // Store low-saturation colors separately
        let totalSaturation = 0;
        let sampleCount = 0;

        for (let i = 0; i < pixels.length; i += 40) { // RGBA, so skip by 40 (10 pixels)
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          const a = pixels[i + 3];

          // Skip transparent pixels
          if (a < 128) continue;

          // Skip pure black/white
          if ((r < 15 && g < 15 && b < 15) || (r > 240 && g > 240 && b > 240)) continue;

          // Convert to HSL for better color grouping
          const hsl = rgbToHsl(r, g, b);
          totalSaturation += hsl.s;
          sampleCount++;

          // Separate saturated and desaturated colors
          if (hsl.s >= 20) {
            const hueKey = Math.round(hsl.h / 30) * 30; // Group by 30° hue ranges

            if (!colorMap[hueKey]) {
              colorMap[hueKey] = { h: hsl.h, s: hsl.s, l: hsl.l, count: 0 };
            }
            colorMap[hueKey].count++;
            // Average the values for better representation
            colorMap[hueKey].h = (colorMap[hueKey].h * colorMap[hueKey].count + hsl.h) / (colorMap[hueKey].count + 1);
            colorMap[hueKey].s = (colorMap[hueKey].s * colorMap[hueKey].count + hsl.s) / (colorMap[hueKey].count + 1);
            colorMap[hueKey].l = (colorMap[hueKey].l * colorMap[hueKey].count + hsl.l) / (colorMap[hueKey].count + 1);
          } else {
            // Collect low-saturation colors
            lowSatColors.push({ h: hsl.h, s: hsl.s, l: hsl.l });
          }
        }

        // Calculate average saturation
        const avgSaturation = sampleCount > 0 ? totalSaturation / sampleCount : 0;

        // Check if this is a monochrome/low-saturation cover
        const isMonochrome = avgSaturation < 15;

        let colors;

        if (isMonochrome) {
          // For monochrome covers, use grayscale gradient

          // Sort low-sat colors by lightness
          lowSatColors.sort((a, b) => a.l - b.l);

          // Create grayscale gradient from dark to light
          colors = [
            { h: 0, s: 0, l: 30 },  // Dark gray
            { h: 0, s: 0, l: 45 },  // Medium-dark gray
            { h: 0, s: 0, l: 60 },  // Medium gray
            { h: 0, s: 0, l: 75 }   // Light gray
          ];
        } else {
          // Get top saturated colors by frequency
          const colorList = Object.values(colorMap)
            .sort((a, b) => b.count - a.count);

          // Check if this is a monochromatic (single hue) cover
          const dominantColor = colorList[0];
          const hueVariance = colorList.reduce((acc, c) => {
            const hueDiff = Math.abs(c.h - dominantColor.h);
            // Handle hue wrapping (e.g., 350° and 10° are close)
            const wrappedDiff = Math.min(hueDiff, 360 - hueDiff);
            return acc + wrappedDiff * c.count;
          }, 0) / colorList.reduce((acc, c) => acc + c.count, 0);


          // If hue variance is very small (< 30°), it's a single-color cover
          if (hueVariance < 30) {
            // Use different lightness values of the same hue
            colors = [
              { h: dominantColor.h, s: Math.max(dominantColor.s, 60), l: 35 },
              { h: dominantColor.h, s: Math.max(dominantColor.s, 60), l: 50 },
              { h: dominantColor.h, s: Math.max(dominantColor.s, 60), l: 65 },
              { h: dominantColor.h, s: Math.max(dominantColor.s, 60), l: 75 }
            ];
          } else {
            // Multi-color cover, use extracted palette
            colors = colorList
              .slice(0, 8) // Get more colors for better gradient
              .map(c => ({
                h: c.h,
                s: Math.max(c.s, 50), // Boost saturation for colorful covers
                l: Math.min(Math.max(c.l, 40), 70)
              }));

            // Sort colors by hue for smooth gradient
            colors = sortColorsForGradient(colors);
          }
        }

        return colors;
      } catch (e) {
        console.warn('Failed to extract colors from cover:', e);
        return [];
      }
    }

    // Sort colors by hue to create smooth gradient
    function sortColorsForGradient(colors) {
      if (colors.length <= 1) return colors;

      // Sort by hue value (0-360)
      const sorted = [...colors].sort((a, b) => a.h - b.h);

      // Check if we should wrap around (e.g., red at 0° and 360°)
      // Calculate the largest gap in the hue circle
      let maxGap = 0;
      let maxGapIndex = 0;

      for (let i = 0; i < sorted.length; i++) {
        const current = sorted[i].h;
        const next = sorted[(i + 1) % sorted.length].h;
        const gap = i === sorted.length - 1
          ? (360 - current + next) // Wrap around gap
          : (next - current);

        if (gap > maxGap) {
          maxGap = gap;
          maxGapIndex = i;
        }
      }

      // If there's a large gap, start the array after that gap
      // This ensures the gradient doesn't go through the gap
      if (maxGap > 60) { // If gap is larger than 60°, reorganize
        const reordered = [
          ...sorted.slice(maxGapIndex + 1),
          ...sorted.slice(0, maxGapIndex + 1)
        ];
        return reordered;
      }

      return sorted;
    }

    // RGB to HSL conversion
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

    function initAudioVisualizer() {
      if (!visualizerCanvas || audioContext) return;

      try {
        // Create AudioContext
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioContext();

        // Create Analyser
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256; // Controls the number of frequency bins

        // Connect Audio Element to Analyser
        // Note: This requires CORS to be handled correctly for cross-origin audio
        cdAudioPlayer.crossOrigin = "anonymous";
        source = audioContext.createMediaElementSource(cdAudioPlayer);
        source.connect(analyser);
        analyser.connect(audioContext.destination);

        drawVisualizer();
      } catch (e) {
        console.warn('Web Audio API setup failed:', e);
      }
    }

    function drawVisualizer() {
      if (!analyser || !visualizerCanvas || !visualizationEnabled) return;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const width = visualizerCanvas.width;
      const height = visualizerCanvas.height;
      const centerX = width / 2;
      const centerY = height / 2;
      const coverRadius = 125; // Approximate CD cover radius
      const minBarHeight = 5; // Minimum bar height to ensure visibility
      const maxBarHeight = 80; // Maximum bar height

      const draw = () => {
        // Check if visualization is still enabled before continuing
        if (!visualizationEnabled) {
          animationId = null;
          return;
        }
        
        animationId = requestAnimationFrame(draw);

        analyser.getByteFrequencyData(dataArray);

        canvasCtx.clearRect(0, 0, width, height);

        // Use extracted colors or fallback to rainbow
        const useExtractedColors = dominantColors.length > 0;

        // Pre-calculate constants for the loop
        const overlap = Math.max(2, Math.floor(bufferLength * 0.06)); // ~6% of bins or at least 2
        const overlapThreshold = bufferLength - overlap;
        const startValues = new Float32Array(overlap); // Cache for start values
        const invBufferLength = 1 / bufferLength;

        // Draw bars starting from cover edge, extending outward
        for (let i = 0; i < bufferLength; i++) {
          // Scale bar height with minimum
          const ratio = i * invBufferLength;
          let transformedValue = dataArray[i] / 255 * (0.5 + Math.pow(ratio, 1.5));

          // Piecewise linear dynamics (S-curve approximation)
          if (transformedValue < 0.25) {
            transformedValue = 0;
          } else if (transformedValue < 0.65) {
            transformedValue = (transformedValue - 0.25) * 2.0;
          } else {
            transformedValue = 0.8 + (transformedValue - 0.65) * 0.6;
          }

          // Cache the start values for blending at the end
          if (i < overlap) {
            startValues[i] = transformedValue;
          }

          // Apply overlap blending at the end
          if (i >= overlapThreshold) {
            // map last bins [bufferLength-overlap .. bufferLength-1] to start bins [0 .. overlap-1]
            const pos = i - overlapThreshold; // 0 .. overlap-1
            const dvStart = startValues[pos]; // Retrieve cached value

            // smooth interpolation weight (use smoothstep to avoid hard edge)
            const tRaw = overlap > 1 ? pos / (overlap - 1) : 1;
            const t = tRaw * tRaw * (3 - 2 * tRaw); // smoothstep

            // Blend so we use the normal transformedValue at the beginning of overlap,
            // and gradually mix in the mapped start value toward the very end.
            transformedValue = transformedValue * (1 - t) + dvStart * t * (0.7 + 0.3 * Math.random());
          }

          const barHeight = minBarHeight + transformedValue * (maxBarHeight - minBarHeight);

          // Calculate angle
          const angle = (i / bufferLength) * 2 * Math.PI - Math.PI / 2; // Start from top

          // Start from edge of cover, extend outward
          const x1 = centerX + Math.cos(angle) * coverRadius;
          const y1 = centerY + Math.sin(angle) * coverRadius;
          const x2 = centerX + Math.cos(angle) * (coverRadius + barHeight);
          const y2 = centerY + Math.sin(angle) * (coverRadius + barHeight);

          // Draw bar with gradient effect
          canvasCtx.beginPath();
          canvasCtx.moveTo(x1, y1);
          canvasCtx.lineTo(x2, y2);
          canvasCtx.lineWidth = 4;

          // Create gradient from base to tip
          const gradient = canvasCtx.createLinearGradient(x1, y1, x2, y2);

          if (useExtractedColors) {
            // Add slow rotation effect by shifting the color array position
            const rotationSpeed = 0.0005; // Very slow rotation
            const rotationOffset = (Date.now() * rotationSpeed) % dominantColors.length;

            // Smooth gradient across all colors with rotation
            // Calculate position in the color array (with smooth interpolation and rotation)
            const basePosition = (i / bufferLength) * dominantColors.length;
            const position = (basePosition + rotationOffset) % dominantColors.length;
            const colorIndex = Math.floor(position);
            const nextColorIndex = (colorIndex + 1) % dominantColors.length;
            const blend = position - colorIndex; // 0 to 1 for blending

            const color1 = dominantColors[colorIndex];
            const color2 = dominantColors[nextColorIndex];

            // Interpolate between two adjacent colors in the gradient array
            const h = color1.h + (color2.h - color1.h) * blend;
            const s = color1.s + (color2.s - color1.s) * blend;
            const l = color1.l + (color2.l - color1.l) * blend;

            // Vary lightness based on frequency intensity
            const intensity = dataArray[i] / 255;
            const lightness1 = Math.max(25, l - 15);
            const lightness2 = Math.min(75, l + 15 + 15 * intensity);

            gradient.addColorStop(0, `hsla(${h}, ${s}%, ${lightness1}%, 0.6)`);
            gradient.addColorStop(1, `hsla(${h}, ${s}%, ${lightness2}%, 0.95)`);
          } else {
            // Fallback to rainbow colors
            const hue = (i * 360 / bufferLength + Date.now() * 0.05) % 360;
            gradient.addColorStop(0, `hsla(${hue}, 70%, 50%, 0.4)`);
            gradient.addColorStop(1, `hsla(${hue}, 80%, 60%, 0.8)`);
          }

          canvasCtx.strokeStyle = gradient;
          canvasCtx.lineCap = 'round';
          canvasCtx.stroke();
        }
      };

      draw();
    }

    // Play track
    function playTrack() {

      // Initialize visualizer on first user interaction (play)
      if (!audioContext) {
        initAudioVisualizer();
      } else if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      if (currentTrackIndex < 0) {
        // Play first track if none selected
        pendingAutoPlay = true;
        loadTrack(0);
        return;
      }


      // If audio is not ready yet, set flag and wait for canplay event
      if (cdAudioPlayer.readyState < 2) {
        if (trackLoadingSpinner) trackLoadingSpinner.classList.remove('hidden');
        pendingAutoPlay = true;
        return;
      }

      cdAudioPlayer.play()
        .then(() => {
          isPlaying = true;
          playPauseBtn.textContent = '⏸️';

          // Update Media Session playback state
          updateMediaSessionPlaybackState('playing');
          updateMediaSessionPositionState();

          // Start CD animation smoothly
          if (albumCoverContainer) {
            albumCoverContainer.classList.add('playing');
          }
        })
        .catch(error => {
          console.error('[playTrack] Error playing audio:', error);
        });
    }

    // Pause track
    function pauseTrack() {
      cdAudioPlayer.pause();
      isPlaying = false;
      playPauseBtn.textContent = '▶️';

      // Update Media Session playback state
      updateMediaSessionPlaybackState('paused');

      // Stop CD animation smoothly
      if (albumCoverContainer) {
        // Get current rotation from computed style
        const coverStyle = window.getComputedStyle(albumCoverElement);
        const matrix = coverStyle.transform;

        if (matrix && matrix !== 'none') {
          // Parse rotation from matrix
          const values = matrix.match(/matrix.*\((.+)\)/)[1].split(', ');
          const a = parseFloat(values[0]);
          const b = parseFloat(values[1]);
          const currentAngle = Math.round(Math.atan2(b, a) * (180 / Math.PI));

          // Remove animation class first
          albumCoverContainer.classList.remove('playing');

          // Set current rotation as static transform
          albumCoverElement.style.transform = `rotate(${currentAngle}deg)`;
          if (cdAnimationElement) {
            cdAnimationElement.style.transform = `rotate(${currentAngle}deg)`;
          }

          // Smoothly transition back to 0
          requestAnimationFrame(() => {
            albumCoverElement.style.transition = 'transform 0.8s ease-out, border-radius 0.5s ease';
            albumCoverElement.style.transform = 'rotate(0deg)';
            if (cdAnimationElement) {
              cdAnimationElement.style.transition = 'opacity 0.5s, transform 0.8s ease-out';
              cdAnimationElement.style.transform = 'rotate(0deg)';
            }
          });
        } else {
          albumCoverContainer.classList.remove('playing');
        }
      }
    }

    // Toggle play/pause
    if (playPauseBtn) {
      playPauseBtn.addEventListener('click', () => {
        if (isPlaying) {
          pauseTrack();
        } else {
          playTrack();
        }
      });
    }

    // Previous track
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        const wasPlaying = isPlaying;
        pauseTrack(); // Pause current first
        pendingAutoPlay = wasPlaying; // Set flag for auto-play

        const nextIndex = getNextTrackIndex(currentTrackIndex, -1, isShuffleOn);
        loadTrack(nextIndex);
      });
    }

    // Next track
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const wasPlaying = isPlaying;
        pauseTrack(); // Pause current first
        pendingAutoPlay = wasPlaying; // Set flag for auto-play

        const nextIndex = getNextTrackIndex(currentTrackIndex, 1, isShuffleOn);
        loadTrack(nextIndex);
      });
    }

    // Shuffle toggle
    if (shuffleBtn) {
      shuffleBtn.addEventListener('click', () => {
        isShuffleOn = !isShuffleOn;
        shuffleBtn.classList.toggle('active', isShuffleOn);
        saveSettings(); // Save preference
      });
    }

    // Repeat toggle
    if (repeatBtn) {
      repeatBtn.addEventListener('click', () => {
        isRepeatOn = !isRepeatOn;
        repeatBtn.classList.toggle('active', isRepeatOn);
        cdAudioPlayer.loop = isRepeatOn;
        saveSettings(); // Save preference
      });
    }

    // Progress bar update
    if (cdAudioPlayer) {
      // Loading state handlers
      cdAudioPlayer.addEventListener('loadstart', () => {
        if (trackLoadingSpinner) trackLoadingSpinner.classList.remove('hidden');
      });

      cdAudioPlayer.addEventListener('waiting', () => {
        if (trackLoadingSpinner) trackLoadingSpinner.classList.remove('hidden');
      });

      cdAudioPlayer.addEventListener('canplay', () => {
        if (trackLoadingSpinner) trackLoadingSpinner.classList.add('hidden');

        // Auto-play if flag is set
        if (pendingAutoPlay) {
          pendingAutoPlay = false;
          setTimeout(() => {
            playTrack();
          }, 50); // Small delay to ensure audio is truly ready
        }
      });

      cdAudioPlayer.addEventListener('playing', () => {
        if (trackLoadingSpinner) trackLoadingSpinner.classList.add('hidden');
      });

      cdAudioPlayer.addEventListener('error', () => {
        console.error('[error event] Audio error, src:', cdAudioPlayer.src);
        if (trackLoadingSpinner) trackLoadingSpinner.classList.add('hidden');
        // Don't clear pendingAutoPlay here - onerror handler will manage fallback
      });

      cdAudioPlayer.addEventListener('timeupdate', () => {
        if (cdAudioPlayer.duration) {
          const progress = (cdAudioPlayer.currentTime / cdAudioPlayer.duration) * 100;
          progressBar.value = progress;
          currentTimeEl.textContent = formatTime(cdAudioPlayer.currentTime);
          
          // Update Media Session position state periodically (throttled)
          if (isPlaying && Math.floor(cdAudioPlayer.currentTime) % 5 === 0) {
            updateMediaSessionPositionState();
          }
        }
      });

      cdAudioPlayer.addEventListener('loadedmetadata', () => {
        totalTimeEl.textContent = formatTime(cdAudioPlayer.duration);
        // Update position state when duration is known
        updateMediaSessionPositionState();
      });

      cdAudioPlayer.addEventListener('ended', () => {
        // Track achievement
        if (window.achievementSystem) {
          window.achievementSystem.incrementSongs();
        }

        if (!isRepeatOn) {
          if (isShuffleOn) {
            // Random next track
            const nextIndex = getNextTrackIndex(currentTrackIndex, 1, true);
            pendingAutoPlay = true; // Set flag for auto-play
            loadTrack(nextIndex);
          } else {
            // Sequential next
            const nextIndex = getNextTrackIndex(currentTrackIndex, 1, false);

            // Stop if we wrapped around (nextIndex <= currentTrackIndex)
            if (nextIndex > currentTrackIndex) {
              pendingAutoPlay = true; // Set flag for auto-play
              loadTrack(nextIndex);
            } else {
              // End of playlist
              pauseTrack();
              progressBar.value = 0;
              currentTimeEl.textContent = '0:00';
            }
          }
        }
        // If repeat is on, audio will loop automatically
      });
    }

    // Progress bar seek
    if (progressBar) {
      progressBar.addEventListener('input', (e) => {
        const seekTime = (e.target.value / 100) * cdAudioPlayer.duration;
        cdAudioPlayer.currentTime = seekTime;
      });
    }

    // Volume control
    if (cdVolumeSlider) {
      cdVolumeSlider.addEventListener('input', (e) => {
        cdAudioPlayer.volume = parseFloat(e.target.value);
        saveSettings(); // Save volume preference
      });
      // Set initial volume from saved settings or default
      const savedVolume = localStorage.getItem(STORAGE_KEYS.VOLUME);
      if (savedVolume !== null) {
        cdAudioPlayer.volume = parseFloat(savedVolume);
        cdVolumeSlider.value = savedVolume;
      } else {
        cdAudioPlayer.volume = parseFloat(cdVolumeSlider.value);
      }
    }

    // Toggle panel
    function togglePanel() {
      cdPlayerPanel.classList.toggle('hidden');
      // Load music data when panel is opened for the first time
      if (!cdPlayerPanel.classList.contains('hidden') && filteredMusicData.length === 0) {
        loadMusicData();
      }
    }

    // Event listeners
    cdPlayerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePanel();
    });

    cdPlayerCloseBtn.addEventListener('click', () => {
      togglePanel();
    });

    // Prevent clicks inside panel from propagating
    cdPlayerPanel.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Expose CD Player System
    window.cdPlayerSystem = {
      getRandomSong: () => {
        // Use musicData if available, otherwise try to load or return null
        if (musicData && musicData.length > 0) {
          return musicData[Math.floor(Math.random() * musicData.length)];
        }
        return null;
      },
      playSongById: (id) => {
        // Find index by id
        const index = musicData.findIndex(track => track.id === id);
        if (index !== -1) {
          // If panel is hidden, show it? Maybe not necessary, just play
          // But we need to ensure filteredMusicData contains it or we switch to 'all'
          // For simplicity, just switch to 'all' category and play
          if (currentCategory !== 'all') {
            const allBtn = document.querySelector('.category-btn[data-category="all"]');
            if (allBtn) allBtn.click();
          }
          // Need to find index in filteredMusicData (which should be all now)
          const filteredIndex = filteredMusicData.findIndex(track => track.id === id);
          if (filteredIndex !== -1) {
            loadTrack(filteredIndex);
            playTrack();
          }
        }
      }
    };
  })();

    // --- Achievement System ---
    const achievements = [
      // Pomodoro / Ranks
      { id: 'first_pomodoro', title: '初めての一歩', desc: '完成第一个番茄钟', icon: '🍅', type: 'pomodoro_count', target: 1, points: 10 },
      { id: 'pomodoro_10', title: '番茄收集者', desc: '累计完成10个番茄钟', icon: '🍅', type: 'pomodoro_count', target: 10, points: 20 },
      { id: 'rank_platinum', title: 'Platinum（白金）', desc: '累计完成50个番茄钟', icon: '🏆', type: 'pomodoro_count', target: 50, points: 100 },
      { id: 'rank_diamond', title: 'Diamond（钻石）', desc: '累计完成100个番茄钟', icon: '💎', type: 'pomodoro_count', target: 100, points: 200 },
      { id: 'rank_ruby', title: 'Ruby（红宝石）', desc: '累计完成200个番茄钟', icon: '🔴', type: 'pomodoro_count', target: 200, points: 400 },
      { id: 'rank_pearl', title: 'Pearl（珍珠）', desc: '累计完成300个番茄钟', icon: '⚪', type: 'pomodoro_count', target: 300, points: 600 },
      { id: 'rank_sapphire', title: 'Sapphire（蓝宝石）', desc: '累计完成400个番茄钟', icon: '🔵', type: 'pomodoro_count', target: 400, points: 800 },
      { id: 'rank_garnet', title: 'Garnet（石榴石）', desc: '累计完成500个番茄钟', icon: '🟤', type: 'pomodoro_count', target: 500, points: 1000 },
      { id: 'rank_emerald', title: 'Emerald（祖母绿）', desc: '累计完成1000个番茄钟', icon: '💚', type: 'pomodoro_count', target: 1000, points: 2000 },

      // Streak / Attendance
      { id: 'streak_3', title: '三日坚持', desc: '连续3天学习', icon: '🔥', type: 'streak_days', target: 3, points: 30 },
      { id: 'streak_7', title: '皆勤賞', desc: '连续7天学习', icon: '📅', type: 'streak_days', target: 7, points: 70 },
      { id: 'streak_14', title: '高校1年生', desc: '连续14天学习', icon: '🏫', type: 'streak_days', target: 14, points: 140 },
      { id: 'streak_30', title: '高校2年生', desc: '连续30天学习', icon: '🔥', type: 'streak_days', target: 30, points: 300 },
      { id: 'streak_60', title: '高校3年生', desc: '连续60天学习', icon: '🌸', type: 'streak_days', target: 60, points: 600 },
      { id: 'streak_100', title: '一直都在身边', desc: '连续100天学习', icon: '💑', type: 'streak_days', target: 100, points: 1000 },
      { id: 'streak_365', title: '永远都在身边', desc: '连续365天学习', icon: '💍', type: 'streak_days', target: 365, points: 3650 },

      // Time / Experience
      { id: 'time_10h', title: '一人前', desc: '累计学习10小时', icon: '🐣', type: 'total_time', target: 36000, points: 100 },
      { id: 'time_50h', title: 'Veteran（资深老手）', desc: '累计学习50小时', icon: '🦅', type: 'total_time', target: 180000, points: 500 },
      { id: 'time_100h', title: '老相识', desc: '累计学习100小时', icon: '👴', type: 'total_time', target: 360000, points: 1000 },
      { id: 'time_200h', title: '元老级', desc: '累计学习200小时', icon: '🦕', type: 'total_time', target: 720000, points: 2000 },
      { id: 'time_500h', title: '远古居民', desc: '累计学习500小时', icon: '🦖', type: 'total_time', target: 1800000, points: 5000 },
      { id: 'time_1000h', title: '前世之缘', desc: '累计学习1000小时', icon: '👻', type: 'total_time', target: 3600000, points: 10000 },

      // Songs / Live Master
      { id: 'live_master_beginner', title: 'Live Master 初級', desc: '播放10首歌曲', icon: '🎵', type: 'songs_played', target: 10, points: 10 },
      { id: 'song_39', title: '39！', desc: '播放39首歌曲', icon: '🎵', type: 'songs_played', target: 39, points: 39 },
      { id: 'live_master_intermediate', title: 'Live Master 中級', desc: '播放50首歌曲', icon: '🎧', type: 'songs_played', target: 50, points: 50 },
      { id: 'live_master_advanced', title: 'Live Master 上級', desc: '播放100首歌曲', icon: '🎹', type: 'songs_played', target: 100, points: 100 },
      { id: 'live_master_expert', title: 'Live Master 達人', desc: '播放500首歌曲', icon: '🎸', type: 'songs_played', target: 500, points: 500 },
      { id: 'live_master_master', title: 'Live Master 皆伝', desc: '播放1000首歌曲', icon: '🎺', type: 'songs_played', target: 1000, points: 1000 },
      { id: 'live_master_true_master', title: 'Live Master 真・皆伝', desc: '播放2000首歌曲', icon: '🎻', type: 'songs_played', target: 2000, points: 2000 },
      { id: 'song_3939', title: '3939！', desc: '播放3939首歌曲', icon: '🎵', type: 'songs_played', target: 3939, points: 3939 },

      // Special / Misc
      { id: 'night_owl', title: '25時の住人', desc: '在凌晨1点学习', icon: '🌙', type: 'night_owl', target: 1, points: 25 },
      { id: 'early_bird', title: '朝活 Master', desc: '在早上6点前学习', icon: '🌅', type: 'early_bird', target: 1, points: 25 },
      { id: 'time_1h', title: '一時間集中', desc: '单次学习超过1小时', icon: '⏰', type: 'session_duration', target: 3600, points: 30 },
      { id: 'session_long', title: 'Never Give Up（永不言弃）', desc: '单次学习超过2小时', icon: '⏳', type: 'session_duration', target: 7200, points: 50 },
      { id: 'session_very_long', title: '腱鞘炎', desc: '单次学习超过4小时', icon: '🩹', type: 'session_duration', target: 14400, points: 100 }
    ];

    // Achievement State
    let userStats = {
      pomodoro_count: 0,
      streak_days: 0,
      last_login_date: null,
      songs_played: 0,
      total_time: 0,
      today_time: 0,
      today_date: null,
      unlocked_achievements: [],
      recent_activities: [] // {type, timestamp, detail}
    };

    // Add activity record
    function addActivity(type, detail) {
      const activity = {
        type,
        timestamp: Date.now(),
        detail
      };
      userStats.recent_activities.unshift(activity);
      // Keep only last 20 activities
      if (userStats.recent_activities.length > 20) {
        userStats.recent_activities = userStats.recent_activities.slice(0, 20);
      }
      saveStats();
    }

    // Load stats from localStorage
    function loadStats() {
      const saved = localStorage.getItem('userStats');
      if (saved) {
        userStats = { ...userStats, ...JSON.parse(saved) };
      }
      checkDailyLogin();
    }

    // Save stats to localStorage
    function saveStats() {
      localStorage.setItem('userStats', JSON.stringify(userStats));
      updateAchievementsUI();
    }

    // Check daily login for streak
    function checkDailyLogin() {
      const today = new Date().toDateString();
      if (userStats.last_login_date !== today) {
        const lastLogin = userStats.last_login_date ? new Date(userStats.last_login_date) : null;
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (lastLogin && lastLogin.toDateString() === yesterday.toDateString()) {
          userStats.streak_days++;
        } else {
          userStats.streak_days = 1;
        }
        userStats.last_login_date = today;
        
        // Record login activity
        addActivity('login', `新的一天开始了，连续第 ${userStats.streak_days} 天`);
        
        checkAchievements('streak_days');
      }
      
      // Check time-based achievements
      const hour = new Date().getHours();
      if (hour === 1) checkAchievements('night_owl');
      if (hour >= 4 && hour < 6) checkAchievements('early_bird');
    }

    // Check and unlock achievements
    function checkAchievements(type, value = null) {
      let changed = false;
      const currentValue = value !== null ? value : userStats[type];
      
      achievements.forEach(ach => {
        if (ach.type === type && !userStats.unlocked_achievements.includes(ach.id)) {
          if (currentValue >= ach.target) {
            unlockAchievement(ach);
            changed = true;
          }
        }
      });
      
      if (changed) saveStats();
    }

    // Unlock an achievement
    function unlockAchievement(achievement) {
      userStats.unlocked_achievements.push(achievement.id);
      addActivity('achievement', `解锁成就「${achievement.title}」`);
      showNotification(`成就解锁: ${achievement.title}`, achievement.icon);
      // You could also play a sound here
    }

    // Show in-app notification
    function showNotification(text, icon) {
      // Simple toast implementation
      const toast = document.createElement('div');
      toast.className = 'achievement-toast';
      toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-text">${text}</span>`;
      document.body.appendChild(toast);
      
      // Add styles dynamically if not present
      if (!document.getElementById('toast-style')) {
        const style = document.createElement('style');
        style.id = 'toast-style';
        style.textContent = `
          .achievement-toast {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%) translateY(-100px);
            background: rgba(30, 30, 45, 0.9);
            color: #fff;
            padding: 12px 24px;
            border-radius: 50px;
            display: flex;
            align-items: center;
            gap: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 2000;
            transition: transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            border: 1px solid rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
          }
          .achievement-toast.show {
            transform: translateX(-50%) translateY(0);
          }
          .toast-icon { font-size: 20px; }
          .toast-text { font-size: 14px; font-weight: 600; }
        `;
        document.head.appendChild(style);
      }
      
      // Trigger animation
      requestAnimationFrame(() => toast.classList.add('show'));
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
      }, 3000);
    }

    // Update Achievements UI in Settings Panel
    function updateAchievementsUI() {
      const list = document.querySelector('.achievements-list');
      if (!list) return;
      
      // Calculate total score
      const totalScore = userStats.unlocked_achievements.reduce((sum, id) => {
        const ach = achievements.find(a => a.id === id);
        return sum + (ach ? ach.points : 0);
      }, 0);

      // Add score display if not exists
      let scoreDisplay = document.getElementById('achievementScore');
      if (!scoreDisplay) {
        scoreDisplay = document.createElement('div');
        scoreDisplay.id = 'achievementScore';
        scoreDisplay.className = 'achievement-score';
        list.parentNode.insertBefore(scoreDisplay, list);
      }
      scoreDisplay.innerHTML = `<span>当前积分:</span> <span class="score-value">${totalScore}</span>`;

      list.innerHTML = '';
      achievements.forEach(ach => {
        const isUnlocked = userStats.unlocked_achievements.includes(ach.id);
        const item = document.createElement('div');
        item.className = `achievement-item ${isUnlocked ? '' : 'locked'}`;
        item.innerHTML = `
          <div class="achievement-icon">${ach.icon}</div>
          <div class="achievement-info">
            <div class="achievement-title">${ach.title} <span class="achievement-points">+${ach.points}</span></div>
            <div class="achievement-desc">${ach.desc}</div>
          </div>
          ${isUnlocked ? '<div class="achievement-check">✓</div>' : ''}
        `;
        list.appendChild(item);
      });

      // Update Stats UI
      const statValues = document.querySelectorAll('.stat-value');
      if (statValues.length >= 3) {
        // Check if today_date is current, if not reset today_time
        const today = new Date().toDateString();
        if (userStats.today_date !== today) {
          userStats.today_time = 0;
          userStats.today_date = today;
        }
        statValues[0].textContent = Math.floor(userStats.today_time / 60); // Today's mins
        statValues[1].textContent = (userStats.total_time / 3600).toFixed(1); // Total hours
        statValues[2].textContent = userStats.pomodoro_count;
      }

      // Update Activity List
      const activityList = document.querySelector('.activity-list');
      if (activityList) {
        activityList.innerHTML = '';
        const activities = userStats.recent_activities || [];
        if (activities.length === 0) {
          activityList.innerHTML = '<div class="activity-item">暂无记录</div>';
        } else {
          activities.slice(0, 10).forEach(activity => {
            const item = document.createElement('div');
            item.className = 'activity-item';
            const time = new Date(activity.timestamp);
            const timeStr = `${time.getMonth() + 1}/${time.getDate()} ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
            
            let icon = '📝';
            let text = activity.detail;
            switch (activity.type) {
              case 'pomodoro': icon = '🍅'; break;
              case 'song': icon = '🎵'; break;
              case 'achievement': icon = '🏆'; break;
              case 'login': icon = '👋'; break;
            }
            
            item.innerHTML = `<span class="activity-icon">${icon}</span><span class="activity-text">${text}</span><span class="activity-time">${timeStr}</span>`;
            activityList.appendChild(item);
          });
        }
      }
    }

    // Initialize
    loadStats();
    
    // Check time-based achievements every minute
    setInterval(() => {
      const hour = new Date().getHours();
      if (hour === 1) checkAchievements('night_owl');
      if (hour >= 4 && hour < 6) checkAchievements('early_bird');
    }, 60000);

    // Expose functions for other modules to call
    window.achievementSystem = {
      incrementPomodoro: () => {
        userStats.pomodoro_count++;
        addActivity('pomodoro', `完成了第 ${userStats.pomodoro_count} 个番茄钟`);
        checkAchievements('pomodoro_count');
      },
      incrementSongs: () => {
        userStats.songs_played++;
        saveStats();
        checkAchievements('songs_played');
      },
      addFocusTime: (seconds) => {
        // Update today's time
        const today = new Date().toDateString();
        if (userStats.today_date !== today) {
          userStats.today_time = 0;
          userStats.today_date = today;
        }
        userStats.today_time += seconds;
        userStats.total_time += seconds;
        saveStats();
        checkAchievements('total_time');
        if (seconds >= 3600) checkAchievements('session_duration', seconds);
      },
      updateUI: updateAchievementsUI
    };

  // --- Settings Panel Logic ---
  (() => {
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsPanel = document.getElementById('settingsPanel');
    const settingsCloseBtn = document.getElementById('settingsCloseBtn');

    if (!settingsBtn || !settingsPanel) return;

    // Toggle panel visibility
    function togglePanel() {
      settingsPanel.classList.toggle('hidden');
      if (!settingsPanel.classList.contains('hidden')) {
        if (window.achievementSystem) {
          window.achievementSystem.updateUI();
        }
        updateHomeTab();
      }
    }

    // --- Home Tab Logic ---
    const greetingText = document.getElementById('greetingText');
    const userNickname = document.getElementById('userNickname');
    const editNicknameBtn = document.getElementById('editNicknameBtn');
    const streakSummary = document.getElementById('streakSummary');
    const timeSummary = document.getElementById('timeSummary');
    const randomTipText = document.getElementById('randomTipText');

    const STATIC_TIPS = [
      // General Tips
      "休息也是工作的一部分哦。",
      "感到疲惫的时候，听听音乐放松一下吧。",
      "保持水分充足有助于提高专注力。",
      "番茄工作法建议每25分钟休息5分钟。",
      "今天的努力，未来的你会感谢现在的自己。",
      "不要忘记伸展一下身体。",
      "深呼吸，让大脑重新充满氧气。",
      "整理桌面也能整理心情。",
      "设定一个小目标，完成后给自己一点奖励。",
      "即使是微小的进步，也值得庆祝。",
      
      // App Tips
      "使用快捷键 'M' 可以快速静音，'F' 键进入全屏。",
      "在 CD 播放器中点击 '🌀' 按钮，可以开启音频可视化效果。",
      "点击 '🎚️' 按钮，可以开启音频处理效果，享受人声衰减后的背景声。",
      "番茄钟的设置可以调整，找到最适合你的节奏。",
      "点击顶部的 'Toggle TZ' 按钮，假装自己身处东京的时间流中。",
      
      // Game Context / Quotes
      "奏：「就这样继续吧。」",
      "奏：「嗯，感觉不错。」",
      "奏：「……时间是还有点早，不过还是上 Nightcord 干活吧。」",
      "奏：「去吃饭吧，我的肚子也咕咕叫了。」",
      "瑞希：「今天就稍微积极点吧。」",
      "瑞希：「好，我也要加把劲了。」",
      "瑞希：「嗯，小菜一碟♪」",
      "瑞希：「大家都辛苦啦～♪」",
      "绘名：「状态很不错嘛。」",
      "绘名：「继续保持这个状态哦。」",
      "绘名：「嗯，感觉不错哦。」",
      "绘名：「呼，好累啊。今天就到这里吧。」",
      "绘名：「嗯，感觉不错！」",
      "绘名：「这点事还是很轻松的♪」",
      "绘名：「半途而废也不好，再加把劲吧。」",
      "真冬：「……新的一天开始了。」",
      "真冬：「……听着 25 的歌曲，内心就会平静下来。」",
      "真冬：「……真希望赶快到 25 点。」",
      "真冬：「这么顺利真是太好了。」",
      "真冬：「辛苦了。」",
      "真冬：「干活的时候心里就会平静下来……」",
      "未来：「非常棒。」",
      "未来：「我也会加油的。」",
      "未来：「啊……你来了啊。谢谢……」",
      "未来：「今天做些什么好呢？咦……？你愿意和我待在一起吗？」",
      "未来：「……啊，欢迎。」",
      "未来：「努力过了。」",
      "未来：「……没事的。我在你身边……」",
    ];

    function getDailyTip() {
      const rand = Math.random();
      
      // 30% chance for song recommendation if available
      if (rand < 0.3 && window.cdPlayerSystem && window.cdPlayerSystem.getRandomSong) {
        const song = window.cdPlayerSystem.getRandomSong();
        if (song) {
          return `今日推荐曲目：《${song.title}》\n适合现在的氛围呢。`;
        }
      }

      // 20% chance for Unit recommendation
      if (rand >= 0.3 && rand < 0.5) {
        const units = ["Leo/need", "MORE MORE JUMP!", "Vivid BAD SQUAD", "Wonderlands×Showtime", "25时，在Nightcord。", "VIRTUAL SINGER"];
        const templates = [
          "想转换心情吗？试试去 CD 播放器里找找 {unit} 的歌吧。",
          "如果是 {unit} 的曲风，说不定能给你带来新的灵感。",
          "偶尔听听 {unit} 的歌，感觉也不错呢。",
          "现在的气氛，或许很适合 {unit} 的音乐？"
        ];
        const unit = units[Math.floor(Math.random() * units.length)];
        const template = templates[Math.floor(Math.random() * templates.length)];
        return template.replace('{unit}', unit);
      }

      // Fallback to static tips
      return STATIC_TIPS[Math.floor(Math.random() * STATIC_TIPS.length)];
    }

    function updateHomeTab() {
      // Update Greeting
      const hour = new Date().getHours();
      let greeting = '你好，';
      if (hour >= 5 && hour < 12) greeting = '早上好，';
      else if (hour >= 12 && hour < 18) greeting = '下午好，';
      else if (hour >= 18 && hour < 23) greeting = '晚上好，';
      else greeting = '夜深了，';
      
      if (greetingText) greetingText.textContent = greeting;

      // Update Nickname
      const savedNickname = localStorage.getItem('userNickname') || '「世界」的居民';
      if (userNickname) userNickname.textContent = savedNickname;

      // Update Stats Summary
      if (window.achievementSystem) { // Access userStats via a global or shared way? 
        // Actually userStats is local to the achievement closure. 
        // We need to expose it or read from localStorage directly for simplicity here.
        const savedStats = localStorage.getItem('userStats');
        if (savedStats) {
          const stats = JSON.parse(savedStats);
          if (streakSummary) streakSummary.textContent = `你已与 25时 共同度过了 ${stats.streak_days || 1} 天的时光`;
          if (timeSummary) {
            const hours = ((stats.total_time || 0) / 3600).toFixed(1);
            timeSummary.textContent = `累计专注 ${hours} 小时，继续加油！`;
          }
        }
      }

      // Random Tip
      if (randomTipText) {
        randomTipText.textContent = getDailyTip();
      }
    }

    // Edit Nickname Logic
    if (editNicknameBtn) {
      editNicknameBtn.addEventListener('click', () => {
        const currentName = localStorage.getItem('userNickname') || '「世界」的居民';
        const newName = prompt('请输入你的昵称:', currentName);
        if (newName && newName.trim() !== '') {
          localStorage.setItem('userNickname', newName.trim());
          updateHomeTab();
        }
      });
    }

    // Tab switching logic
    const sidebarBtns = settingsPanel.querySelectorAll('.sidebar-btn');
    const tabContents = settingsPanel.querySelectorAll('.tab-content');

    sidebarBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        
        // Update sidebar buttons
        sidebarBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update tab contents
        tabContents.forEach(content => {
          if (content.id === `tab-${tabId}`) {
            content.classList.add('active');
          } else {
            content.classList.remove('active');
          }
        });
      });
    });

    // Event listeners
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePanel();
    });

    settingsCloseBtn.addEventListener('click', () => {
      togglePanel();
    });

    // Prevent clicks inside panel from propagating
    settingsPanel.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Version info - Placeholders replaced at build time by build.sh
    // If you see the placeholders, you're running a dev build
    const APP_VERSION = {
      commit: '__BUILD_VERSION__',
      date: '__BUILD_DATE__',
      fullSha: '__BUILD_FULL_SHA__'
    };

    // GitHub repository info for update checking
    const GITHUB_REPO = {
      owner: 'bili-47177171806',
      repo: '25ji-sagyo'
    };

    let latestCommitInfo = null;

    // Display version and check for updates
    async function displayVersion() {
      const versionEl = document.getElementById('appVersion');
      if (!versionEl) return;
      
      // Add click handler for modal
      versionEl.addEventListener('click', showVersionModal);
      
      const isDev = APP_VERSION.commit.startsWith('__');
      
      // Check if placeholders were replaced (production) or not (dev)
      if (isDev) {
        versionEl.innerHTML = '<span class="version-dev">🛠️ Dev Build</span>';
        versionEl.title = 'Click for details';
      } else {
        versionEl.innerHTML = `<span class="version-current">📦 ${APP_VERSION.date} (${APP_VERSION.commit})</span> <span class="version-checking">🔄 检查更新中...</span>`;
        versionEl.title = 'Click for details';
        
        // Check for updates from GitHub
        try {
          const latestCommit = await fetchLatestCommit();
          latestCommitInfo = latestCommit;
          updateVersionDisplay(versionEl, latestCommit);
        } catch (error) {
          console.warn('Failed to check for updates:', error);
          versionEl.innerHTML = `<span class="version-current">📦 ${APP_VERSION.date} (${APP_VERSION.commit})</span>`;
        }
      }
    }

    // Fetch latest commit info from GitHub API
    async function fetchLatestCommit() {
      const response = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO.owner}/${GITHUB_REPO.repo}/commits/main`,
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }
      
      const data = await response.json();
      return {
        sha: data.sha,
        shortSha: data.sha.substring(0, 7),
        date: new Date(data.commit.committer.date).toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).replace(/\//g, '-'),
        message: data.commit.message.split('\n')[0] // First line only
      };
    }

    // Update version display with update status
    function updateVersionDisplay(versionEl, latestCommit) {
      const isUpToDate = APP_VERSION.fullSha === latestCommit.sha || 
                         APP_VERSION.commit === latestCommit.shortSha;
      
      if (isUpToDate) {
        versionEl.innerHTML = `
          <span class="version-current">📦 ${APP_VERSION.date} (${APP_VERSION.commit})</span>
          <span class="version-uptodate">✅ 已是最新版本</span>
        `;
      } else {
        versionEl.innerHTML = `
          <span class="version-current">📦 当前: ${APP_VERSION.date} (${APP_VERSION.commit})</span>
          <span class="version-update-available">
            🆕 新版本可用: ${latestCommit.date} (${latestCommit.shortSha})
          </span>
        `;
      }
    }

    // Show version details modal
    function showVersionModal() {
      // Remove existing modal if any
      const existingModal = document.getElementById('versionModal');
      if (existingModal) existingModal.remove();

      const isDev = APP_VERSION.commit.startsWith('__');
      const isUpToDate = latestCommitInfo && (APP_VERSION.fullSha === latestCommitInfo.sha || APP_VERSION.commit === latestCommitInfo.shortSha);
      
      const modalHtml = `
        <div class="version-modal-overlay active" id="versionModal">
          <div class="version-modal">
            <div class="version-modal-header">
              <h3 class="version-modal-title">📦 版本信息</h3>
              <button class="version-modal-close" onclick="document.getElementById('versionModal').remove()">×</button>
            </div>
            
            <div class="version-info-grid">
              <div class="version-label">构建日期</div>
              <div class="version-value">${isDev ? 'Development' : APP_VERSION.date}</div>
              
              <div class="version-label">Commit</div>
              <div class="version-value">${isDev ? 'N/A' : APP_VERSION.commit}</div>
              
              <div class="version-label">Full SHA</div>
              <div class="version-value" style="font-size: 11px;">${isDev ? 'N/A' : APP_VERSION.fullSha}</div>
              
              <div class="version-label">状态</div>
              <div class="version-value">
                ${isDev ? '<span style="color: #ffa500">开发模式</span>' : 
                  (!latestCommitInfo ? '<span style="color: #aaa">检查中...</span>' : 
                    (isUpToDate ? '<span style="color: #4ade80">已是最新</span>' : '<span style="color: #60a5fa">有新版本可用</span>')
                  )
                }
              </div>
            </div>

            ${latestCommitInfo && !isUpToDate ? `
              <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);">
                <div class="version-label" style="margin-bottom: 8px;">最新版本 (${latestCommitInfo.shortSha})</div>
                <div style="font-size: 13px; color: rgba(255,255,255,0.8); background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px;">
                  ${latestCommitInfo.message}
                </div>
                <div style="font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 4px;">
                  发布于 ${latestCommitInfo.date}
                </div>
              </div>
            ` : ''}

            <div class="version-actions">
              <button class="version-btn version-btn-secondary" onclick="document.getElementById('versionModal').remove()">关闭</button>
              ${latestCommitInfo && !isUpToDate ? `
                <a href="https://github.com/${GITHUB_REPO.owner}/${GITHUB_REPO.repo}" target="_blank" class="version-btn version-btn-primary">
                  前往 GitHub 更新
                </a>
              ` : ''}
            </div>
          </div>
        </div>
      `;

      document.body.insertAdjacentHTML('beforeend', modalHtml);
      
      // Close on background click
      document.getElementById('versionModal').addEventListener('click', (e) => {
        if (e.target.id === 'versionModal') {
          e.target.remove();
        }
      });
    }

    displayVersion();
  })();

})();
