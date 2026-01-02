/**
 * Music List UI Module
 * Handles rendering the music list and filtering
 */

import { state, elements } from './constants.js';
import { escapeHtml } from '../utils/format.js';
import { buildSearchIndex, calculateScore, prepareQueryData } from '../utils/search.js';
import { getMusicCategory } from './category.js';
import { addToPlaylist, toggleFavorite } from './playlist.js';
import { importLocalMusic, deleteLocalMusicFromDB } from './local-music-db.js';

/**
 * Filter music list based on category and search query
 * @param {string} query - Search query
 * @param {Function} loadTrack - Function to load a track
 * @param {Function} pauseTrack - Function to pause playback
 */
export function filterMusicList(query = '', loadTrack, pauseTrack) {
  let list = state.musicData.filter(music => {
    const hasVocal = state.musicVocalsData.some(
      vocal => vocal.musicId === music.id
    );
    return hasVocal;
  });

  // Filter by category
  if (state.currentCategory === 'favorites') {
    list = list.filter(music => state.favorites.has(music.id));
  } else if (state.currentCategory === 'local') {
    list = state.localMusicData;
  } else if (state.currentCategory.startsWith('playlist_')) {
    const playlistId = state.currentCategory;
    const playlist = state.playlists.find(p => p.id === playlistId);
    if (playlist) {
      list = list.filter(music => playlist.tracks.has(music.id));
    } else {
      list = [];
    }
  } else if (state.currentCategory !== 'all') {
    list = list.filter(music => getMusicCategory(music) === state.currentCategory);
  }

  // Filter by search query
  if (query) {
    if (!state.searchIndexCache) {
      state.searchIndexCache = buildSearchIndex(state.musicData, state.musicTitlesZhCN);
    }
    
    const indexMap = new Map(state.searchIndexCache.map(item => [item.id, item]));
    const queryData = prepareQueryData(query);
    
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
    
    scoredList.sort((a, b) => b.score - a.score);
    list = scoredList.map(item => item.music);
  }

  state.filteredMusicData = list;
  displayMusicList(list, loadTrack, pauseTrack, (q) => filterMusicList(q, loadTrack, pauseTrack));
}

/**
 * Display the music list
 * @param {Array} list - Filtered music list
 * @param {Function} loadTrack - Function to load a track
 * @param {Function} pauseTrack - Function to pause playback
 * @param {Function} filterMusicListFn - Function to filter music list
 */
export function displayMusicList(list, loadTrack, pauseTrack, filterMusicListFn) {
  elements.musicList.innerHTML = '';

  // Show Import button for Local Music category
  if (state.currentCategory === 'local') {
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
    importBtn.addEventListener('click', () => {
      importLocalMusic(() => {
        if (state.currentCategory === 'local') {
          filterMusicListFn(elements.musicSearchInput?.value.toLowerCase().trim() || '');
        }
      }, filterMusicListFn);
    });
    elements.musicList.appendChild(importBtn);

    if (list.length === 0) {
      const tip = document.createElement('div');
      tip.style.padding = '20px';
      tip.style.textAlign = 'center';
      tip.style.color = 'rgba(255,255,255,0.5)';
      tip.textContent = '支持 MP3, FLAC, WAV 等格式';
      elements.musicList.appendChild(tip);
      return;
    }
  } else if (list.length === 0) {
    elements.musicList.innerHTML = '<div class="loading">没有找到歌曲</div>';
    return;
  }

  list.forEach((music, index) => {
    const item = document.createElement('div');
    item.className = 'music-item';
    
    if (state.currentMusicId === music.id) {
      item.classList.add('active');
    }

    const displayTitle = music.title;
    let displayArtist = music.composer || 'Unknown';

    if (music.isLocal && music.album && music.album !== 'Unknown Album') {
      displayArtist = `${displayArtist} · ${music.album}`;
    }

    const isFav = state.favorites.has(music.id);
    const isLocal = music.isLocal;

    const escapedTitle = escapeHtml(displayTitle);
    const escapedArtist = escapeHtml(displayArtist);

    item.innerHTML = `
      <div class="music-item-content">
        <div class="music-item-title" data-full-text="${escapedTitle.replace(/"/g, '&quot;')}">${escapedTitle}</div>
        <div class="music-item-artist">${escapedArtist}</div>
      </div>
      <div class="music-item-actions">
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

    // Check for title scrolling
    const titleElement = item.querySelector('.music-item-title');
    const contentElement = item.querySelector('.music-item-content');

    requestAnimationFrame(() => {
      const containerWidth = contentElement.clientWidth;
      const textWidth = titleElement.scrollWidth;

      if (textWidth > containerWidth) {
        titleElement.classList.add('scrolling');
        contentElement.style.overflow = 'visible';
        const scrollDistance = -(textWidth - containerWidth);
        titleElement.style.setProperty('--scroll-distance', `${scrollDistance}px`);
      }
    });

    // Click to play
    const content = item.querySelector('.music-item-content');
    content.addEventListener('click', () => {
      const trackIndex = state.filteredMusicData.indexOf(music);
      state.pendingAutoPlay = true;
      loadTrack(trackIndex);
    });

    // Handle local music delete
    if (isLocal) {
      const deleteBtn = item.querySelector('.delete-local-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm(`确定要删除「${music.title}」吗？`)) {
            try {
              await deleteLocalMusicFromDB(music.id);

              const idx = state.localMusicData.findIndex(m => m.id === music.id);
              if (idx !== -1) {
                if (state.localMusicData[idx].audioUrl) {
                  URL.revokeObjectURL(state.localMusicData[idx].audioUrl);
                }
                state.localMusicData.splice(idx, 1);
              }

              filterMusicListFn(elements.musicSearchInput?.value.toLowerCase().trim() || '');

              if (state.currentMusicId === music.id) {
                pauseTrack();
                state.currentTrackIndex = -1;
                state.currentMusicId = null;
              }
            } catch (error) {
              console.error('Failed to delete music:', error);
              alert('删除失败，请重试');
            }
          }
        });
      }
    } else {
      // Add to playlist button
      const addBtn = item.querySelector('.add-to-playlist-btn');
      if (addBtn) {
        addBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          addToPlaylist(music.id, addBtn, filterMusicListFn);
        });
      }

      // Favorite button
      const favBtn = item.querySelector('.favorite-btn');
      if (favBtn) {
        favBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleFavorite(music.id, favBtn, filterMusicListFn);
        });
      }
    }

    elements.musicList.appendChild(item);
  });
}
