// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2025-2026 The 25-ji-code-de Team

/**
 * Playlist Management Module
 * Handles playlists and favorites functionality
 */

import { state, elements } from './constants.js';
import { saveSettings } from './storage.js';

/**
 * Create a new playlist
 * @param {Function} displayPlaylists - Function to refresh playlist display
 */
export async function createPlaylist(displayPlaylists) {
  const name = window.SekaiModal ? 
    await window.SekaiModal.prompt('新建歌单', '') :
    prompt('请输入歌单名称:');
    
  if (name && name.trim()) {
    const id = 'playlist_' + Date.now();
    state.playlists.push({
      id: id,
      name: name.trim(),
      tracks: new Set()
    });
    saveSettings();
    if (displayPlaylists) displayPlaylists();
  }
}

/**
 * Delete a playlist
 * @param {string} id - Playlist ID
 * @param {Function} displayPlaylists - Function to refresh playlist display
 */
export async function deletePlaylist(id, displayPlaylists) {
  const confirmed = window.SekaiModal ? 
    await window.SekaiModal.confirm('删除歌单', '确定要删除这个歌单吗？', '删除', '取消') :
    confirm('确定要删除这个歌单吗？');

  if (confirmed) {
    state.playlists = state.playlists.filter(p => p.id !== id);
    saveSettings();
    if (displayPlaylists) displayPlaylists();
  }
}

/**
 * Add music to playlist dropdown
 * @param {number|string} musicId - Music ID
 * @param {HTMLElement} buttonElement - Button element that triggered the dropdown
 * @param {Function} filterMusicList - Function to refresh the music list
 */
export async function addToPlaylist(musicId, buttonElement, filterMusicList) {
  // Close any other open dropdowns
  document.querySelectorAll('.playlist-dropdown.show').forEach(dropdown => {
    dropdown.classList.remove('show');
  });

  if (state.playlists.length === 0) {
    const confirmed = window.SekaiModal ? 
      await window.SekaiModal.confirm('创建歌单', '还没有创建歌单，是否现在创建？', '创建', '取消') :
      confirm('还没有创建歌单，是否现在创建？');
      
    if (confirmed) {
      await createPlaylist(null);
    }
    return;
  }

  // Create dropdown
  const dropdown = document.createElement('div');
  dropdown.className = 'playlist-dropdown show';

  state.playlists.forEach(p => {
    const item = document.createElement('div');
    item.className = 'playlist-dropdown-item';
    const isAdded = p.tracks.has(musicId);

    const icon = document.createElement('span');
    icon.className = 'playlist-dropdown-icon sekai-icon-sm';
    icon.innerHTML = window.SVG_ICONS.folder;

    const name = document.createElement('span');
    name.className = 'playlist-dropdown-name';
    name.textContent = p.name;

    const check = document.createElement('span');
    check.className = 'playlist-dropdown-check sekai-icon-sm';
    check.innerHTML = isAdded ? window.SVG_ICONS.check : '';

    item.appendChild(icon);
    item.appendChild(name);
    item.appendChild(check);

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isAdded) {
        p.tracks.delete(musicId);
      } else {
        p.tracks.add(musicId);
      }
      saveSettings();
      dropdown.remove();
      
      // Refresh list if viewing this playlist
      if (state.currentCategory === p.id && filterMusicList) {
        filterMusicList(elements.musicSearchInput?.value.toLowerCase().trim() || '');
      }
    });

    dropdown.appendChild(item);
  });

  // New playlist option
  const newItem = document.createElement('div');
  newItem.className = 'playlist-dropdown-item create-new';

  const newIcon = document.createElement('span');
  newIcon.className = 'playlist-dropdown-icon sekai-icon-sm';
  newIcon.innerHTML = window.SVG_ICONS.plus;

  const newName = document.createElement('span');
  newName.className = 'playlist-dropdown-name';
  newName.textContent = '新建歌单';

  newItem.appendChild(newIcon);
  newItem.appendChild(newName);

  newItem.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.remove();
    createPlaylist(null);
  });

  dropdown.appendChild(newItem);

  // Position dropdown
  const actionsContainer = buttonElement.closest('.music-item-actions');
  if (actionsContainer) {
    actionsContainer.appendChild(dropdown);
  }

  // Close dropdown when clicking outside
  const closeDropdown = (e) => {
    if (!document.body.contains(dropdown)) {
      document.removeEventListener('click', closeDropdown, true);
      return;
    }

    if (!dropdown.contains(e.target) && !buttonElement.contains(e.target)) {
      dropdown.classList.remove('show');
      setTimeout(() => {
        if (document.body.contains(dropdown)) {
          dropdown.remove();
        }
      }, 150);
      document.removeEventListener('click', closeDropdown, true);
    }
  };

  setTimeout(() => {
    document.addEventListener('click', closeDropdown, true);
  }, 0);

  // Close on Escape
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      dropdown.classList.remove('show');
      setTimeout(() => dropdown.remove(), 150);
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

/**
 * Display playlists grid
 * @param {Function} filterMusicList - Function to filter music list when clicking a playlist
 */
export function displayPlaylists(filterMusicList) {
  elements.musicList.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'playlist-grid';

  // Create New Card
  const createCard = document.createElement('div');
  createCard.className = 'playlist-card create-new';
  createCard.innerHTML = `
    <div class="playlist-icon sekai-icon-lg">${window.SVG_ICONS.plus}</div>
    <div class="playlist-name">新建歌单</div>
  `;
  createCard.addEventListener('click', () => createPlaylist(() => displayPlaylists(filterMusicList)));
  grid.appendChild(createCard);

  // Playlist Cards
  state.playlists.forEach(p => {
    const card = document.createElement('div');
    card.className = 'playlist-card';
    card.innerHTML = `
      <div class="playlist-icon sekai-icon-lg">${window.SVG_ICONS.folder}</div>
      <div class="playlist-name">${p.name}</div>
      <div class="playlist-count">${p.tracks.size} 首歌曲</div>
    `;

    // Right click to delete
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      deletePlaylist(p.id, () => displayPlaylists(filterMusicList));
    });

    card.addEventListener('click', () => {
      state.currentCategory = p.id;
      // Update category buttons
      document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
      const plBtn = document.querySelector('.category-btn[data-category="playlists"]');
      if (plBtn) plBtn.classList.add('active');

      if (filterMusicList) filterMusicList('');
    });

    grid.appendChild(card);
  });

  elements.musicList.appendChild(grid);
}

/**
 * Toggle favorite status
 * @param {number|string} musicId - Music ID
 * @param {HTMLElement} btn - Favorite button element
 * @param {Function} filterMusicList - Function to refresh the list
 */
export function toggleFavorite(musicId, btn, filterMusicList) {
  if (state.favorites.has(musicId)) {
    state.favorites.delete(musicId);
    btn.classList.remove('active');
    btn.innerHTML = window.SVG_ICONS.star;
    btn.title = '添加到收藏';
  } else {
    state.favorites.add(musicId);
    btn.classList.add('active');
    btn.innerHTML = window.SVG_ICONS.starFilled;
    btn.title = '取消收藏';
  }
  saveSettings();

  // Refresh if viewing favorites
  if (state.currentCategory === 'favorites' && filterMusicList) {
    filterMusicList(elements.musicSearchInput?.value.toLowerCase().trim() || '');
  }
}
