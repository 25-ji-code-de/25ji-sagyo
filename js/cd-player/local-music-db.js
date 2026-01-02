/**
 * Local Music Database Module
 * Handles IndexedDB operations for persisting local music files
 */

import { state } from './constants.js';

const DB_NAME = 'LocalMusicDB';
const DB_VERSION = 1;
const STORE_NAME = 'localMusic';

let db = null;

/**
 * Initialize IndexedDB
 * @returns {Promise<IDBDatabase>}
 */
export async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('IndexedDB error:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

/**
 * Save local music to IndexedDB
 * @param {Object} musicInfo - Music info object with file
 */
export async function saveLocalMusicToDB(musicInfo) {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(musicInfo);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Load all local music from IndexedDB
 * @returns {Promise<Array>}
 */
export async function loadLocalMusicFromDB() {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const items = request.result;
      // Recreate audioUrl from stored file
      items.forEach(item => {
        if (item.file) {
          item.audioUrl = URL.createObjectURL(item.file);
        }
      });
      resolve(items);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete local music from IndexedDB
 * @param {string} id - Music ID
 */
export async function deleteLocalMusicFromDB(id) {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Initialize and load saved local music on startup
 */
export async function initLocalMusic() {
  try {
    await initDB();
    const savedMusic = await loadLocalMusicFromDB();
    if (savedMusic.length > 0) {
      state.localMusicData.push(...savedMusic);
    }
  } catch (error) {
    console.error('Failed to load local music from database:', error);
  }
}

// jsmediatags library state
let jsMediaTagsLoaded = false;

/**
 * Dynamically load jsmediatags library
 * @returns {Promise<boolean>}
 */
export async function loadJsMediaTags() {
  if (jsMediaTagsLoaded || window.jsmediatags) {
    return true;
  }

  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://s4.zstatic.net/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js';
      script.onload = () => {
        jsMediaTagsLoaded = true;
        resolve();
      };
      script.onerror = () => reject(new Error('Failed to load jsmediatags'));
      document.head.appendChild(script);
    });
    return true;
  } catch (error) {
    console.error('Failed to load jsmediatags library:', error);
    return false;
  }
}

/**
 * Read metadata from audio file
 * @param {File} file - Audio file
 * @returns {Promise<Object>} Metadata object
 */
export function readMusicMetadata(file) {
  return new Promise((resolve) => {
    if (!window.jsmediatags) {
      resolve({});
      return;
    }

    window.jsmediatags.read(file, {
      onSuccess: function (tag) {
        const tags = tag.tags;
        const metadata = {};

        if (tags.title) metadata.title = tags.title;
        if (tags.artist) metadata.composer = tags.artist;
        if (tags.album) metadata.album = tags.album;

        // Extract album cover
        if (tags.picture) {
          const picture = tags.picture;
          let base64String = "";
          for (let i = 0; i < picture.data.length; i++) {
            base64String += String.fromCharCode(picture.data[i]);
          }
          metadata.coverUrl = `data:${picture.format};base64,${window.btoa(base64String)}`;
        }

        resolve(metadata);
      },
      onError: function (error) {
        console.warn('Failed to read metadata for', file.name, error);
        resolve({});
      }
    });
  });
}

/**
 * Import local music files
 * @param {Function} onComplete - Callback when import is complete
 * @param {Function} filterMusicList - Function to refresh the list
 */
export async function importLocalMusic(onComplete, filterMusicList) {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = 'audio/*';

  input.onchange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    // Load jsmediatags library
    const loaded = await loadJsMediaTags();

    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const id = 'local_' + Date.now() + '_' + index;
      const audioUrl = URL.createObjectURL(file);

      // Default values
      let musicInfo = {
        id: id,
        title: file.name.replace(/\.[^/.]+$/, ""),
        composer: 'Unknown Artist',
        lyricist: '',
        album: 'Unknown Album',
        isLocal: true,
        file: file,
        audioUrl: audioUrl,
        assetbundleName: 'local',
        coverUrl: null
      };

      // Try to read metadata
      if (loaded && window.jsmediatags) {
        const metadata = await readMusicMetadata(file);
        Object.assign(musicInfo, metadata);
      }

      state.localMusicData.push(musicInfo);

      // Save to IndexedDB
      try {
        await saveLocalMusicToDB(musicInfo);
      } catch (error) {
        console.error('Failed to save music to database:', error);
      }
    }

    if (onComplete) {
      onComplete();
    }
  };

  input.click();
}
