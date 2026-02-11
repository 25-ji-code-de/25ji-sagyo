
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
  const syncLogoutBtn = document.getElementById('syncLogoutBtn');

  // Sidebar Button for Sync (to trigger update on click)
  const syncSidebarBtn = document.querySelector('.sidebar-btn[data-tab="sync"]');


  function formatTime(timestamp) {
    if (!timestamp) return '从未同步';
    try {
        const date = new Date(parseInt(timestamp));
        if (isNaN(date.getTime())) return '从未同步';
        return date.toLocaleString('zh-CN', {
            month: '2-digit', day: '2-digit', 
            hour: '2-digit', minute: '2-digit'
        });
    } catch(e) { return '从未同步'; }
  }

  async function updateSyncUI() {
    if (!loggedOutView || !loggedInView) return;

    // Check Auth State
    const isAuth = window.SekaiAuth && window.SekaiAuth.isAuthenticated();

    if (isAuth) {
      loggedOutView.classList.add('hidden');
      loggedInView.classList.remove('hidden');

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
      loggedOutView.classList.remove('hidden');
      loggedInView.classList.add('hidden');
    }
  }

  // Handle Manual Sync
  if (manualSyncBtn) {
    manualSyncBtn.addEventListener('click', async () => {
      if (manualSyncBtn.disabled) return;
      
      manualSyncBtn.disabled = true;
      const originalText = manualSyncBtn.innerHTML;
      manualSyncBtn.innerHTML = '<span>⏳</span> 同步中...';
      
      try {
        if (window.DataSync) {
            await window.DataSync.manualSync();
            // DataSync.manualSync alerts on finish, we just update UI
            updateSyncUI();
        } else {
            alert('同步模块未加载');
        }
      } catch(e) {
        console.error(e);
        alert('同步失败');
      } finally {
        manualSyncBtn.disabled = false;
        manualSyncBtn.innerHTML = originalText;
      }
    });
  }

  // Handle Logout
  if (syncLogoutBtn) {
      syncLogoutBtn.addEventListener('click', () => {
        if (confirm('确定要退出登录吗？')) {
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
