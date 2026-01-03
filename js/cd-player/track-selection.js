/**
 * Track Selection Module
 * Intelligent next track selection based on preferences
 */

import { state } from './constants.js';

/**
 * Check if a music has vocals matching preferred characters
 * @param {number} musicId - Music ID
 * @returns {boolean}
 */
export function checkMusicHasPreferredCharacters(musicId) {
  if (!state.preferredCharacterIds || state.preferredCharacterIds.length === 0) {
    return false;
  }
  
  if (!state.musicVocalsData || !Array.isArray(state.musicVocalsData)) {
    return false;
  }
  
  const matchingVocals = state.musicVocalsData.filter(v => {
    if (v.musicId !== musicId) return false;
    if (!v.characters || v.characters.length === 0) return false;
    
    const vocalCharIds = v.characters
      .filter(c => c.characterType === 'game_character')
      .map(c => c.characterId);
    
    return state.preferredCharacterIds.some(prefId => vocalCharIds.includes(prefId));
  });
  
  return matchingVocals.length > 0;
}

/**
 * Check if a music has a specific vocal type
 * @param {number} musicId - Music ID
 * @param {string} type - Vocal type
 * @returns {boolean}
 */
export function checkMusicHasVocalType(musicId, type) {
  if (!type) return true;
  return state.musicVocalsData.some(
    v => v.musicId === musicId && v.musicVocalType === type
  );
}

/**
 * Find next track index based on preferences
 * Character preference takes priority over vocal type preference
 * @param {number} currentIndex - Current track index
 * @param {number} direction - Direction (1 for next, -1 for previous)
 * @param {boolean} isShuffle - Whether shuffle is enabled
 * @returns {number} Next track index
 */
export function getNextTrackIndex(currentIndex, direction, isShuffle) {
  // Guard against undefined or empty filteredMusicData
  if (!state.filteredMusicData || !Array.isArray(state.filteredMusicData) || state.filteredMusicData.length === 0) {
    return 0;
  }
  
  let attempts = 0;
  let nextIndex = currentIndex;
  const maxAttempts = state.filteredMusicData.length;

  if (isShuffle) {
    // First try to find music with preferred characters
    if (state.preferredCharacterIds.length > 0) {
      while (attempts < maxAttempts) {
        const r = Math.floor(Math.random() * state.filteredMusicData.length);
        const music = state.filteredMusicData[r];
        if (checkMusicHasPreferredCharacters(music.id)) {
          return r;
        }
        attempts++;
      }
    }
    
    // Fallback to vocal type preference
    attempts = 0;
    while (attempts < maxAttempts) {
      const r = Math.floor(Math.random() * state.filteredMusicData.length);
      const music = state.filteredMusicData[r];
      if (checkMusicHasVocalType(music.id, state.preferredVocalType)) {
        return r;
      }
      attempts++;
    }
    return Math.floor(Math.random() * state.filteredMusicData.length);
  } else {
    // Sequential mode with character preference
    if (state.preferredCharacterIds.length > 0) {
      while (attempts < maxAttempts) {
        nextIndex = (nextIndex + direction + state.filteredMusicData.length) % state.filteredMusicData.length;
        const music = state.filteredMusicData[nextIndex];
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
      nextIndex = (nextIndex + direction + state.filteredMusicData.length) % state.filteredMusicData.length;
      const music = state.filteredMusicData[nextIndex];
      if (checkMusicHasVocalType(music.id, state.preferredVocalType)) {
        return nextIndex;
      }
      attempts++;
    }
    return (currentIndex + direction + state.filteredMusicData.length) % state.filteredMusicData.length;
  }
}
