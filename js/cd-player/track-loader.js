// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2025-2026 The 25-ji-code-de Team

/**
 * Track Loader Module
 * Handles loading tracks and managing playback
 */

import { state, elements, gameCharacters } from './constants.js';
import { saveSettings } from './storage.js';
import { 
  getVocalCharacterNames, 
  updateMediaSession, 
  updateMediaSessionLocal 
} from './media-session.js';
import { extractColorsFromCover } from './visualizer.js';
import { isSpecialSong } from './category.js';

// R2 CDN base URL
const R2_BASE = window.AssetLoader ? window.AssetLoader.R2_BASE : 'https://assets.nightcord.de5.net';

/**
 * Get asset URL with R2 CDN
 * @param {string} path - Asset path
 * @returns {Promise<string>} Full URL
 */
async function getAssetUrl(path) {
  if (typeof window.AssetLoader.getAssetUrl === 'function') {
    return window.AssetLoader.getAssetUrl(path);
  }
  return R2_BASE + path;
}

/**
 * Load a track by index
 * @param {number} index - Track index in filteredMusicData
 * @param {number|null} vocalId - Optional specific vocal ID
 * @param {Function} playTrack - Play function for auto-play
 */
// Helper: Show loading spinner
function showLoadingSpinner() {
  if (elements.trackLoadingSpinner) {
    elements.trackLoadingSpinner.classList.remove('hidden');
  }
}

// Helper: Hide loading spinner
function hideLoadingSpinner() {
  if (elements.trackLoadingSpinner) {
    elements.trackLoadingSpinner.classList.add('hidden');
  }
}

// Helper: Update active item in music list
function updateActiveMusicItem(index) {
  const items = elements.musicList.querySelectorAll('.music-item:not(.import-item)');
  items.forEach(item => item.classList.remove('active'));
  if (items[index]) items[index].classList.add('active');
}

// Helper: Reset player UI
function resetPlayerUI() {
  if (elements.progressBar) elements.progressBar.value = 0;
  if (elements.currentTimeEl) elements.currentTimeEl.textContent = '0:00';
}

// Helper: Set loop for special songs
function handleSpecialSongLoop(musicId) {
  if (isSpecialSong(musicId)) {
    elements.cdAudioPlayer.loop = true;
    if (elements.repeatBtn) {
      elements.repeatBtn.classList.add('active');
    }
  }
}

// Helper: Load cover image with callback
async function loadCoverImage(coverUrl, onLoadCallback) {
  elements.albumCover.crossOrigin = "anonymous";
  elements.albumCover.src = coverUrl;
  elements.albumCover.style.opacity = '1';
  elements.albumCover.onload = () => {
    state.dominantColors = extractColorsFromCover();
    if (onLoadCallback) onLoadCallback();
  };
}

// Helper: Load cover with fallback
async function loadCoverWithFallback(coverUrl) {
  const placeholderUrl = await getAssetUrl('/mysekai/music_record_soundtrack/jacket/jacket_s_soundtrack_1.webp');

  if (coverUrl) {
    await loadCoverImage(coverUrl);
    elements.albumCover.onerror = async () => {
      elements.albumCover.src = placeholderUrl;
    };
  } else {
    await loadCoverImage(placeholderUrl);
  }

  return placeholderUrl;
}

// Helper: Set up audio player
function setupAudioPlayer(audioUrl, onError) {
  elements.cdAudioPlayer.onerror = null;
  elements.cdAudioPlayer.crossOrigin = "anonymous";
  elements.cdAudioPlayer.src = audioUrl;
  elements.cdAudioPlayer.load();

  if (onError) {
    elements.cdAudioPlayer.onerror = onError;
  }
}

// Helper: Handle audio load error
function handleAudioError() {
  console.error('Audio source failed to load');
  hideLoadingSpinner();
  state.pendingAutoPlay = false;
}

// Handle local music loading
async function loadLocalMusic(music, index) {
  elements.trackTitle.textContent = music.title;
  elements.trackArtist.textContent = `${music.composer}${music.album ? ' · ' + music.album : ''}`;
  elements.trackVocal.textContent = 'Local File';

  const placeholderUrl = await loadCoverWithFallback(music.coverUrl);

  elements.cdAudioPlayer.onerror = null;
  elements.cdAudioPlayer.src = music.audioUrl;
  elements.cdAudioPlayer.load();

  updateActiveMusicItem(index);
  saveSettings();
  resetPlayerUI();
  updateMediaSessionLocal(music, placeholderUrl);
}

