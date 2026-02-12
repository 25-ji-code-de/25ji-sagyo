// SEKAI Pass 登录按钮逻辑
(function() {
  'use strict';

  // 等待 DOM 加载完成
  document.addEventListener('DOMContentLoaded', () => {
    // 查找设置面板中的登录按钮
    const loginBtn = document.querySelector('.primary-btn[data-i18n="settings.sync.login_btn"]');
    if (!loginBtn) {
      console.warn('Login button not found in settings panel');
      return;
    }

    // 检查登录状态并更新 UI
    async function updateLoginUI() {
      if (window.SekaiAuth && window.SekaiAuth.isAuthenticated()) {
        loginBtn.textContent = '已登录 ✓';
        loginBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';

        // 更新设置面板中的昵称显示
        if (window.SettingsPanel && window.SettingsPanel.updateHomeTab) {
          await window.SettingsPanel.updateHomeTab();
        }
      } else {
        loginBtn.textContent = '登录 / 注册';
        loginBtn.style.background = '';

        // 更新设置面板中的昵称显示
        if (window.SettingsPanel && window.SettingsPanel.updateHomeTab) {
          await window.SettingsPanel.updateHomeTab();
        }
      }
    }

    // 点击登录/登出
    loginBtn.addEventListener('click', async (e) => {
      e.preventDefault();

      if (window.SekaiAuth.isAuthenticated()) {
        // 已登录，显示用户信息和登出选项
        const userInfo = await window.SekaiAuth.getUserInfo();
        if (userInfo) {
          const username = userInfo.preferred_username || userInfo.name || userInfo.email;
          const confirmed = window.SekaiModal ? 
            await window.SekaiModal.confirm('账户信息', `已登录为: ${username}\n是否退出登录？`, '退出登录', '取消') :
            confirm(`已登录为: ${username}\n\n点击"确定"登出`);
            
          if (confirmed) {
            window.SekaiAuth.logout();
          }
        }
      } else {
        // 未登录，跳转登录
        window.SekaiAuth.login();
      }
    });

    // 初始化
    updateLoginUI();

    // 监听登录状态变化
    window.addEventListener('storage', async (e) => {
      if (e.key === 'sekai_access_token') {
        await updateLoginUI();
      }
    });
  });
})();
