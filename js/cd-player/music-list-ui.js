// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2025-2026 The 25-ji-code-de Team

/**
 * Music List UI Module
 * Handles rendering the music list and filtering
 */

import { state, elements } from './constants.js';
import { escapeHtml } from '../utils/format.js';
import { buildSearchIndex, calculateScore, prepareQueryData } from '../utils/search.js';
import { getMusicCategory } from './category.js';
import { addToPlaylist, toggleFavorite } from './playlist.js';
import { importLocalMusic, deleteLocalMusicFromDB, saveLocalMusicToDB } from './local-music-db.js';
import { openImportDialog } from './playlist-importer.js';

/**
 * Filter music list based on category and search query
 * @param {string} query - Search query
 * @param {Function} loadTrack - Function to load a track
 * @param {Function} pauseTrack - Function to pause playback
 */
export function filterMusicList(query = '', loadTrack, pauseTrack) {
  // Guard against undefined musicData
  if (!state.musicData || !Array.isArray(state.musicData)) {
    state.filteredMusicData = [];
    displayMusicList([], loadTrack, pauseTrack, (q) => filterMusicList(q, loadTrack, pauseTrack));
    return;
  }
  
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
  } else if (state.currentCategory === 'imported') {
    list = state.importedMusicData;
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
        <span class="sekai-icon-lg">${window.SVG_ICONS.download}</span>
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
  } else if (state.currentCategory === 'imported') {
    // Show Import button for Imported Playlist category
    const importBtn = document.createElement('div');
    importBtn.className = 'music-item import-item';
    importBtn.style.justifyContent = 'center';
    importBtn.style.cursor = 'pointer';
    importBtn.style.background = 'rgba(255, 255, 255, 0.1)';
    importBtn.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="sekai-icon-lg">${window.SVG_ICONS.radio}</span>
        <span>导入在线歌单...</span>
      </div>
    `;
    importBtn.addEventListener('click', () => {
      openImportDialog(() => {
        if (state.currentCategory === 'imported') {
          filterMusicListFn(elements.musicSearchInput?.value.toLowerCase().trim() || '');
        }
      });
    });
    elements.musicList.appendChild(importBtn);

    // Show Clear All button if there are imported songs
    if (list.length > 0) {
      const clearBtn = document.createElement('div');
      clearBtn.className = 'music-item import-item';
      clearBtn.style.justifyContent = 'center';
      clearBtn.style.cursor = 'pointer';
      clearBtn.style.background = 'rgba(239, 68, 68, 0.1)';
      clearBtn.style.border = '1px solid rgba(239, 68, 68, 0.3)';
      clearBtn.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="sekai-icon-lg">${window.SVG_ICONS.trash}</span>
          <span>清空全部 (${list.length}首)</span>
        </div>
      `;
      clearBtn.addEventListener('click', async () => {
        const confirmed = window.SekaiModal ?
            await window.SekaiModal.confirm('清空在线歌单', `确定要删除全部 ${list.length} 首导入的歌曲吗？`, '清空', '取消') :
            confirm(`确定要删除全部 ${list.length} 首导入的歌曲吗？`);

        if (confirmed) {
          try {
            // Copy array before deletion to avoid iteration issues
            const musicToDelete = [...state.importedMusicData];

            // Delete all imported music from IndexedDB
            for (const music of musicToDelete) {
              await deleteLocalMusicFromDB(music.id);
            }

            // Clear imported music data
            state.importedMusicData.length = 0;

            // Stop playback if playing an imported song
            if (state.currentMusicId && state.currentMusicId.startsWith('imported_')) {
              pauseTrack();
              state.currentTrackIndex = -1;
              state.currentMusicId = null;
            }

            // Refresh list
            filterMusicListFn(elements.musicSearchInput?.value.toLowerCase().trim() || '');

            if (window.SekaiNotification) {
              window.SekaiNotification.success('已清空全部导入的歌曲');
            }
          } catch (error) {
            console.error('Failed to clear imported music:', error);
            if (window.SekaiNotification) {
              window.SekaiNotification.error('清空失败，请重试');
            } else {
              alert('清空失败，请重试');
            }
          }
        }
      });
      elements.musicList.appendChild(clearBtn);
    } else {
      const tip = document.createElement('div');
      tip.style.padding = '20px';
      tip.style.textAlign = 'center';
      tip.style.color = 'rgba(255,255,255,0.5)';
      tip.textContent = '还没有导入的歌单，点击上方按钮开始导入';
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
    const isImported = music.isImported;

    const escapedTitle = escapeHtml(displayTitle);
    const escapedArtist = escapeHtml(displayArtist);

    // Platform badge for imported music
    let platformBadge = '';
    if (isImported) {
      const platformIcon = music.server === 'netease' ? window.SVG_ICONS.cloud : window.SVG_ICONS.music;
      const platformName = music.server === 'netease' ? '网易云' : 'QQ音乐';
      platformBadge = `<span class="platform-badge sekai-icon-sm" title="${platformName}">${platformIcon}</span>`;
    }

    item.innerHTML = `
      <div class="music-item-content">
        <div class="music-item-title" data-full-text="${escapedTitle.replace(/"/g, '&quot;')}">${escapedTitle}${platformBadge}</div>
        <div class="music-item-artist">${escapedArtist}</div>
      </div>
      <div class="music-item-actions">
        ${isLocal || isImported ? `
          ${isImported ? `<button class="save-to-local-btn sekai-icon-btn" title="保存到本地音乐">${window.SVG_ICONS.save}</button>` : ''}
          <button class="delete-local-btn sekai-icon-btn" title="删除">${window.SVG_ICONS.trash}</button>
        ` : `
          <button class="add-to-playlist-btn sekai-icon-btn" title="添加到歌单">${window.SVG_ICONS.plus}</button>
          <button class="favorite-btn sekai-icon-btn ${isFav ? 'active' : ''}" title="${isFav ? '取消收藏' : '添加到我喜欢的音乐'}">
            ${isFav ? window.SVG_ICONS.starFilled : window.SVG_ICONS.star}
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

    // Handle local music delete and save
    if (isLocal || isImported) {
      // Save to local button (only for imported music)
      if (isImported) {
        const saveBtn = item.querySelector('.save-to-local-btn');
        if (saveBtn) {
          saveBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const confirmed = window.SekaiModal ?
                await window.SekaiModal.confirm('保存到本地', `确定要将「${music.title}」下载并保存到本地音乐吗？`, '保存', '取消') :
                confirm(`确定要将「${music.title}」下载并保存到本地音乐吗？`);

            if (confirmed) {
              try {
                // Show loading indicator
                saveBtn.disabled = true;
                saveBtn.textContent = '⏳';
                saveBtn.title = '下载中...';

                // Show downloading notification
                if (window.SekaiNotification) {
                  window.SekaiNotification.info(`正在下载「${music.title}」...`);
                }

                // Download audio file
                const audioResponse = await fetch(music.audioUrl);
                if (!audioResponse.ok) throw new Error('Failed to download audio');
                const audioBlob = await audioResponse.blob();

                // Create File object from blob
                const audioFile = new File([audioBlob], `${music.title}.mp3`, { type: 'audio/mpeg' });

                // Download cover image if available
                let coverUrl = null;
                if (music.coverUrl) {
                  try {
                    const coverResponse = await fetch(music.coverUrl);
                    if (coverResponse.ok) {
                      const coverBlob = await coverResponse.blob();
                      // Convert to data URL for storage
                      coverUrl = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(coverBlob);
                      });
                    }
                  } catch (err) {
                    console.warn('Failed to download cover, skipping:', err);
                  }
                }

                // Create local music object with file
                const localCopy = {
                  id: 'local_saved_' + Date.now(),
                  title: music.title,
                  composer: music.composer,
                  lyricist: music.lyricist || '',
                  album: music.album,
                  isLocal: true,
                  isImported: false,
                  file: audioFile,
                  audioUrl: URL.createObjectURL(audioFile),
                  coverUrl: coverUrl,
                  assetbundleName: 'local'
                };

                // Save to IndexedDB
                await saveLocalMusicToDB(localCopy);

                // Add to local music data
                state.localMusicData.push(localCopy);

                // Restore button
                saveBtn.disabled = false;
                saveBtn.textContent = '💾';
                saveBtn.title = '保存到本地音乐';

                // Show success notification
                if (window.SekaiNotification) {
                  window.SekaiNotification.success('已下载并保存到本地音乐');
                } else {
                  alert('已下载并保存到本地音乐');
                }

                // Refresh list if in local category
                if (state.currentCategory === 'local') {
                  filterMusicListFn(elements.musicSearchInput?.value.toLowerCase().trim() || '');
                }
              } catch (error) {
                console.error('Failed to save music to local:', error);

                // Restore button
                saveBtn.disabled = false;
                saveBtn.textContent = '💾';
                saveBtn.title = '保存到本地音乐';

                if (window.SekaiNotification) {
                  window.SekaiNotification.error('下载失败，请重试');
                } else {
                  alert('下载失败，请重试');
                }
              }
            }
          });
        }
      }

      // Delete button
      const deleteBtn = item.querySelector('.delete-local-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const confirmed = window.SekaiModal ?
              await window.SekaiModal.confirm('删除音乐', `确定要删除「${music.title}」吗？`, '删除', '取消') :
              confirm(`确定要删除「${music.title}」吗？`);

          if (confirmed) {
            try {
              await deleteLocalMusicFromDB(music.id);

              // Remove from appropriate state array
              if (isImported) {
                const idx = state.importedMusicData.findIndex(m => m.id === music.id);
                if (idx !== -1) {
                  state.importedMusicData.splice(idx, 1);
                }
              } else {
                const idx = state.localMusicData.findIndex(m => m.id === music.id);
                if (idx !== -1) {
                  if (state.localMusicData[idx].audioUrl) {
                    URL.revokeObjectURL(state.localMusicData[idx].audioUrl);
                  }
                  state.localMusicData.splice(idx, 1);
                }
              }

              filterMusicListFn(elements.musicSearchInput?.value.toLowerCase().trim() || '');

              if (state.currentMusicId === music.id) {
                pauseTrack();
                state.currentTrackIndex = -1;
                state.currentMusicId = null;
              }
            } catch (error) {
              console.error('Failed to delete music:', error);
              if (window.SekaiNotification) {
                window.SekaiNotification.error('删除失败，请重试');
              } else {
                alert('删除失败，请重试');
              }
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