/**
 * Resolve cover URL redirect and rewrite param to 240y240
 * @param {string} coverUrl - Original cover URL from API
 * @returns {Promise<string|null>} Resolved URL with param=240y240
 */
async function resolveCoverUrl(coverUrl) {
  if (!coverUrl) return null;

  try {
    // Fetch to follow redirects and get final URL
    const response = await fetch(coverUrl, {
      method: 'HEAD',
      redirect: 'follow'
    });

    let finalUrl = response.url;

    // Rewrite the param parameter to 240y240
    if (finalUrl.includes('?param=')) {
      // Replace existing param value
      finalUrl = finalUrl.replace(/(\?|&)param=[^&]*/, '$1param=240y240');
    } else if (finalUrl.includes('?')) {
      // Add param to existing query string
      finalUrl = finalUrl + '&param=240y240';
    } else {
      // Add param as first query parameter
      finalUrl = finalUrl + '?param=240y240';
    }

    return finalUrl;
  } catch (err) {
    console.warn('Failed to resolve cover URL:', coverUrl, err);
    // Fallback: return original URL
    return coverUrl;
  }
}

// Handle imported music loading
async function loadImportedMusic(music, index) {
  elements.trackTitle.textContent = music.title;
  elements.trackArtist.textContent = music.composer;
  const platformName = music.server === 'netease' ? '网易云音乐' : 'QQ音乐';
  elements.trackVocal.textContent = platformName;

  // Resolve cover URL on demand
  const resolvedCoverUrl = await resolveCoverUrl(music.coverUrl);
  const placeholderUrl = await loadCoverWithFallback(resolvedCoverUrl);

  setupAudioPlayer(music.audioUrl, handleAudioError);

  updateActiveMusicItem(index);
  saveSettings();
  resetPlayerUI();
  updateMediaSessionLocal(music, resolvedCoverUrl || placeholderUrl);
}

// Select appropriate vocal from available vocals
function selectVocal(availableVocals, vocalId) {
  let selectedVocal;

  // Try to find by vocalId
  if (vocalId) {
    selectedVocal = availableVocals.find(v => v.id === vocalId);
    if (selectedVocal) {
      state.preferredVocalType = selectedVocal.musicVocalType;
    }
  }

  // Try preferred vocal type
  if (!selectedVocal && state.preferredVocalType) {
    selectedVocal = availableVocals.find(v => v.musicVocalType === state.preferredVocalType);
  }

  // Try sekai version
  if (!selectedVocal) {
    selectedVocal = availableVocals.find(v => v.musicVocalType === 'sekai');
  }

  // Fallback to first vocal
  if (!selectedVocal) {
    selectedVocal = availableVocals[0];
  }

  return selectedVocal;
}

// Update preferred characters from vocal
function updatePreferredCharacters(vocal) {
  if (vocal.characters && vocal.characters.length > 0) {
    state.preferredCharacterIds = vocal.characters
      .filter(c => c.characterType === 'game_character')
      .map(c => c.characterId);
    saveSettings();
  }
}

// Create vocal selector button
function createVocalButton(vocal, selectedVocal, playTrack) {
  const btn = document.createElement('button');
  const characterNames = getVocalCharacterNames(vocal);
  const vocalLabel = vocal.caption || vocal.musicVocalType;
  const isSelected = vocal.id === selectedVocal.id;

  btn.textContent = characterNames ? `${vocalLabel} (${characterNames})` : vocalLabel;
  btn.style.cssText = `
    background: ${isSelected ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.4), rgba(168, 85, 247, 0.4))' : 'rgba(255,255,255,0.1)'};
    border: 1px solid ${isSelected ? 'rgba(99, 102, 241, 0.6)' : 'rgba(255,255,255,0.2)'};
    color: #fff;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  `;

  btn.addEventListener('mouseenter', () => {
    if (!isSelected) {
      btn.style.background = 'rgba(255,255,255,0.15)';
      btn.style.transform = 'translateY(-1px)';
    }
  });

  btn.addEventListener('mouseleave', () => {
    if (!isSelected) {
      btn.style.background = 'rgba(255,255,255,0.1)';
      btn.style.transform = 'translateY(0)';
    }
  });

  btn.addEventListener('click', () => {
    updatePreferredCharacters(vocal);

    const wasPlaying = state.isPlaying;
    state.pendingAutoPlay = wasPlaying;
    loadTrack(state.currentTrackIndex, vocal.id, playTrack);
  });

  return btn;
}

