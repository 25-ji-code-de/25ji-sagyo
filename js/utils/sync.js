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
     * 收集本地数据准备上传
     */
    collectLocalData() {
      const data = {};

      // 1. 用户统计数据（总是包含）
      const userStats = localStorage.getItem('userStats');
      if (userStats) {
        data.userStats = JSON.parse(userStats);
      }

      // 2. 偏好设置（只在用户修改过时包含）
      const preferencesModified = localStorage.getItem('preferences_modified');
      if (preferencesModified) {
        data.preferences = {
          language: localStorage.getItem('app_language'),
          worldClockTimeZones: JSON.parse(localStorage.getItem('worldClockTimeZones') || 'null'),
          healthReminderConfig: JSON.parse(localStorage.getItem('health_reminder_config') || 'null'),
          visualizationEnabled: localStorage.getItem('visualizationEnabled'),
          clockWidgetVisible: localStorage.getItem('clockWidgetVisible'),
          userNickname: localStorage.getItem('userNickname')
        };
        data.preferences_modified = true;
      }

      // 3. CD 播放器设置（只在用户使用过时包含）
      const cdPlayerUsed = localStorage.getItem('cdPlayer_used');
      if (cdPlayerUsed) {
        data.cdPlayer = {
          volume: localStorage.getItem('cd_player_volume'),
          favorites: JSON.parse(localStorage.getItem('cd_player_favorites') || '[]'),
          playlists: JSON.parse(localStorage.getItem('cd_player_playlists') || '[]'),
          lastTrackId: localStorage.getItem('cd_player_last_track_id'),
          lastVocalId: localStorage.getItem('cd_player_last_vocal_id'),
          vocalPreference: localStorage.getItem('cd_player_vocal_preference'),
          repeat: localStorage.getItem('cd_player_repeat'),
          shuffle: localStorage.getItem('cd_player_shuffle'),
          preferredCharacters: JSON.parse(localStorage.getItem('cd_player_preferred_characters') || '[]')
        };
        data.cdPlayer_used = true;
      }

      return data;
    }

    /**
     * 应用云端数据到本地
     */
    applyCloudData(cloudData) {
      // 1. 用户统计数据
      if (cloudData.userStats) {
        localStorage.setItem('userStats', JSON.stringify(cloudData.userStats));
      }

      // 2. 偏好设置
      if (cloudData.preferences) {
        const prefs = cloudData.preferences;
        if (prefs.language) localStorage.setItem('app_language', prefs.language);
        if (prefs.worldClockTimeZones) localStorage.setItem('worldClockTimeZones', JSON.stringify(prefs.worldClockTimeZones));
        if (prefs.healthReminderConfig) localStorage.setItem('health_reminder_config', JSON.stringify(prefs.healthReminderConfig));
        if (prefs.visualizationEnabled !== undefined) localStorage.setItem('visualizationEnabled', prefs.visualizationEnabled);
        if (prefs.clockWidgetVisible !== undefined) localStorage.setItem('clockWidgetVisible', prefs.clockWidgetVisible);
        if (prefs.userNickname) localStorage.setItem('userNickname', prefs.userNickname);

        localStorage.setItem('preferences_modified', 'true');
      }

      // 3. CD 播放器设置
      if (cloudData.cdPlayer) {
        const cd = cloudData.cdPlayer;
        if (cd.volume !== undefined) localStorage.setItem('cd_player_volume', cd.volume);
        if (cd.favorites) localStorage.setItem('cd_player_favorites', JSON.stringify(cd.favorites));
        if (cd.playlists) localStorage.setItem('cd_player_playlists', JSON.stringify(cd.playlists));
        if (cd.lastTrackId) localStorage.setItem('cd_player_last_track_id', cd.lastTrackId);
        if (cd.lastVocalId) localStorage.setItem('cd_player_last_vocal_id', cd.lastVocalId);
        if (cd.vocalPreference) localStorage.setItem('cd_player_vocal_preference', cd.vocalPreference);
        if (cd.repeat !== undefined) localStorage.setItem('cd_player_repeat', cd.repeat);
        if (cd.shuffle !== undefined) localStorage.setItem('cd_player_shuffle', cd.shuffle);
        if (cd.preferredCharacters) localStorage.setItem('cd_player_preferred_characters', JSON.stringify(cd.preferredCharacters));

        localStorage.setItem('cdPlayer_used', 'true');
      }
    }

    /**
     * 首次登录时的数据迁移
     */
    async migrateLocalData() {
      const migrated = localStorage.getItem('data_migrated');

      if (migrated) {
        return { migrated: false };
      }

      // 收集本地数据
      const localData = this.collectLocalData();

      // 检查是否有数据需要迁移
      if (!localData.userStats || Object.keys(localData.userStats).length === 0) {
        return { migrated: false, noData: true };
      }

      const stats = localData.userStats;

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
        const response = await this.uploadData(localData);

        if (response.success) {
          // 应用合并后的数据
          this.applyCloudData(response.data);

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
        // 1. 收集本地数据
        const localData = this.collectLocalData();

        if (!localData.userStats) {
          console.log('No local data to sync');
          return;
        }

        // 2. 上传并获取合并后的数据
        const result = await this.uploadData(localData);

        if (result.success) {
          // 3. 应用合并后的数据到本地
          this.applyCloudData(result.data);

          localStorage.setItem('sync_version', result.version.toString());
          localStorage.setItem('last_sync_time', Date.now().toString());

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
  document.addEventListener('DOMContentLoaded', async () => {
    if (Auth.isAuthenticated()) {
      // 检查是否需要迁移
      try {
        const result = await DataSync.migrateLocalData();
        if (result.migrated || result.cancelled === false) {
          // 启动自动同步
          DataSync.startAutoSync();
        }
      } catch (error) {
        console.error('Migration check failed:', error);
        // 即使迁移失败，也启动自动同步
        DataSync.startAutoSync();
      }
    }
  });
})();
