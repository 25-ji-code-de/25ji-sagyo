/**
 * CD Player - Entry Point
 * Assembles all modules and initializes the CD Player system
 */

import { state, elements, initElements } from './constants.js';
import { loadSettings, restoreLastTrack } from './storage.js';
import { loadMusicData } from './api.js';
import { initLocalMusic } from './local-music-db.js';
import { filterMusicList } from './music-list-ui.js';
import { displayPlaylists } from './playlist.js';
import { loadTrack } from './track-loader.js';
import { getNextTrackIndex } from './track-selection.js';
import { setupMediaSessionHandlers } from './media-session.js';
import { toggleVisualization, initVisualizationState } from './visualizer.js';
import { 
  playTrack, 
  pauseTrack, 
  setupPlaybackControls, 
  setupAudioEvents 
} from './playback-controls.js';

/**
 * Initialize the CD Player
 */
async function initCDPlayer() {
  // Initialize DOM elements
  if (!initElements()) {
    console.warn('CD Player: Essential elements not found');
    return;
  }

  if (elements.cdAudioPlayer) {
    try {
      const sliderVal = elements.cdVolumeSlider && elements.cdVolumeSlider.value;
      const parsed = sliderVal !== undefined ? parseFloat(sliderVal) : NaN;
      if (!Number.isNaN(parsed)) {
        elements.cdAudioPlayer.volume = Math.max(0, Math.min(1, parsed));
      } else {
        // Ensure existing volume is within 0..1
        elements.cdAudioPlayer.volume = Math.max(0, Math.min(1, elements.cdAudioPlayer.volume));
      }
    } catch (e) {
      // Defensive: don't let a volume sync error block initialization
      console.warn('Failed to sync initial audio volume with slider:', e);
    }
  }

  // Initialize local music database
  await initLocalMusic();

  // Initialize visualization state
  initVisualizationState();

  // Setup visualization toggle button
  if (elements.toggleVisualizationBtn) {
    elements.toggleVisualizationBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleVisualization();
    });
  }

  // Wrapper functions for passing to other modules
  const loadTrackWrapper = (index, vocalId = null) => {
    loadTrack(index, vocalId, playTrackWrapper);
  };

  const playTrackWrapper = (loadTrackFn) => {
    playTrack(loadTrackFn || loadTrackWrapper);
  };

  const filterMusicListWrapper = (query) => {
    filterMusicList(query, loadTrackWrapper, pauseTrack);
  };

  // Setup playback controls
  setupPlaybackControls(loadTrackWrapper);
  setupAudioEvents(loadTrackWrapper, playTrackWrapper);

  // Setup category buttons
  const categoryBtns = document.querySelectorAll('.category-btn');
  categoryBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      categoryBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const cat = btn.dataset.category;

      if (cat === 'playlists') {
        state.currentCategory = 'playlists';
        displayPlaylists(filterMusicListWrapper);
      } else {
        state.currentCategory = cat;
        filterMusicListWrapper(elements.musicSearchInput?.value.toLowerCase().trim() || '');
      }
    });
  });

  // Setup search functionality with debounce to reduce computation pressure
  if (elements.musicSearchInput) {
    const debouncedSearch = window.AppHelpers.debounce((query) => {
      filterMusicListWrapper(query);
    }, 250);
    
    elements.musicSearchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      debouncedSearch(query);
    });
  }

  // Toggle panel
  function togglePanel() {
    elements.cdPlayerPanel.classList.toggle('hidden');
    
    // Load music data when panel is first opened
    if (!elements.cdPlayerPanel.classList.contains('hidden') && state.filteredMusicData.length === 0) {
      loadMusicDataAndInit();
    }
  }

  // Load music data and initialize
  async function loadMusicDataAndInit() {
    try {
      elements.musicList.innerHTML = '<div class="loading">加载音乐列表中...</div>';
      
      await loadMusicData();
      
      // Initial filter
      filterMusicListWrapper('');
      
      // Load saved settings
      loadSettings();
      
      // Setup Media Session handlers
      setupMediaSessionHandlers(
        () => playTrackWrapper(),
        pauseTrack,
        loadTrackWrapper,
        getNextTrackIndex
      );
      
      // Restore last track
      restoreLastTrack(loadTrackWrapper);
    } catch (error) {
      console.error('Error loading music data:', error);
      elements.musicList.innerHTML = '<div class="loading">加载失败，请重试</div>';
    }
  }

  // Panel event listeners
  elements.cdPlayerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePanel();
  });

  elements.cdPlayerCloseBtn.addEventListener('click', () => {
    togglePanel();
  });

  // Prevent clicks inside panel from propagating
  elements.cdPlayerPanel.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Expose CD Player System globally
  window.cdPlayerSystem = {
    getRandomSong: () => {
      if (state.musicData && state.musicData.length > 0) {
        return state.musicData[Math.floor(Math.random() * state.musicData.length)];
      }
      return null;
    },
    playSongById: (id) => {
      const index = state.musicData.findIndex(track => track.id === id);
      if (index !== -1) {
        if (state.currentCategory !== 'all') {
          const allBtn = document.querySelector('.category-btn[data-category="all"]');
          if (allBtn) allBtn.click();
        }
        const filteredIndex = state.filteredMusicData.findIndex(track => track.id === id);
        if (filteredIndex !== -1) {
          loadTrackWrapper(filteredIndex);
          playTrackWrapper();
        }
      }
    }
  };
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCDPlayer);
} else {
  initCDPlayer();
}

// Export for potential external use
export { initCDPlayer };
