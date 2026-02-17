// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2025-2026 The 25-ji-code-de Team

/**
 * Music Category Module
 * Determines which unit/category a music belongs to
 */

import { state } from './constants.js';

// Special song IDs (STUDY WITH MIKU series)
const SPECIAL_SONG_IDS = new Set([9001, 9002]);

/**
 * Check if a music is a special song (always loops)
 * @param {number} musicId - Music ID
 * @returns {boolean} True if special song
 */
export function isSpecialSong(musicId) {
  return SPECIAL_SONG_IDS.has(musicId);
}

/**
 * Get the category of a music based on its vocals
 * @param {Object} music - Music object
 * @returns {string} Category name
 */
export function getMusicCategory(music) {
  // 0. Check for special songs first
  if (SPECIAL_SONG_IDS.has(music.id)) {
    return 'special';
  }

  // 1. Check for Sekai Unit (Human vocals)
  const sekaiVocal = state.musicVocalsData.find(
    v => v.musicId === music.id && v.musicVocalType === 'sekai'
  );
  
  if (sekaiVocal) {
    // Get all game character IDs
    const charIds = sekaiVocal.characters
      .filter(c => c.characterType === 'game_character')
      .map(c => c.characterId);

    if (charIds.length === 0) {
      return 'other';
    }

    // Check if this is a cross-unit collaboration
    const units = new Set();
    charIds.forEach(id => {
      if (id >= 1 && id <= 4) units.add('leo_need');
      else if (id >= 5 && id <= 8) units.add('more_more_jump');
      else if (id >= 9 && id <= 12) units.add('vivid_bad_squad');
      else if (id >= 13 && id <= 16) units.add('wonderlands_x_showtime');
      else if (id >= 17 && id <= 20) units.add('25_ji_nightcord_de');
    });

    // If multiple units are involved, it's a cross-unit collaboration
    if (units.size > 1) {
      return 'other';
    }

    // Single unit song
    if (units.has('leo_need')) return 'leo_need';
    if (units.has('more_more_jump')) return 'more_more_jump';
    if (units.has('vivid_bad_squad')) return 'vivid_bad_squad';
    if (units.has('wonderlands_x_showtime')) return 'wonderlands_x_showtime';
    if (units.has('25_ji_nightcord_de')) return '25_ji_nightcord_de';
  }

  // 2. Check for vocals with no characters
  const allVocals = state.musicVocalsData.filter(v =>
    v.musicId === music.id &&
    v.musicVocalType !== 'instrumental'
  );

  if (allVocals.length > 0) {
    const allHaveNoCharacters = allVocals.every(v =>
      !v.characters || v.characters.length === 0
    );

    if (allHaveNoCharacters) {
      return 'other';
    }

    // Has vocals with characters -> Virtual Singer
    return 'virtual_singer';
  }

  // 3. No vocals at all (pure instrumental)
  return 'other';
}
