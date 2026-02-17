// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2025-2026 The 25-ji-code-de Team

/**
 * Media Session API Module
 * Handles system media controls integration
 */

import { state, elements, gameCharacters } from './constants.js';

/**
 * Get character names for a vocal
 * @param {Object} vocal - Vocal object
 * @returns {string} Formatted character names
 */
export function getVocalCharacterNames(vocal) {
  if (!vocal || !vocal.characters || vocal.characters.length === 0) return '';

  const names = vocal.characters
    .filter(c => c.characterType === 'game_character')
    .map(c => gameCharacters[c.characterId])
    .filter(name => name !== undefined);

  return names.length > 0 ? names.join('・') : '';
}

/**
 * Update Media Session metadata
 * @param {Object} music - Music object
 * @param {Object} selectedVocal - Selected vocal object
 * @param {string} coverUrl - Cover image URL
 */
export function updateMediaSession(music, selectedVocal, coverUrl) {
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
        { src: coverUrl, sizes: '512x512', type: 'image/webp' },
        { src: coverUrl, sizes: '256x256', type: 'image/webp' },
        { src: coverUrl, sizes: '128x128', type: 'image/webp' },
        { src: coverUrl, sizes: '96x96', type: 'image/webp' }
      ]
    });
  } catch (e) {
    console.error('[MediaSession] Error setting metadata:', e);
  }
}

/**
 * Update playback state
 * @param {string} playbackState - 'playing', 'paused', or 'none'
 */
export function updateMediaSessionPlaybackState(playbackState) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.playbackState = playbackState;
  } catch (e) {
    console.warn('[MediaSession] Error setting playbackState:', e);
  }
}

/**
 * Update position state for seek bar
 */
export function updateMediaSessionPositionState() {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
  if (!elements.cdAudioPlayer.duration || !isFinite(elements.cdAudioPlayer.duration)) return;
  
  try {
    navigator.mediaSession.setPositionState({
      duration: elements.cdAudioPlayer.duration,
      playbackRate: elements.cdAudioPlayer.playbackRate,
      position: elements.cdAudioPlayer.currentTime
    });
  } catch (e) {
    // Ignore errors - some browsers don't support this
  }
}

/**
 * Setup Media Session action handlers
 * @param {Function} playTrack - Play function
 * @param {Function} pauseTrack - Pause function
 * @param {Function} loadTrack - Load track function
 * @param {Function} getNextTrackIndex - Get next track index function
 */
export function setupMediaSessionHandlers(playTrack, pauseTrack, loadTrack, getNextTrackIndex) {
  if (!('mediaSession' in navigator)) return;

  navigator.mediaSession.setActionHandler('play', () => {
    playTrack();
  });

  navigator.mediaSession.setActionHandler('pause', () => {
    pauseTrack();
  });

  navigator.mediaSession.setActionHandler('previoustrack', () => {
    const wasPlaying = state.isPlaying;
    pauseTrack();
    state.pendingAutoPlay = wasPlaying;
    const nextIndex = getNextTrackIndex(state.currentTrackIndex, -1, state.isShuffleOn);
    loadTrack(nextIndex);
  });

  navigator.mediaSession.setActionHandler('nexttrack', () => {
    const wasPlaying = state.isPlaying;
    pauseTrack();
    state.pendingAutoPlay = wasPlaying;
    const nextIndex = getNextTrackIndex(state.currentTrackIndex, 1, state.isShuffleOn);
    loadTrack(nextIndex);
  });

  navigator.mediaSession.setActionHandler('seekto', (details) => {
    const seekTime = details.seekTime;
    if (!isFinite(seekTime)) return;
    if (details.fastSeek && 'fastSeek' in elements.cdAudioPlayer) {
      elements.cdAudioPlayer.fastSeek(seekTime);
    } else {
      elements.cdAudioPlayer.currentTime = seekTime;
    }
  });

  navigator.mediaSession.setActionHandler('seekbackward', (details) => {
    const skipTime = details.seekOffset || 10;
    const currentTime = elements.cdAudioPlayer.currentTime;
    if (isFinite(currentTime)) {
      elements.cdAudioPlayer.currentTime = Math.max(currentTime - skipTime, 0);
    }
  });

  navigator.mediaSession.setActionHandler('seekforward', (details) => {
    const skipTime = details.seekOffset || 10;
    const currentTime = elements.cdAudioPlayer.currentTime;
    const duration = elements.cdAudioPlayer.duration || 0;
    if (isFinite(currentTime) && isFinite(duration)) {
      elements.cdAudioPlayer.currentTime = Math.min(currentTime + skipTime, duration);
    }
  });
}

/**
 * Update Media Session for local music files
 * @param {Object} music - Local music object
 * @param {string} placeholderCover - Placeholder cover URL
 */
export async function updateMediaSessionLocal(music, placeholderCover) {
  if (!('mediaSession' in navigator)) return;

  let coverUrl = music.coverUrl || placeholderCover;

  let artwork;
  if (coverUrl.startsWith('blob:') || coverUrl.startsWith('data:')) {
    artwork = [
      { src: coverUrl, sizes: '512x512' },
      { src: coverUrl, sizes: '256x256' },
      { src: coverUrl, sizes: '128x128' },
      { src: coverUrl, sizes: '96x96' }
    ];
  } else {
    const baseUrl = coverUrl.split('?')[0];
    artwork = [
      { src: baseUrl, sizes: '512x512', type: 'image/webp' },
      { src: baseUrl, sizes: '256x256', type: 'image/webp' },
      { src: baseUrl, sizes: '128x128', type: 'image/webp' },
      { src: baseUrl, sizes: '96x96', type: 'image/webp' }
    ];
  }

  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: music.title || 'Unknown Title',
      artist: music.composer || 'Unknown Artist',
      album: music.album || 'Local Music',
      artwork: artwork
    });
  } catch (e) {
    console.error('[MediaSession] Error setting local metadata:', e);
  }
}
