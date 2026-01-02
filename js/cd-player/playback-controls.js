/**
 * Playback Controls Module
 * Handles play/pause, next/prev, shuffle, repeat, volume, and progress
 */

import { state, elements } from './constants.js';
import { saveSettings, loadSettings } from './storage.js';
import { formatTime } from '../utils/format.js';
import { getNextTrackIndex } from './track-selection.js';
import { 
  updateMediaSessionPlaybackState, 
  updateMediaSessionPositionState 
} from './media-session.js';
import { initAudioVisualizer, drawVisualizer } from './visualizer.js';

/**
 * Play the current track
 * @param {Function} loadTrack - Function to load a track
 */
export function playTrack(loadTrack) {
  // Initialize visualizer on first play
  if (!state.audioContext) {
    initAudioVisualizer();
  } else if (state.audioContext.state === 'suspended') {
    state.audioContext.resume();
  }

  if (state.currentTrackIndex < 0) {
    state.pendingAutoPlay = true;
    loadTrack(0);
    return;
  }

  // Wait for audio to be ready
  if (elements.cdAudioPlayer.readyState < 2) {
    if (elements.trackLoadingSpinner) {
      elements.trackLoadingSpinner.classList.remove('hidden');
    }
    state.pendingAutoPlay = true;
    return;
  }

  elements.cdAudioPlayer.play()
    .then(() => {
      state.isPlaying = true;
      elements.playPauseBtn.textContent = '⏸️';

      updateMediaSessionPlaybackState('playing');
      updateMediaSessionPositionState();

      if (elements.albumCoverContainer) {
        elements.albumCoverContainer.classList.add('playing');
      }
      
      // 广播正在播放的歌曲
      if (window.LiveStatus && window.BroadcastMessages && state.currentTrackIndex >= 0) {
        const track = state.filteredMusicData[state.currentTrackIndex];
        if (track && track.title) {
          const username = window.LiveStatus.getCurrentUsername() || '某位用户';
          const message = window.BroadcastMessages.generate('music_play', username, track.title);
          window.LiveStatus.sendBroadcast(message);
        }
      }
      
      // Start visualizer if enabled
      if (state.visualizationEnabled && state.analyser && !state.animationId) {
        drawVisualizer();
      }
    })
    .catch(error => {
      console.error('[playTrack] Error playing audio:', error);
    });
}

/**
 * Pause the current track
 */
export function pauseTrack() {
  elements.cdAudioPlayer.pause();
  state.isPlaying = false;
  elements.playPauseBtn.textContent = '▶️';

  updateMediaSessionPlaybackState('paused');

  // Stop CD animation smoothly
  if (elements.albumCoverContainer) {
    const coverStyle = window.getComputedStyle(elements.albumCover);
    const matrix = coverStyle.transform;

    if (matrix && matrix !== 'none') {
      const values = matrix.match(/matrix.*\((.+)\)/)[1].split(', ');
      const a = parseFloat(values[0]);
      const b = parseFloat(values[1]);
      const currentAngle = Math.round(Math.atan2(b, a) * (180 / Math.PI));

      elements.albumCoverContainer.classList.remove('playing');
      elements.albumCover.style.transform = `rotate(${currentAngle}deg)`;
      
      if (elements.cdAnimation) {
        elements.cdAnimation.style.transform = `rotate(${currentAngle}deg)`;
      }

      requestAnimationFrame(() => {
        elements.albumCover.style.transition = 'transform 0.8s ease-out, border-radius 0.5s ease';
        elements.albumCover.style.transform = 'rotate(0deg)';
        if (elements.cdAnimation) {
          elements.cdAnimation.style.transition = 'opacity 0.5s, transform 0.8s ease-out';
          elements.cdAnimation.style.transform = 'rotate(0deg)';
        }
      });
    } else {
      elements.albumCoverContainer.classList.remove('playing');
    }
  }
}

/**
 * Setup all playback control event listeners
 * @param {Function} loadTrack - Function to load a track
 */
