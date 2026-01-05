/**
 * Music Data API Module
 * Handles fetching and parsing music data from remote API
 */

import { state } from './constants.js';

const API_URL = 'https://storage.nightcord.de5.net/music_data.json';

/**
 * Load music data from unified API
 * @returns {Promise<void>}
 */
export async function loadMusicData() {
  const response = await fetch(API_URL);
  if (!response.ok) {
    throw new Error('Failed to fetch music data');
  }
  
  const raw = await response.json();

  // Map compressed field names to full names
  // API v2 format: i=id, t=title, p=pronunciation, tz=titleZhCN, c=composer, l=lyricist, a=assetbundleName, f=fillerSec, v=vocals
  // vocals: i=id, t=type, c=caption, a=assetbundleName, ch=characters (array of [id, type])
  state.musicData = raw.m.map(m => ({
    id: m.i,
    title: m.t,
    pronunciation: m.p,
    titleZhCN: m.tz,
    composer: m.c,
    lyricist: m.l,
    assetbundleName: m.a,
    fillerSec: m.f || 0,
    vocals: m.v ? m.v.map(v => ({
      id: v.i,
      type: v.t,
      caption: v.c,
      assetbundleName: v.a,
      characters: v.ch ? v.ch.map(ch => ({
        id: ch[0],
        type: ch[1]
      })) : []
    })) : []
  }));

  // Build flattened musicVocalsData (add musicId to each vocal)
  state.musicVocalsData = [];
  state.musicData.forEach(music => {
    if (music.vocals) {
      music.vocals.forEach(vocal => {
        state.musicVocalsData.push({
          ...vocal,
          musicId: music.id,
          // Map to legacy field names for compatibility
          musicVocalType: vocal.type,
          characters: vocal.characters.map(c => ({
            ...c,
            characterType: c.type,
            characterId: c.id
          }))
        });
      });
    }
  });

  // Add special songs (STUDY WITH MIKU series)
  const specialSongs = [
    {
      id: 9001,
      title: "STUDY WITH MIKU - part SEKAI -",
      pronunciation: "すたでぃうぃずみく",
      titleZhCN: "与初音未来一起学习",
      composer: "初音ミク × Project SEKAI",
      lyricist: "-",
      assetbundleName: "swm_part_sekai",
      fillerSec: 0,
      vocals: [
        {
          id: 900101,
          type: "instrumental",
          caption: "Inst.ver.",
          assetbundleName: "swm_part_sekai",
          characters: []
        }
      ]
    },
    {
      id: 9002,
      title: "STUDY IN SEKAI",
      pronunciation: "すたでぃいんせかい",
      titleZhCN: "STUDY IN SEKAI",
      composer: "Project SEKAI Official",
      lyricist: "-",
      assetbundleName: "study_in_sekai",
      fillerSec: 0,
      vocals: [
        {
          id: 900201,
          type: "sekai",
          caption: "セカイver.",
          assetbundleName: "study_in_sekai",
          characters: []
        }
      ]
    }
  ];

  // Add special songs to musicData
  state.musicData.push(...specialSongs);

  // Add special songs vocals to musicVocalsData
  specialSongs.forEach(music => {
    music.vocals.forEach(vocal => {
      state.musicVocalsData.push({
        ...vocal,
        musicId: music.id,
        musicVocalType: vocal.type,
        characters: []
      });
    });
  });

  // Build Chinese title mapping
  state.musicTitlesZhCN = {};
  state.musicData.forEach(music => {
    if (music.titleZhCN) {
      state.musicTitlesZhCN[music.id] = music.titleZhCN;
    }
  });

  // Clear search index cache
  state.searchIndexCache = null;
}
