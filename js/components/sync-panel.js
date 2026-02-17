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

  async function updateSyncUI() {
    if (!loggedOutView || !loggedInView) return;

    // Check Auth State
    const isAuth = window.SekaiAuth && window.SekaiAuth.isAuthenticated();

    if (isAuth) {
      loggedOutView.classList.add('sekai-hidden');
      loggedInView.classList.remove('sekai-hidden');

      // Update User Info
      try {
        const userInfo = await window.SekaiAuth.getUserInfo();
        if (userInfo) {
           const name = userInfo.preferred_username || userInfo.name || 'User';
           const email = userInfo.email || '';
           const initial = name.charAt(0).toUpperCase();

           if (syncUserName) syncUserName.textContent = name;
           if (syncUserEmail) syncUserEmail.textContent = email;
           if (syncUserAvatar) syncUserAvatar.textContent = initial;
        }
      } catch(e) {
          console.error("Failed to fetch user info", e);
      }

      // Update Sync Status
      const lastSync = localStorage.getItem('last_sync_time');
      if (lastSyncTime) lastSyncTime.textContent = formatTime(lastSync);

    } else {
      loggedOutView.classList.remove('sekai-hidden');
      loggedInView.classList.add('sekai-hidden');
    }
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