export function setupPlaybackControls(loadTrack) {
  // Play/Pause button
  if (elements.playPauseBtn) {
    elements.playPauseBtn.addEventListener('click', () => {
      if (state.isPlaying) {
        pauseTrack();
      } else {
        playTrack(loadTrack);
      }
    });
  }

  // Previous track
  if (elements.prevBtn) {
    elements.prevBtn.addEventListener('click', () => {
      const wasPlaying = state.isPlaying;
      pauseTrack();
      state.pendingAutoPlay = wasPlaying;
      const nextIndex = getNextTrackIndex(state.currentTrackIndex, -1, state.isShuffleOn);
      loadTrack(nextIndex);
    });
  }

  // Next track
  if (elements.nextBtn) {
    elements.nextBtn.addEventListener('click', () => {
      const wasPlaying = state.isPlaying;
      pauseTrack();
      state.pendingAutoPlay = wasPlaying;
      const nextIndex = getNextTrackIndex(state.currentTrackIndex, 1, state.isShuffleOn);
      loadTrack(nextIndex);
    });
  }

  // Shuffle toggle
  if (elements.shuffleBtn) {
    elements.shuffleBtn.addEventListener('click', () => {
      state.isShuffleOn = !state.isShuffleOn;
      elements.shuffleBtn.classList.toggle('active', state.isShuffleOn);
      saveSettings();
    });
  }

  // Repeat toggle
  if (elements.repeatBtn) {
    elements.repeatBtn.addEventListener('click', () => {
      state.isRepeatOn = !state.isRepeatOn;
      elements.repeatBtn.classList.toggle('active', state.isRepeatOn);
      elements.cdAudioPlayer.loop = state.isRepeatOn;
      saveSettings();
    });
  }

  // Progress bar seek
  if (elements.progressBar) {
    elements.progressBar.addEventListener('input', (e) => {
      const seekTime = (e.target.value / 100) * elements.cdAudioPlayer.duration;
      elements.cdAudioPlayer.currentTime = seekTime;
    });
  }

  // Volume control
  if (elements.cdVolumeSlider) {
    elements.cdVolumeSlider.addEventListener('input', (e) => {
      elements.cdAudioPlayer.volume = parseFloat(e.target.value);
      saveSettings();
    });
  }
}

/**
 * Setup audio element event listeners
 * @param {Function} loadTrack - Function to load a track
 * @param {Function} playTrackFn - Function to play track
 */
export function setupAudioEvents(loadTrack, playTrackFn) {
  if (!elements.cdAudioPlayer) return;

  // Loading state
  elements.cdAudioPlayer.addEventListener('loadstart', () => {
    if (elements.trackLoadingSpinner) {
      elements.trackLoadingSpinner.classList.remove('hidden');
    }
  });

  elements.cdAudioPlayer.addEventListener('waiting', () => {
    if (elements.trackLoadingSpinner) {
      elements.trackLoadingSpinner.classList.remove('hidden');
    }
  });

  elements.cdAudioPlayer.addEventListener('canplay', () => {
    if (elements.trackLoadingSpinner) {
      elements.trackLoadingSpinner.classList.add('hidden');
    }

    // Auto-play if flag is set
    if (state.pendingAutoPlay) {
      state.pendingAutoPlay = false;
      setTimeout(() => {
        playTrackFn(loadTrack);
      }, 50);
    }
  });

  elements.cdAudioPlayer.addEventListener('playing', () => {
    if (elements.trackLoadingSpinner) {
      elements.trackLoadingSpinner.classList.add('hidden');
    }
  });

  elements.cdAudioPlayer.addEventListener('error', () => {
    console.error('[error event] Audio error, src:', elements.cdAudioPlayer.src);
    if (elements.trackLoadingSpinner) {
      elements.trackLoadingSpinner.classList.add('hidden');
    }
  });

  // Time update
  elements.cdAudioPlayer.addEventListener('timeupdate', () => {
    if (elements.cdAudioPlayer.duration) {
      const progress = (elements.cdAudioPlayer.currentTime / elements.cdAudioPlayer.duration) * 100;
      elements.progressBar.value = progress;
      elements.currentTimeEl.textContent = formatTime(elements.cdAudioPlayer.currentTime);
      
      // Update position state periodically
      if (state.isPlaying && Math.floor(elements.cdAudioPlayer.currentTime) % 5 === 0) {
        updateMediaSessionPositionState();
      }
    }
  });

  // Metadata loaded
  elements.cdAudioPlayer.addEventListener('loadedmetadata', () => {
    elements.totalTimeEl.textContent = formatTime(elements.cdAudioPlayer.duration);
    updateMediaSessionPositionState();
  });

  // Track ended
  elements.cdAudioPlayer.addEventListener('ended', () => {
    // Track achievement
    if (window.achievementSystem) {
      window.achievementSystem.incrementSongs();
    }

    if (!state.isRepeatOn) {
      if (state.isShuffleOn) {
        const nextIndex = getNextTrackIndex(state.currentTrackIndex, 1, true);
        state.pendingAutoPlay = true;
        loadTrack(nextIndex);
      } else {
        const nextIndex = getNextTrackIndex(state.currentTrackIndex, 1, false);

        if (nextIndex > state.currentTrackIndex) {
          state.pendingAutoPlay = true;
          loadTrack(nextIndex);
        } else {
          // End of playlist
          pauseTrack();
          elements.progressBar.value = 0;
          elements.currentTimeEl.textContent = '0:00';
        }
      }
    }
  });
}