// Render vocal selector UI
function renderVocalSelector(availableVocals, selectedVocal, playTrack) {
  elements.trackVocal.innerHTML = '';

  if (availableVocals.length > 1) {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; gap: 6px; flex-wrap: wrap; justify-content: center;';

    availableVocals.forEach(vocal => {
      container.appendChild(createVocalButton(vocal, selectedVocal, playTrack));
    });

    elements.trackVocal.appendChild(container);
  } else {
    const characterNames = getVocalCharacterNames(selectedVocal);
    const vocalLabel = selectedVocal.caption || 'セカイver.';
    elements.trackVocal.textContent = characterNames ? `${vocalLabel} (${characterNames})` : vocalLabel;
  }
}

// Load SEKAI music (from game assets)
async function loadSekaiMusic(music, index, vocalId, playTrack) {
  const availableVocals = state.musicVocalsData.filter(vocal => vocal.musicId === music.id);

  if (availableVocals.length === 0) {
    console.error('No vocals found for music:', music.id);
    return;
  }

  const selectedVocal = selectVocal(availableVocals, vocalId);
  state.currentVocalId = selectedVocal.id;

  updatePreferredCharacters(selectedVocal);

  // Update UI
  elements.trackTitle.textContent = music.title;
  elements.trackArtist.textContent = `作曲: ${music.composer || 'Unknown'} · 作词: ${music.lyricist || 'Unknown'}`;

  renderVocalSelector(availableVocals, selectedVocal, playTrack);

  // Load album cover
  const coverPath = `/music/jacket/${music.assetbundleName}/${music.assetbundleName}.webp`;
  elements.albumCover.crossOrigin = "anonymous";
  elements.albumCover.style.display = 'block';
  elements.albumCover.style.opacity = '0.5';

  const coverUrl = await getAssetUrl(coverPath);
  elements.albumCover.src = coverUrl;
  elements.albumCover.onload = () => {
    elements.albumCover.style.opacity = '1';
    state.dominantColors = extractColorsFromCover();
  };
  elements.albumCover.onerror = () => {
    console.warn('Cover image failed to load');
  };

  // Load audio
  const audioPath = `/music/long/${selectedVocal.assetbundleName}/${selectedVocal.assetbundleName}.mp3`;
  const audioUrl = await getAssetUrl(audioPath);

  setupAudioPlayer(audioUrl, handleAudioError);

  // Skip filler at beginning
  const fillerSec = music.fillerSec || 0;
  if (fillerSec > 0 && isFinite(fillerSec)) {
    elements.cdAudioPlayer.addEventListener('loadedmetadata', function setStartTime() {
      elements.cdAudioPlayer.removeEventListener('loadedmetadata', setStartTime);
      if (isFinite(fillerSec)) {
        elements.cdAudioPlayer.currentTime = fillerSec;
      }
    });
  }

  // Update active item in list
  document.querySelectorAll('.music-item').forEach((item) => {
    const itemIndex = Array.from(item.parentElement.children).indexOf(item);
    const itemMusic = state.filteredMusicData[itemIndex];
    item.classList.toggle('active', itemMusic && itemMusic.id === music.id);
  });

  saveSettings();
  resetPlayerUI();
  updateMediaSession(music, selectedVocal, coverUrl);
}

export async function loadTrack(index, vocalId = null, playTrack = null) {
  if (index < 0 || index >= state.filteredMusicData.length) return;

  state.currentTrackIndex = index;
  const music = state.filteredMusicData[index];
  state.currentMusicId = music.id;

  handleSpecialSongLoop(music.id);
  showLoadingSpinner();

  // Route to appropriate loader
  if (music.isLocal) {
    await loadLocalMusic(music, index);
  } else if (music.isImported) {
    await loadImportedMusic(music, index);
  } else {
    await loadSekaiMusic(music, index, vocalId, playTrack);
  }
}
