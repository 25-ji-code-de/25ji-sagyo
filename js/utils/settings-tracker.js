// 设置修改监听器 - 自动标记用户修改过的设置
(function() {
  'use strict';

  // 监听偏好设置的修改
  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
    // 调用原始方法
    originalSetItem.call(this, key, value);

    // 如果是偏好设置，标记为已修改
    const preferenceKeys = [
      'app_language',
      'worldClockTimeZones',
      'health_reminder_config',
      'visualizationEnabled',
      'clockWidgetVisible',
      'userNickname'
    ];

    if (preferenceKeys.includes(key)) {
      originalSetItem.call(this, 'preferences_modified', 'true');
      console.log(`Preference modified: ${key}`);
    }

    // 如果是 CD 播放器设置，标记为已使用
    const cdPlayerKeys = [
      'cd_player_volume',
      'cd_player_favorites',
      'cd_player_playlists',
      'cd_player_last_track_id',
      'cd_player_last_vocal_id',
      'cd_player_vocal_preference',
      'cd_player_repeat',
      'cd_player_shuffle',
      'cd_player_preferred_characters'
    ];

    if (cdPlayerKeys.includes(key)) {
      originalSetItem.call(this, 'cdPlayer_used', 'true');
      console.log(`CD Player used: ${key}`);
    }
  };

  console.log('Settings modification tracker initialized');
})();
