// SEKAI 数据同步模块
(function() {
  'use strict';

  const CONFIG = window.SEKAI_CONFIG;
  const Auth = window.SekaiAuth;

  class DataSync {
    constructor() {
      this.syncInterval = null;
      this.localVersion = 0;
    }

    /**
     * 首次登录时的数据迁移
     */
    async migrateLocalData() {
      const localStats = localStorage.getItem('userStats');
      const migrated = localStorage.getItem('data_migrated');

      if (!localStats || migrated) {
        return { migrated: false };
      }

      const stats = JSON.parse(localStats);

      // 显示迁移确认
      const confirm = window.confirm(
        '检测到本地数据，是否同步到云端？\n\n' +
        `已完成：\n` +
        `• ${stats.pomodoro_count || 0} 个番茄钟\n` +
        `• ${Math.floor((stats.total_time || 0) / 3600)} 小时学习时长\n` +
        `• ${stats.songs_played || 0} 首歌曲\n\n` +
        `同步后将自动解锁对应成就。\n` +
        `注意：连续天数等特殊成就需要重新达成。`
      );

      if (!confirm) {
        return { migrated: false, cancelled: true };
      }

      try {
        // 上传本地数据
        const response = await this.uploadData(stats);

        if (response.success) {
          localStorage.setItem('data_migrated', 'true');
          localStorage.setItem('sync_version', response.version.toString());

          // 显示迁移结果
          alert(`数据同步成功！\n版本：${response.version}`);

          return {
            migrated: true,
            version: response.version,
            data: response.data
          };
        }
      } catch (error) {
        console.error('Migration failed:', error);
        alert('数据同步失败，请稍后重试');
        return { migrated: false, error };
      }
    }

    /**
     * 获取云端数据
     */
    async fetchCloudData() {
      if (!Auth.isAuthenticated()) {
        return null;
      }

      try {
        const accessToken = await Auth.getValidAccessToken();
        if (!accessToken) return null;

        const response = await fetch(`${CONFIG.apiBaseUrl}/user/sync?project=25ji`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (!response.ok) {
          throw new Error(`Sync fetch failed: ${response.status}`);
        }

        const result = await response.json();
        return result;
      } catch (error) {
        console.error('Fetch cloud data error:', error);
        return null;
      }
    }

    /**
     * 上传本地数据到云端
     */
    async uploadData(localData) {
      if (!Auth.isAuthenticated()) {
        return { success: false, error: 'Not authenticated' };
      }

      try {
        const accessToken = await Auth.getValidAccessToken();
        if (!accessToken) {
          return { success: false, error: 'No access token' };
        }

        const version = parseInt(localStorage.getItem('sync_version') || '0');

        const response = await fetch(`${CONFIG.apiBaseUrl}/user/sync`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            project: '25ji',
            data: localData,
            version: version
          })
        });

        if (!response.ok) {
          throw new Error(`Sync upload failed: ${response.status}`);
        }

        const result = await response.json();
        return result;
      } catch (error) {
        console.error('Upload data error:', error);
        return { success: false, error: error.message };
      }
    }

    /**
     * 双向同步：合并本地和云端数据
     */
    async syncData() {
      if (!Auth.isAuthenticated()) {
        console.log('Not authenticated, skipping sync');
        return;
      }

      try {
        // 1. 获取本地数据
        const localStats = localStorage.getItem('userStats');
        if (!localStats) {
          console.log('No local data to sync');
          return;
        }

        const localData = JSON.parse(localStats);

        // 2. 上传并获取合并后的数据
        const result = await this.uploadData(localData);

        if (result.success) {
          // 3. 更新本地数据为合并后的数据
          localStorage.setItem('userStats', JSON.stringify(result.data));
          localStorage.setItem('sync_version', result.version.toString());

          console.log(`Data synced successfully, version: ${result.version}`);

          // 4. 更新 UI
          if (window.achievementSystem && window.achievementSystem.updateUI) {
            window.achievementSystem.updateUI();
          }
        }
      } catch (error) {
        console.error('Sync error:', error);
      }
    }

    /**
     * 启动自动同步（每5分钟）
     */
    startAutoSync() {
      if (this.syncInterval) {
        return;
      }

      // 立即同步一次
      this.syncData();

      // 每5分钟自动同步
      this.syncInterval = setInterval(() => {
        this.syncData();
      }, 5 * 60 * 1000);

      console.log('Auto sync started (every 5 minutes)');
    }

    /**
     * 停止自动同步
     */
    stopAutoSync() {
      if (this.syncInterval) {
        clearInterval(this.syncInterval);
        this.syncInterval = null;
        console.log('Auto sync stopped');
      }
    }

    /**
     * 手动触发同步
     */
    async manualSync() {
      console.log('Manual sync triggered');
      await this.syncData();
      alert('数据同步完成！');
    }
  }

  // 导出到全局
  window.DataSync = new DataSync();

  // 登录后自动启动同步
  document.addEventListener('DOMContentLoaded', () => {
    if (Auth.isAuthenticated()) {
      // 检查是否需要迁移
      DataSync.migrateLocalData().then(result => {
        if (result.migrated || result.cancelled === false) {
          // 启动自动同步
          DataSync.startAutoSync();
        }
      });
    }
  });
})();
