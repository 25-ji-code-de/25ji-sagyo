/**
 * CD Player Storage Module
 * Handles localStorage persistence for settings
 */

import { STORAGE_KEYS, state, elements } from './constants.js';

/**
 * Save all settings to localStorage
 */
export function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEYS.VOLUME, elements.cdAudioPlayer.volume);
    
    if (state.currentMusicId !== null) {
      localStorage.setItem(STORAGE_KEYS.LAST_TRACK_ID, state.currentMusicId);
    }
    if (state.currentVocalId !== null) {
      localStorage.setItem(STORAGE_KEYS.LAST_VOCAL_ID, state.currentVocalId);
    }
    
    localStorage.setItem(STORAGE_KEYS.SHUFFLE, state.isShuffleOn);
    localStorage.setItem(STORAGE_KEYS.REPEAT, state.isRepeatOn);
    localStorage.setItem(STORAGE_KEYS.VOCAL_PREFERENCE, state.preferredVocalType);
    localStorage.setItem(STORAGE_KEYS.PREFERRED_CHARACTERS, JSON.stringify(state.preferredCharacterIds));
    localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify([...state.favorites]));

    // Serialize playlists (convert Sets to Arrays)
    const serializedPlaylists = state.playlists.map(p => ({
      id: p.id,
      name: p.name,
      tracks: [...p.tracks]
    }));
    localStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(serializedPlaylists));
  } catch (e) {
    console.warn('Failed to save CD player settings:', e);
  }
}

/**
 * Load all settings from localStorage
 */
export function loadSettings() {
  try {
    const savedVolume = localStorage.getItem(STORAGE_KEYS.VOLUME);
    if (savedVolume !== null) {
      const vol = parseFloat(savedVolume);
      elements.cdAudioPlayer.volume = vol;
      if (elements.cdVolumeSlider) {
        elements.cdVolumeSlider.value = vol;
      }
    }

    const savedShuffle = localStorage.getItem(STORAGE_KEYS.SHUFFLE);
    if (savedShuffle !== null) {
      state.isShuffleOn = savedShuffle === 'true';
      if (elements.shuffleBtn) {
        elements.shuffleBtn.classList.toggle('active', state.isShuffleOn);
      }
    }

    const savedRepeat = localStorage.getItem(STORAGE_KEYS.REPEAT);
    if (savedRepeat !== null) {
      state.isRepeatOn = savedRepeat === 'true';
      if (elements.repeatBtn) {
        elements.repeatBtn.classList.toggle('active', state.isRepeatOn);
      }
      elements.cdAudioPlayer.loop = state.isRepeatOn;
    }

    const savedVocalPref = localStorage.getItem(STORAGE_KEYS.VOCAL_PREFERENCE);
    if (savedVocalPref !== null) {
      state.preferredVocalType = savedVocalPref;
    }

    const savedCharacters = localStorage.getItem(STORAGE_KEYS.PREFERRED_CHARACTERS);
    if (savedCharacters !== null) {
      state.preferredCharacterIds = JSON.parse(savedCharacters) || [];
    }

    const savedFavorites = localStorage.getItem(STORAGE_KEYS.FAVORITES);
    if (savedFavorites !== null) {
      state.favorites = new Set(JSON.parse(savedFavorites));
    }

    const savedPlaylists = localStorage.getItem(STORAGE_KEYS.PLAYLISTS);
    if (savedPlaylists !== null) {
      const parsed = JSON.parse(savedPlaylists);
      state.playlists = parsed.map(p => ({
        id: p.id,
        name: p.name,
        tracks: new Set(p.tracks)
      }));
    }
  } catch (e) {
    console.warn('Failed to load CD player settings:', e);
  }
}

/**
 * Restore last played track by musicId
 * Called after music data is loaded
 * @param {Function} loadTrack - The loadTrack function to call
 */
export function restoreLastTrack(loadTrack) {
  try {
    const savedMusicId = localStorage.getItem(STORAGE_KEYS.LAST_TRACK_ID);
    const savedVocalId = localStorage.getItem(STORAGE_KEYS.LAST_VOCAL_ID);
    
    if (savedMusicId !== null) {
      const index = state.filteredMusicData.findIndex(m => m.id === parseInt(savedMusicId));
      if (index >= 0) {
        loadTrack(index, savedVocalId ? parseInt(savedVocalId) : null);
      }
    }
  } catch (e) {
    console.warn('Failed to restore last track:', e);
  }
}

/**
 * Load visualization preference
 */
export function loadVisualizationPreference() {
  try {
    const saved = localStorage.getItem('visualizationEnabled');
    if (saved !== null) {
      state.visualizationEnabled = saved === 'true';
    } else {
      state.visualizationEnabled = false;
    }
    return state.visualizationEnabled;
  } catch (e) {
    return false;
  }
}

/**
 * Save visualization preference
 */
export function saveVisualizationPreference() {
  try {
    localStorage.setItem('visualizationEnabled', state.visualizationEnabled);
  } catch (e) {
    // Ignore errors
  }
}
