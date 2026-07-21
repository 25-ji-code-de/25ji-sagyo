// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2025-2026 The 25-ji-code-de Team

(function() {
  'use strict';

  // State elements
  const loggedOutView = document.getElementById('sync-logged-out');
  const loggedInView = document.getElementById('sync-logged-in');
  
  // Profile elements
  const syncUserAvatar = document.getElementById('syncUserAvatar');
  const syncUserName = document.getElementById('syncUserName');
  const syncUserEmail = document.getElementById('syncUserEmail');
  const syncUserBio = document.getElementById('syncUserBio');
  
  // Status elements
  const lastSyncTime = document.getElementById('lastSyncTime');
  
  // Action buttons
  const manualSyncBtn = document.getElementById('manualSyncBtn');
  const accountSettingsBtn = document.getElementById('accountSettingsBtn');
  const syncLogoutBtn = document.getElementById('syncLogoutBtn');

  // Sidebar Button for Sync (to trigger update on click)
  const syncSidebarBtn = document.querySelector('.sidebar-btn[data-tab="sync"]');


  function formatTime(timestamp) {
    if (!timestamp) return window.I18n?.t('settings.sync.never_synced') || 'Never synced';
    try {
        const date = new Date(parseInt(timestamp));
        if (isNaN(date.getTime())) return window.I18n?.t('settings.sync.never_synced') || 'Never synced';
        return date.toLocaleString(window.I18n?.getCurrentLanguage() || 'zh-CN', {
            month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
    } catch(e) {
        return window.I18n?.t('settings.sync.never_synced') || 'Never synced';
    }
  }

  function setSyncAuthViews(isAuth) {
    if (isAuth) {
      loggedOutView.classList.add('sekai-hidden');
      loggedInView.classList.remove('sekai-hidden');
      return;
    }
    loggedOutView.classList.remove('sekai-hidden');
    loggedInView.classList.add('sekai-hidden');
  }

  function applySyncAvatar(name, avatarUrl) {
    if (window.UserProfile) {
      window.UserProfile.setAvatarElement(syncUserAvatar, name, avatarUrl);
      return;
    }
    if (syncUserAvatar) {
      syncUserAvatar.textContent = name.charAt(0).toUpperCase();
    }
  }

  function applySyncBio(bio) {
    if (!syncUserBio) return;
    if (bio) {
      syncUserBio.textContent = bio;
      syncUserBio.classList.remove('sekai-hidden');
      return;
    }
    syncUserBio.textContent = '';
    syncUserBio.classList.add('sekai-hidden');
  }

  async function updateLoggedInProfile() {
    try {
      const userInfo = await window.SekaiAuth.getUserInfo();
      if (!userInfo) return;

      const profile = window.UserProfile
        ? window.UserProfile.fromUserInfo(userInfo)
        : null;
      const name = profile?.displayName || window.SekaiAuth.getDisplayName(userInfo, 'User');
      const email = userInfo.email || '';
      const avatarUrl = profile?.avatarUrl || window.SekaiAuth.getAvatarUrl?.(userInfo) || null;
      const bio = profile?.bio || window.SekaiAuth.getBio?.(userInfo) || '';

      if (syncUserName) syncUserName.textContent = name;
      if (syncUserEmail) syncUserEmail.textContent = email;
      applySyncAvatar(name, avatarUrl);
      applySyncBio(bio);
    } catch (e) {
      console.error('Failed to fetch user info', e);
    }
  }

  async function updateSyncUI() {
    if (!loggedOutView || !loggedInView) return;

    const isAuth = window.SekaiAuth && window.SekaiAuth.isAuthenticated();
    setSyncAuthViews(isAuth);
    if (!isAuth) return;

    await updateLoggedInProfile();

    const lastSync = localStorage.getItem('last_sync_time');
    if (lastSyncTime) lastSyncTime.textContent = formatTime(lastSync);
  }

  // Handle Manual Sync
  if (manualSyncBtn) {
    manualSyncBtn.addEventListener('click', async () => {
      if (manualSyncBtn.disabled) return;
      
      manualSyncBtn.disabled = true;
      const originalText = manualSyncBtn.innerHTML;
      manualSyncBtn.innerHTML = window.I18n?.t('settings.sync.syncing') || '⏳ Syncing...';

      try {
        if (window.DataSync) {
            await window.DataSync.manualSync();
            // DataSync.manualSync alerts on finish, we just update UI
            updateSyncUI();
        } else {
            const msg = window.I18n?.t('settings.sync.sync_module_not_loaded') || 'Sync module not loaded';
            if (window.SekaiNotification) {
                window.SekaiNotification.error(msg);
            } else {
                alert(msg);
            }
        }
      } catch(e) {
        console.error(e);
        const msg = window.I18n?.t('settings.sync.sync_failed') || 'Sync failed';
        if (window.SekaiNotification) {
            window.SekaiNotification.error(msg);
        } else {
            alert(msg);
        }
      } finally {
        manualSyncBtn.disabled = false;
        manualSyncBtn.innerHTML = originalText;
      }
    });
  }

  // Handle Account Settings
  if (accountSettingsBtn) {
    accountSettingsBtn.addEventListener('click', () => {
      window.open('https://id.nightcord.de5.net/settings', '_blank');
    });
  }

  // Handle Logout
  if (syncLogoutBtn) {
      syncLogoutBtn.addEventListener('click', async () => {
        const confirmMsg = window.I18n?.t('settings.sync.logout_confirm') || 'Are you sure you want to logout?';
        const confirmed = window.SekaiModal ? 
            await window.SekaiModal.confirm('退出登录', confirmMsg, '退出', '取消') :
            confirm(confirmMsg);

        if (confirmed) {
            if (window.SekaiAuth) {
                window.SekaiAuth.logout();
                // Logout usually reloads or we manually update
                updateSyncUI();
            }
        }
      });
  }
  
  // Listen for Tab Switching
  if (syncSidebarBtn) {
      syncSidebarBtn.addEventListener('click', () => {
          updateSyncUI();
      });
  }

  // Initial Check
  document.addEventListener('DOMContentLoaded', updateSyncUI);
  
  // Expose
  window.SyncPanel = { updateUI: updateSyncUI };

})();
