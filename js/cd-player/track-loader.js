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
export async function loadTrack(index, vocalId = null, playTrack = null) {
  if (index < 0 || index >= state.filteredMusicData.length) return;

  state.currentTrackIndex = index;
  const music = state.filteredMusicData[index];
  state.currentMusicId = music.id;

  // Force loop for special songs (STUDY series)
  if (isSpecialSong(music.id)) {
    elements.cdAudioPlayer.loop = true;
    if (elements.repeatBtn) {
      elements.repeatBtn.classList.add('active');
    }
  }

  // Show loading spinner
  if (elements.trackLoadingSpinner) {
    elements.trackLoadingSpinner.classList.remove('hidden');
  }

  // Handle Local Music
  if (music.isLocal) {
    elements.trackTitle.textContent = music.title;
    elements.trackArtist.textContent = `${music.composer}${music.album ? ' · ' + music.album : ''}`;
    elements.trackVocal.textContent = 'Local File';

    // Use cover from metadata or placeholder
    if (music.coverUrl) {
      elements.albumCover.src = music.coverUrl;
      elements.albumCover.style.opacity = '1';
      elements.albumCover.onload = () => {
        state.dominantColors = extractColorsFromCover();
      };
    } else {
      const placeholderUrl = await getAssetUrl('/mysekai/music_record_soundtrack/jacket/jacket_s_soundtrack_1.webp');
      elements.albumCover.src = placeholderUrl;
      elements.albumCover.style.opacity = '1';
      elements.albumCover.onload = () => {
        state.dominantColors = extractColorsFromCover();
      };
    }

    // Set audio source
    elements.cdAudioPlayer.onerror = null;
    elements.cdAudioPlayer.src = music.audioUrl;
    elements.cdAudioPlayer.load();

    // Update active class
    const items = elements.musicList.querySelectorAll('.music-item:not(.import-item)');
    items.forEach(item => item.classList.remove('active'));
    if (items[index]) items[index].classList.add('active');

    saveSettings();
    if (elements.progressBar) elements.progressBar.value = 0;
    if (elements.currentTimeEl) elements.currentTimeEl.textContent = '0:00';

    // Update Media Session
    const placeholderCover = await getAssetUrl('/mysekai/music_record_soundtrack/jacket/jacket_s_soundtrack_1.webp');
    updateMediaSessionLocal(music, placeholderCover);
    return;
  }

  // Handle Imported Music
  if (music.isImported) {
    elements.trackTitle.textContent = music.title;
    elements.trackArtist.textContent = music.composer;
    const platformName = music.server === 'netease' ? '网易云音乐' : 'QQ音乐';
    elements.trackVocal.textContent = platformName;

    // Use cover from imported data or placeholder
    if (music.coverUrl) {
      elements.albumCover.crossOrigin = "anonymous";
      elements.albumCover.src = music.coverUrl;
      elements.albumCover.style.opacity = '1';
      elements.albumCover.onload = () => {
        state.dominantColors = extractColorsFromCover();
      };
      elements.albumCover.onerror = async () => {
        const placeholderUrl = await getAssetUrl('/mysekai/music_record_soundtrack/jacket/jacket_s_soundtrack_1.webp');
        elements.albumCover.src = placeholderUrl;
      };
    } else {
      const placeholderUrl = await getAssetUrl('/mysekai/music_record_soundtrack/jacket/jacket_s_soundtrack_1.webp');
      elements.albumCover.src = placeholderUrl;
      elements.albumCover.style.opacity = '1';
      elements.albumCover.onload = () => {
        state.dominantColors = extractColorsFromCover();
      };
    }

    // Set audio source
    elements.cdAudioPlayer.onerror = null;
    elements.cdAudioPlayer.crossOrigin = "anonymous";
    elements.cdAudioPlayer.src = music.audioUrl;
    elements.cdAudioPlayer.load();

    elements.cdAudioPlayer.onerror = () => {
      console.error('Audio source failed to load (imported music)');
      if (elements.trackLoadingSpinner) {
        elements.trackLoadingSpinner.classList.add('hidden');
      }
      state.pendingAutoPlay = false;
    };

    // Update active class
    const items = elements.musicList.querySelectorAll('.music-item:not(.import-item)');
    items.forEach(item => item.classList.remove('active'));
    if (items[index]) items[index].classList.add('active');

    saveSettings();
    if (elements.progressBar) elements.progressBar.value = 0;
    if (elements.currentTimeEl) elements.currentTimeEl.textContent = '0:00';

    // Update Media Session
    updateMediaSessionLocal(music, music.coverUrl || await getAssetUrl('/mysekai/music_record_soundtrack/jacket/jacket_s_soundtrack_1.webp'));
    return;
  }

  // Get all vocals for this music
  const availableVocals = state.musicVocalsData.filter(
    vocal => vocal.musicId === music.id
  );

  if (availableVocals.length === 0) {
    console.error('No vocals found for music:', music.id);
    return;
  }

  // Select vocal
  let selectedVocal;

  if (vocalId) {
    selectedVocal = availableVocals.find(v => v.id === vocalId);
    if (selectedVocal) {
      state.preferredVocalType = selectedVocal.musicVocalType;
    }
  }

  if (!selectedVocal && state.preferredVocalType) {
    selectedVocal = availableVocals.find(v => v.musicVocalType === state.preferredVocalType);
  }

  if (!selectedVocal) {
    selectedVocal = availableVocals.find(v => v.musicVocalType === 'sekai');
  }

  if (!selectedVocal) {
    selectedVocal = availableVocals[0];
  }

  state.currentVocalId = selectedVocal.id;

  // Update preferred characters
  if (selectedVocal.characters && selectedVocal.characters.length > 0) {
    state.preferredCharacterIds = selectedVocal.characters
      .filter(c => c.characterType === 'game_character')
      .map(c => c.characterId);
    saveSettings();
  }

  // Update UI
  elements.trackTitle.textContent = music.title;
  elements.trackArtist.textContent = `作曲: ${music.composer || 'Unknown'} · 作词: ${music.lyricist || 'Unknown'}`;

  // Create vocal selector
  elements.trackVocal.innerHTML = '';

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
        if (vocal.characters && vocal.characters.length > 0) {
          state.preferredCharacterIds = vocal.characters
            .filter(c => c.characterType === 'game_character')
            .map(c => c.characterId);
          saveSettings();
        }
        
        const wasPlaying = state.isPlaying;
        if (wasPlaying && playTrack) {
          // Will be handled via pendingAutoPlay
        }
        state.pendingAutoPlay = wasPlaying;
        loadTrack(state.currentTrackIndex, vocal.id, playTrack);
      });

      container.appendChild(btn);
    });

    elements.trackVocal.appendChild(container);
  } else {
    const characterNames = getVocalCharacterNames(selectedVocal);
    const vocalLabel = selectedVocal.caption || 'セカイver.';
    elements.trackVocal.textContent = characterNames ? `${vocalLabel} (${characterNames})` : vocalLabel;
  }

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
  elements.cdAudioPlayer.onerror = null;
  elements.cdAudioPlayer.crossOrigin = "anonymous";

  const audioUrl = await getAssetUrl(audioPath);
  elements.cdAudioPlayer.src = audioUrl;
  elements.cdAudioPlayer.load();

  elements.cdAudioPlayer.onerror = () => {
    console.error('Audio source failed to load');
    if (elements.trackLoadingSpinner) {
      elements.trackLoadingSpinner.classList.add('hidden');
    }
    state.pendingAutoPlay = false;
  };

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
  if (elements.progressBar) elements.progressBar.value = 0;
  if (elements.currentTimeEl) elements.currentTimeEl.textContent = '0:00';

  // Update Media Session
  updateMediaSession(music, selectedVocal, coverUrl);
}
