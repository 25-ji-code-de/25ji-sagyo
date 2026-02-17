// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2025-2026 The 25-ji-code-de Team

/**
 * CD Player Constants and State Management
 */

// Game character ID to name mapping
export const gameCharacters = {
  1: '星乃一歌', 2: '天马咲希', 3: '望月穗波', 4: '日野森志步',
  5: '花里实乃里', 6: '桐谷遥', 7: '桃井爱莉', 8: '日野森雫',
  9: '小豆泽心羽', 10: '白石杏', 11: '东云彰人', 12: '青柳冬弥',
  13: '天马司', 14: '凤笑梦', 15: '草薙宁宁', 16: '神代类',
  17: '宵崎奏', 18: '朝比奈真冬', 19: '东云绘名', 20: '晓山瑞希',
  21: '初音未来', 22: '镜音铃', 23: '镜音连', 24: '巡音流歌', 25: 'MEIKO', 26: 'KAITO'
};

// LocalStorage keys for CD Player
export const STORAGE_KEYS = {
  VOLUME: 'cdPlayer_volume',
  LAST_TRACK_ID: 'cdPlayer_lastTrackId',
  LAST_VOCAL_ID: 'cdPlayer_lastVocalId',
  SHUFFLE: 'cdPlayer_shuffle',
  REPEAT: 'cdPlayer_repeat',
  VOCAL_PREFERENCE: 'cdPlayer_vocalPreference',
  PREFERRED_CHARACTERS: 'cdPlayer_preferredCharacters',
  FAVORITES: 'cdPlayer_favorites',
  PLAYLISTS: 'cdPlayer_playlists'
};

/**
 * CD Player State - Centralized state management
 * All modules share this state object
 */
export const state = {
  // Music data
  musicData: [],
  localMusicData: [],
  musicVocalsData: [],
  musicTitlesZhCN: {},
  filteredMusicData: [],
  
  // Current playback state
  currentTrackIndex: -1,
  currentMusicId: null,
  currentVocalId: null,
  
  // Playback preferences
  preferredVocalType: 'sekai',
  preferredCharacterIds: [],
  
  // Playback mode
  isPlaying: false,
  isShuffleOn: false,
  isRepeatOn: false,
  pendingAutoPlay: false,
  
  // Collections
  favorites: new Set(),
  playlists: [],
  currentCategory: 'all',
  
  // Search index cache
  searchIndexCache: null,
  
  // Audio context for visualizer
  audioContext: null,
  analyser: null,
  source: null,
  animationId: null,
  dominantColors: [],
  visualizationEnabled: false
};

/**
 * DOM Elements cache - populated on init
 */
export const elements = {
  cdPlayerBtn: null,
  cdPlayerPanel: null,
  cdPlayerCloseBtn: null,
  toggleVisualizationBtn: null,
  musicList: null,
  musicSearchInput: null,
  albumCover: null,
  cdAnimation: null,
  trackTitle: null,
  trackArtist: null,
  trackVocal: null,
  cdAudioPlayer: null,
  trackLoadingSpinner: null,
  playPauseBtn: null,
  prevBtn: null,
  nextBtn: null,
  shuffleBtn: null,
  repeatBtn: null,
  progressBar: null,
  currentTimeEl: null,
  totalTimeEl: null,
  cdVolumeSlider: null,
  albumCoverContainer: null,
  visualizerCanvas: null,
  canvasCtx: null
};

/**
 * Initialize DOM elements
 * @returns {boolean} true if essential elements exist
 */
export function initElements() {
  elements.cdPlayerBtn = document.getElementById('cdPlayerBtn');
  elements.cdPlayerPanel = document.getElementById('cdPlayerPanel');
  elements.cdPlayerCloseBtn = document.getElementById('cdPlayerCloseBtn');
  elements.toggleVisualizationBtn = document.getElementById('toggleVisualization');
  elements.musicList = document.getElementById('musicList');
  elements.musicSearchInput = document.getElementById('musicSearchInput');
  elements.albumCover = document.getElementById('albumCover');
  elements.cdAnimation = document.getElementById('cdAnimation');
  elements.trackTitle = document.getElementById('trackTitle');
  elements.trackArtist = document.getElementById('trackArtist');
  elements.trackVocal = document.getElementById('trackVocal');
  elements.cdAudioPlayer = document.getElementById('cdAudioPlayer');
  elements.trackLoadingSpinner = document.getElementById('trackLoadingSpinner');
  elements.playPauseBtn = document.getElementById('playPauseBtn');
  elements.prevBtn = document.getElementById('prevBtn');
  elements.nextBtn = document.getElementById('nextBtn');
  elements.shuffleBtn = document.getElementById('shuffleBtn');
  elements.repeatBtn = document.getElementById('repeatBtn');
  elements.progressBar = document.getElementById('progressBar');
  elements.currentTimeEl = document.getElementById('currentTime');
  elements.totalTimeEl = document.getElementById('totalTime');
  elements.cdVolumeSlider = document.getElementById('cdVolumeSlider');
  elements.albumCoverContainer = document.querySelector('.album-cover-container');
  elements.visualizerCanvas = document.getElementById('visualizerCanvas');
  
  if (elements.visualizerCanvas) {
    elements.canvasCtx = elements.visualizerCanvas.getContext('2d');
  }
  
  // Return false if essential elements are missing
  return !!(elements.cdPlayerBtn && elements.cdPlayerPanel);
}
