// js/features/achievements.js
// 成就系统

(function() {
  'use strict';

  // 成就定义
  const achievements = [
    // Pomodoro / Ranks
    { id: 'first_pomodoro', title: '初めての一歩', desc: '完成第一个番茄钟', icon: '🍅', type: 'pomodoro_count', target: 1, points: 10 },
    { id: 'pomodoro_10', title: '番茄收集者', desc: '累计完成10个番茄钟', icon: '🍅', type: 'pomodoro_count', target: 10, points: 20 },
    { id: 'rank_platinum', title: 'Platinum（白金）', desc: '累计完成50个番茄钟', icon: '🏆', type: 'pomodoro_count', target: 50, points: 100 },
    { id: 'rank_diamond', title: 'Diamond（钻石）', desc: '累计完成100个番茄钟', icon: '💎', type: 'pomodoro_count', target: 100, points: 200 },
    { id: 'rank_ruby', title: 'Ruby（红宝石）', desc: '累计完成200个番茄钟', icon: '🔴', type: 'pomodoro_count', target: 200, points: 400 },
    { id: 'rank_pearl', title: 'Pearl（珍珠）', desc: '累计完成300个番茄钟', icon: '⚪', type: 'pomodoro_count', target: 300, points: 600 },
    { id: 'rank_sapphire', title: 'Sapphire（蓝宝石）', desc: '累计完成400个番茄钟', icon: '🔵', type: 'pomodoro_count', target: 400, points: 800 },
    { id: 'rank_garnet', title: 'Garnet（石榴石）', desc: '累计完成500个番茄钟', icon: '🟤', type: 'pomodoro_count', target: 500, points: 1000 },
    { id: 'rank_emerald', title: 'Emerald（祖母绿）', desc: '累计完成1000个番茄钟', icon: '💚', type: 'pomodoro_count', target: 1000, points: 2000 },

    // Streak / Attendance
    { id: 'streak_3', title: '三日坚持', desc: '连续3天学习', icon: '🔥', type: 'streak_days', target: 3, points: 30 },
    { id: 'streak_7', title: '皆勤賞', desc: '连续7天学习', icon: '📅', type: 'streak_days', target: 7, points: 70 },
    { id: 'streak_14', title: '高校1年生', desc: '连续14天学习', icon: '🏫', type: 'streak_days', target: 14, points: 140 },
    { id: 'streak_30', title: '高校2年生', desc: '连续30天学习', icon: '🔥', type: 'streak_days', target: 30, points: 300 },
    { id: 'streak_60', title: '高校3年生', desc: '连续60天学习', icon: '🌸', type: 'streak_days', target: 60, points: 600 },
    { id: 'streak_100', title: '一直都在身边', desc: '连续100天学习', icon: '💑', type: 'streak_days', target: 100, points: 1000 },
    { id: 'streak_365', title: '永远都在身边', desc: '连续365天学习', icon: '💍', type: 'streak_days', target: 365, points: 3650 },

    // Time / Experience
    { id: 'time_10h', title: '一人前', desc: '累计学习10小时', icon: '🐣', type: 'total_time', target: 36000, points: 100 },
    { id: 'time_50h', title: 'Veteran（资深老手）', desc: '累计学习50小时', icon: '🦅', type: 'total_time', target: 180000, points: 500 },
    { id: 'time_100h', title: '老相识', desc: '累计学习100小时', icon: '👴', type: 'total_time', target: 360000, points: 1000 },
    { id: 'time_200h', title: '元老级', desc: '累计学习200小时', icon: '🦕', type: 'total_time', target: 720000, points: 2000 },
    { id: 'time_500h', title: '远古居民', desc: '累计学习500小时', icon: '🦖', type: 'total_time', target: 1800000, points: 5000 },
    { id: 'time_1000h', title: '前世之缘', desc: '累计学习1000小时', icon: '👻', type: 'total_time', target: 3600000, points: 10000 },

    // Songs / Live Master
    { id: 'live_master_beginner', title: 'Live Master 初級', desc: '播放10首歌曲', icon: '🎵', type: 'songs_played', target: 10, points: 10 },
    { id: 'song_39', title: '39！', desc: '播放39首歌曲', icon: '🎵', type: 'songs_played', target: 39, points: 39 },
    { id: 'live_master_intermediate', title: 'Live Master 中級', desc: '播放50首歌曲', icon: '🎧', type: 'songs_played', target: 50, points: 50 },
    { id: 'live_master_advanced', title: 'Live Master 上級', desc: '播放100首歌曲', icon: '🎹', type: 'songs_played', target: 100, points: 100 },
    { id: 'live_master_expert', title: 'Live Master 達人', desc: '播放500首歌曲', icon: '🎸', type: 'songs_played', target: 500, points: 500 },
    { id: 'live_master_master', title: 'Live Master 皆伝', desc: '播放1000首歌曲', icon: '🎺', type: 'songs_played', target: 1000, points: 1000 },
    { id: 'live_master_true_master', title: 'Live Master 真・皆伝', desc: '播放2000首歌曲', icon: '🎻', type: 'songs_played', target: 2000, points: 2000 },
    { id: 'song_3939', title: '3939！', desc: '播放3939首歌曲', icon: '🎵', type: 'songs_played', target: 3939, points: 3939 },

    // Special / Misc
    { id: 'night_owl', title: '25時の住人', desc: '在凌晨1点学习', icon: '🌙', type: 'night_owl', target: 1, points: 25 },
    { id: 'early_bird', title: '朝活 Master', desc: '在早上6点前学习', icon: '🌅', type: 'early_bird', target: 1, points: 25 },
    { id: 'time_1h', title: '一時間集中', desc: '单次学习超过1小时', icon: '⏰', type: 'session_duration', target: 3600, points: 30 },
    { id: 'session_long', title: 'Never Give Up（永不言弃）', desc: '单次学习超过2小时', icon: '⏳', type: 'session_duration', target: 7200, points: 50 },
    { id: 'session_very_long', title: '腱鞘炎', desc: '单次学习超过4小时', icon: '🩹', type: 'session_duration', target: 14400, points: 100 }
  ];

  // 用户统计状态
  let userStats = {
    pomodoro_count: 0,
    streak_days: 0,
    last_login_date: null,
    songs_played: 0,
    total_time: 0,
    today_time: 0,
    today_date: null,
    unlocked_achievements: [],
    recent_activities: [] // {type, timestamp, detail}
  };

  /**
   * 添加活动记录
   */
  function addActivity(type, detail) {
    const activity = {
      type,
      timestamp: Date.now(),
      detail
    };
    userStats.recent_activities.unshift(activity);
    // 只保留最近 20 条活动
    if (userStats.recent_activities.length > 20) {
      userStats.recent_activities = userStats.recent_activities.slice(0, 20);
    }
    saveStats();
  }

  /**
   * 从 localStorage 加载统计数据
   */
  function loadStats() {
    try {
      const saved = localStorage.getItem('userStats');
      if (saved) {
        userStats = { ...userStats, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to load stats:', e);
    }
    checkDailyLogin();
  }

  /**
   * 保存统计数据到 localStorage
   */
  function saveStats() {
    try {
      localStorage.setItem('userStats', JSON.stringify(userStats));
    } catch (e) {
      console.warn('Failed to save stats:', e);
    }
    updateAchievementsUI();
  }

  /**
   * 检查每日登录以更新连续天数
   */
  function checkDailyLogin() {
    const today = new Date().toDateString();
    if (userStats.last_login_date !== today) {
      const lastLogin = userStats.last_login_date ? new Date(userStats.last_login_date) : null;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (lastLogin && lastLogin.toDateString() === yesterday.toDateString()) {
        userStats.streak_days++;
      } else {
        userStats.streak_days = 1;
      }
      userStats.last_login_date = today;
      
      // 记录登录活动
      addActivity('login', `新的一天开始了，连续第 ${userStats.streak_days} 天`);
      
      checkAchievements('streak_days');
    }
    
    // 检查时间相关成就
    const hour = new Date().getHours();
    if (hour === 1) checkAchievements('night_owl');
    if (hour >= 4 && hour < 6) checkAchievements('early_bird');
  }

  /**
   * 检查并解锁成就
   */
  function checkAchievements(type, value = null) {
    let changed = false;
    const currentValue = value !== null ? value : userStats[type];
    
    achievements.forEach(ach => {
      if (ach.type === type && !userStats.unlocked_achievements.includes(ach.id)) {
        if (currentValue >= ach.target) {
          unlockAchievement(ach);
          changed = true;
        }
      }
    });
    
    if (changed) saveStats();
  }

  /**
   * 解锁成就
   */
  function unlockAchievement(achievement) {
    userStats.unlocked_achievements.push(achievement.id);
    addActivity('achievement', `解锁成就「${achievement.title}」`);
    showNotification(`成就解锁: ${achievement.title}`, achievement.icon);
    
    // 广播成就解锁
    if (window.LiveStatus && window.BroadcastMessages) {
      const username = window.LiveStatus.getCurrentUsername() || '某位用户';
      const message = window.BroadcastMessages.generate('achievement_unlock', username, achievement.title);
      window.LiveStatus.sendBroadcast(message);
    }
  }

  /**
   * 显示应用内通知
   */
  function showNotification(text, icon) {
    const toast = document.createElement('div');
    toast.className = 'achievement-toast';
    toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-text">${text}</span>`;
    document.body.appendChild(toast);
    
    // 动态添加样式（如果不存在）
    if (!document.getElementById('toast-style')) {
      const style = document.createElement('style');
      style.id = 'toast-style';
      style.textContent = `
        .achievement-toast {
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%) translateY(-100px);
          background: rgba(30, 30, 45, 0.9);
          color: #fff;
          padding: 12px 24px;
          border-radius: 50px;
          display: flex;
          align-items: center;
          gap: 10px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          z-index: 2000;
          transition: transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          border: 1px solid rgba(255,255,255,0.1);
          backdrop-filter: blur(10px);
        }
        .achievement-toast.show {
          transform: translateX(-50%) translateY(0);
        }
        .toast-icon { font-size: 20px; }
        .toast-text { font-size: 14px; font-weight: 600; }
      `;
      document.head.appendChild(style);
    }
    
    // 触发动画
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 500);
    }, 3000);
  }

  /**
   * 更新设置面板中的成就 UI
   */
  function updateAchievementsUI() {
    const list = document.querySelector('.achievements-list');
    if (!list) return;
    
    // 计算总积分
    const totalScore = userStats.unlocked_achievements.reduce((sum, id) => {
      const ach = achievements.find(a => a.id === id);
      return sum + (ach ? ach.points : 0);
    }, 0);

    // 添加积分显示（如果不存在）
    let scoreDisplay = document.getElementById('achievementScore');
    if (!scoreDisplay) {
      scoreDisplay = document.createElement('div');
      scoreDisplay.id = 'achievementScore';
      scoreDisplay.className = 'achievement-score';
      list.parentNode.insertBefore(scoreDisplay, list);
    }
    scoreDisplay.innerHTML = `<span>当前积分:</span> <span class="score-value">${totalScore}</span>`;

    list.innerHTML = '';
    achievements.forEach(ach => {
      const isUnlocked = userStats.unlocked_achievements.includes(ach.id);
      const item = document.createElement('div');
      item.className = `achievement-item ${isUnlocked ? '' : 'locked'}`;
      item.innerHTML = `
        <div class="achievement-icon">${ach.icon}</div>
        <div class="achievement-info">
          <div class="achievement-title">${ach.title} <span class="achievement-points">+${ach.points}</span></div>
          <div class="achievement-desc">${ach.desc}</div>
        </div>
        ${isUnlocked ? '<div class="achievement-check">✓</div>' : ''}
      `;
      list.appendChild(item);
    });

    // 更新统计 UI
    const statValues = document.querySelectorAll('#tab-stats .stat-value');
    if (statValues.length >= 3) {
      // 检查 today_date 是否是当天，如果不是则重置 today_time
      const today = new Date().toDateString();
      if (userStats.today_date !== today) {
        userStats.today_time = 0;
        userStats.today_date = today;
      }
      statValues[0].textContent = Math.floor(userStats.today_time / 60); // 今日分钟数
      statValues[1].textContent = (userStats.total_time / 3600).toFixed(1); // 总小时数
      statValues[2].textContent = userStats.pomodoro_count;
    }

    // 更新活动列表
    const activityList = document.querySelector('.activity-list');
    if (activityList) {
      activityList.innerHTML = '';
      const activities = userStats.recent_activities || [];
      if (activities.length === 0) {
        activityList.innerHTML = '<div class="activity-item">暂无记录</div>';
      } else {
        activities.slice(0, 10).forEach(activity => {
          const item = document.createElement('div');
          item.className = 'activity-item';
          const time = new Date(activity.timestamp);
          const timeStr = `${time.getMonth() + 1}/${time.getDate()} ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
          
          let actIcon = '📝';
          switch (activity.type) {
            case 'pomodoro': actIcon = '🍅'; break;
            case 'song': actIcon = '🎵'; break;
            case 'achievement': actIcon = '🏆'; break;
            case 'login': actIcon = '👋'; break;
          }
          
          item.innerHTML = `<span class="activity-icon">${actIcon}</span><span class="activity-text">${activity.detail}</span><span class="activity-time">${timeStr}</span>`;
          activityList.appendChild(item);
        });
      }
    }
  }

  /**
   * 获取用户统计数据
   */
  function getStats() {
    return { ...userStats };
  }

  /**
   * 获取成就列表
   */
  function getAchievements() {
    return achievements;
  }

  // 初始化
  loadStats();
  
  // 每分钟检查时间相关成就
  setInterval(() => {
    const hour = new Date().getHours();
    if (hour === 1) checkAchievements('night_owl');
    if (hour >= 4 && hour < 6) checkAchievements('early_bird');
  }, 60000);

  // 导出到全局命名空间
  window.achievementSystem = {
    incrementPomodoro: () => {
      userStats.pomodoro_count++;
      addActivity('pomodoro', `完成了第 ${userStats.pomodoro_count} 个番茄钟`);
      checkAchievements('pomodoro_count');
    },
    incrementSongs: () => {
      userStats.songs_played++;
      saveStats();
      checkAchievements('songs_played');
    },
    addFocusTime: (seconds) => {
      // 更新今日时间
      const today = new Date().toDateString();
      if (userStats.today_date !== today) {
        userStats.today_time = 0;
        userStats.today_date = today;
      }
      userStats.today_time += seconds;
      userStats.total_time += seconds;
      saveStats();
      checkAchievements('total_time');
      if (seconds >= 3600) checkAchievements('session_duration', seconds);
    },
    updateUI: updateAchievementsUI,
    getStats,
    getAchievements
  };
})();
