// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2025-2026 The 25-ji-code-de Team

// 用户资料工具：头像渲染、个性签名、聊天资料卡片与资料广播解析
(function() {
  'use strict';

  // Chat demo room only accepts {message} ≤ 256 chars; encode compact profile announces.
  const PROFILE_MSG_PREFIX = '§P:';
  const MAX_CHAT_MESSAGE_LEN = 256;
  const cache = Object.create(null);
  let cardOverlay = null;

  function t(key, fallback) {
    return window.I18n?.t(key) || fallback;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Apply avatar image or initial letter to a circle element.
   * @param {HTMLElement|null} el
   * @param {string} name
   * @param {string|null|undefined} avatarUrl
   */
  function setAvatarElement(el, name, avatarUrl) {
    if (!el) return;

    const initial = (name && name.trim() ? name.trim() : 'U').charAt(0).toUpperCase();

    if (avatarUrl && /^https:\/\//i.test(avatarUrl)) {
      el.textContent = '';
      el.classList.add('has-image');
      el.style.backgroundImage = `url("${avatarUrl.replace(/"/g, '')}")`;
      el.setAttribute('aria-label', name || 'avatar');
      // Fallback to initial if image fails
      const img = new Image();
      img.onload = () => {};
      img.onerror = () => {
        el.classList.remove('has-image');
        el.style.backgroundImage = '';
        el.textContent = initial;
      };
      img.src = avatarUrl;
      return;
    }

    el.classList.remove('has-image');
    el.style.backgroundImage = '';
    el.textContent = initial;
  }

  /**
   * Remember a profile keyed by display name (chat identity).
   * @param {object|null} profile
   */
  function remember(profile) {
    if (!profile) return;
    const displayName = (profile.displayName || profile.name || '').trim();
    if (!displayName) return;

    const prev = cache[displayName] || {};
    cache[displayName] = {
      displayName,
      username: profile.username || prev.username || '',
      avatarUrl: profile.avatarUrl || prev.avatarUrl || null,
      bio: typeof profile.bio === 'string' ? profile.bio : (prev.bio || ''),
      sub: profile.sub || prev.sub || null,
      updatedAt: Date.now()
    };
  }

  function get(name) {
    if (!name) return null;
    return cache[name] || null;
  }

  /**
   * Build a profile object from SEKAI Pass userinfo.
   */
  function fromUserInfo(userInfo) {
    if (!userInfo || !window.SekaiAuth) return null;
    const profile = window.SekaiAuth.normalizeProfile(userInfo);
    if (!profile || !profile.displayName) return null;
    remember(profile);
    return profile;
  }

  function packAnnouncement(obj) {
    return PROFILE_MSG_PREFIX + JSON.stringify(obj);
  }

  function fitsAnnouncement(payload) {
    return typeof payload === 'string' && payload.length <= MAX_CHAT_MESSAGE_LEN;
  }

  function buildAnnouncementBase(profile) {
    const base = {
      n: String(profile.displayName).slice(0, 50)
    };
    if (profile.username) base.u = String(profile.username).slice(0, 32);
    if (profile.avatarUrl) base.a = profile.avatarUrl;
    if (profile.bio) base.b = String(profile.bio);
    return base;
  }

  function shrinkAnnouncement(base) {
    let payload = packAnnouncement(base);
    if (fitsAnnouncement(payload)) return payload;

    if (base.b) {
      const withoutBio = { ...base };
      delete withoutBio.b;
      const overhead = packAnnouncement({ ...withoutBio, b: '' }).length;
      const room = MAX_CHAT_MESSAGE_LEN - overhead;
      if (room > 0) {
        base.b = base.b.slice(0, room);
        payload = packAnnouncement(base);
        if (fitsAnnouncement(payload)) return payload;
      }
      delete base.b;
      payload = packAnnouncement(base);
      if (fitsAnnouncement(payload)) return payload;
    }

    if (base.a) {
      delete base.a;
      payload = packAnnouncement(base);
      if (fitsAnnouncement(payload)) return payload;
    }

    payload = packAnnouncement({ n: base.n });
    return fitsAnnouncement(payload) ? payload : null;
  }

  /**
   * Encode profile as a special chat message (hidden from UI).
   * Fits within the chat demo 256-char limit by truncating bio first.
   * @param {object} profile
   * @returns {string|null}
   */
  function encodeAnnouncement(profile) {
    if (!profile || !profile.displayName) return null;
    return shrinkAnnouncement(buildAnnouncementBase(profile));
  }

  /**
   * Parse a profile announcement message. Returns profile or null.
   * @param {string} message
   */
  function tryParseAnnouncement(message) {
    if (typeof message !== 'string' || !message.startsWith(PROFILE_MSG_PREFIX)) {
      return null;
    }
    try {
      const data = JSON.parse(message.slice(PROFILE_MSG_PREFIX.length));
      if (!data || typeof data.n !== 'string' || !data.n.trim()) return null;
      const profile = {
        displayName: data.n.trim(),
        username: typeof data.u === 'string' ? data.u.trim() : '',
        avatarUrl: typeof data.a === 'string' && /^https:\/\//i.test(data.a) ? data.a : null,
        bio: typeof data.b === 'string' ? data.b : ''
      };
      remember(profile);
      return profile;
    } catch (e) {
      return null;
    }
  }

  function isAnnouncement(message) {
    return typeof message === 'string' && message.startsWith(PROFILE_MSG_PREFIX);
  }

  function ensureCardOverlay() {
    if (cardOverlay) return cardOverlay;
    cardOverlay = document.createElement('div');
    cardOverlay.id = 'userProfileCardOverlay';
    cardOverlay.className = 'user-profile-card-overlay sekai-hidden';
    cardOverlay.innerHTML = '<div class="user-profile-card" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(cardOverlay);

    cardOverlay.addEventListener('click', (e) => {
      if (e.target === cardOverlay) hideCard();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && cardOverlay && !cardOverlay.classList.contains('sekai-hidden')) {
        hideCard();
      }
    });

    return cardOverlay;
  }

  function hideCard() {
    if (!cardOverlay) return;
    cardOverlay.classList.add('sekai-hidden');
  }

  /**
   * Show a simple profile card.
   * @param {object} profile
   */
  function showCard(profile) {
    const overlay = ensureCardOverlay();
    const card = overlay.querySelector('.user-profile-card');
    if (!card) return;

    const displayName = (profile && profile.displayName) || t('profile.card.unknown', '未知用户');
    const username = profile && profile.username;
    const bio = profile && profile.bio;
    const avatarUrl = profile && profile.avatarUrl;
    const hasDetails = !!(username || bio || avatarUrl);

    const bioText = bio
      ? escapeHtml(bio)
      : escapeHtml(hasDetails
        ? t('profile.card.no_bio', '这个人很懒，还没有写个性签名')
        : t('profile.card.anonymous', '仅显示聊天昵称，暂无更多信息'));

    card.innerHTML = `
      <button type="button" class="user-profile-card-close" aria-label="Close">×</button>
      <div class="user-profile-card-header">
        <div class="user-avatar-circle user-profile-card-avatar" id="userProfileCardAvatar"></div>
        <div class="user-profile-card-meta">
          <div class="user-profile-card-name">${escapeHtml(displayName)}</div>
          ${username ? `<div class="user-profile-card-username">@${escapeHtml(username)}</div>` : ''}
        </div>
      </div>
      <div class="user-profile-card-bio">${bioText}</div>
    `;

    setAvatarElement(card.querySelector('#userProfileCardAvatar'), displayName, avatarUrl);

    const closeBtn = card.querySelector('.user-profile-card-close');
    if (closeBtn) closeBtn.addEventListener('click', hideCard);

    overlay.classList.remove('sekai-hidden');
  }

  /**
   * Show card for a chat display name (uses cache when available).
   * @param {string} name
   */
  function showCardForName(name) {
    const cached = get(name);
    if (cached) {
      showCard(cached);
      return;
    }
    showCard({ displayName: name });
  }

  window.UserProfile = {
    setAvatarElement,
    remember,
    get,
    fromUserInfo,
    encodeAnnouncement,
    tryParseAnnouncement,
    isAnnouncement,
    showCard,
    showCardForName,
    hideCard,
    PROFILE_MSG_PREFIX
  };
})();
