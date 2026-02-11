// js/components/settings-panel.js
// 设置面板

(function() {
  'use strict';

  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  const settingsCloseBtn = document.getElementById('settingsCloseBtn');

  if (!settingsBtn || !settingsPanel) return;

  // --- Home Tab Elements ---
  const greetingText = document.getElementById('greetingText');
  const userNickname = document.getElementById('userNickname');
  const editNicknameBtn = document.getElementById('editNicknameBtn');
  const streakSummary = document.getElementById('streakSummary');
  const timeSummary = document.getElementById('timeSummary');
  const randomTipText = document.getElementById('randomTipText');

  // 静态提示列表
  const STATIC_TIPS = [
    // General Tips
    "休息也是工作的一部分哦。",
    "感到疲惫的时候，听听音乐放松一下吧。",
    "保持水分充足有助于提高专注力。",
    "番茄工作法建议每25分钟休息5分钟。",
    "今天的努力，未来的你会感谢现在的自己。",
    "不要忘记伸展一下身体。",
    "深呼吸，让大脑重新充满氧气。",
    "整理桌面也能整理心情。",
    "设定一个小目标，完成后给自己一点奖励。",
    "即使是微小的进步，也值得庆祝。",
    
    // App Tips
    "使用快捷键 'M' 可以快速静音，'F' 键进入全屏。",
    "在 CD 播放器中点击 '🌀' 按钮，可以开启音频可视化效果。",
    "点击 '🎚️' 按钮，可以开启音频处理效果，享受人声衰减后的背景声。",
    "番茄钟的设置可以调整，找到最适合你的节奏。",
    "点击顶部的 'Toggle TZ' 按钮，假装自己身处东京的时间流中。",
    "点击顶部的广播消息区域，可以打开聊天面板与其他用户交流。",
    
    // Game Context / Quotes
    "奏：「就这样继续吧。」",
    "奏：「嗯，感觉不错。」",
    "奏：「……时间是还有点早，不过还是上 Nightcord 干活吧。」",
    "奏：「去吃饭吧，我的肚子也咕咕叫了。」",
    "瑞希：「今天就稍微积极点吧。」",
    "瑞希：「好，我也要加把劲了。」",
    "瑞希：「嗯，小菜一碟♪」",
    "瑞希：「大家都辛苦啦～♪」",
    "绘名：「状态很不错嘛。」",
    "绘名：「继续保持这个状态哦。」",
    "绘名：「嗯，感觉不错哦。」",
    "绘名：「呼，好累啊。今天就到这里吧。」",
    "绘名：「嗯，感觉不错！」",
    "绘名：「这点事还是很轻松的♪」",
    "绘名：「半途而废也不好，再加把劲吧。」",
    "真冬：「……新的一天开始了。」",
    "真冬：「……听着 25 的歌曲，内心就会平静下来。」",
    "真冬：「……真希望赶快到 25 点。」",
    "真冬：「这么顺利真是太好了。」",
    "真冬：「辛苦了。」",
    "真冬：「干活的时候心里就会平静下来……」",
    "未来：「非常棒。」",
    "未来：「我也会加油的。」",
    "未来：「啊……你来了啊。谢谢……」",
    "未来：「今天做些什么好呢？咦……？你愿意和我待在一起吗？」",
    "未来：「……啊，欢迎。」",
    "未来：「努力过了。」",
    "未来：「……没事的。我在你身边……」",
  ];

  /**
   * 获取每日提示
   */
  function getDailyTip() {
    const rand = Math.random();
    
    // 30% 概率推荐歌曲（如果可用）
    if (rand < 0.3 && window.cdPlayerSystem && window.cdPlayerSystem.getRandomSong) {
      const song = window.cdPlayerSystem.getRandomSong();
      if (song) {
        return `今日推荐曲目：《${song.title}》\n适合现在的氛围呢。`;
      }
    }

    // 20% 概率推荐团体
    if (rand >= 0.3 && rand < 0.5) {
      const units = ["Leo/need", "MORE MORE JUMP!", "Vivid BAD SQUAD", "Wonderlands×Showtime", "25时，在Nightcord。", "VIRTUAL SINGER"];
      const templates = [
        "想转换心情吗？试试去 CD 播放器里找找 {unit} 的歌吧。",
        "如果是 {unit} 的曲风，说不定能给你带来新的灵感。",
        "偶尔听听 {unit} 的歌，感觉也不错呢。",
        "现在的气氛，或许很适合 {unit} 的音乐？"
      ];
      const unit = units[Math.floor(Math.random() * units.length)];
      const template = templates[Math.floor(Math.random() * templates.length)];
      return template.replace('{unit}', unit);
    }

    // 静态提示
    return STATIC_TIPS[Math.floor(Math.random() * STATIC_TIPS.length)];
  }

  /**
   * 更新主页标签
   */
  async function updateHomeTab() {
    // 更新问候语
    const hour = new Date().getHours();
    let greetingKey = 'settings.home.greeting.default';
    if (hour >= 5 && hour < 12) greetingKey = 'settings.home.greeting.morning';
    else if (hour >= 12 && hour < 18) greetingKey = 'settings.home.greeting.afternoon';
    else if (hour >= 18 && hour < 23) greetingKey = 'settings.home.greeting.evening';
    else greetingKey = 'settings.home.greeting.night';

    if (greetingText && window.I18n) {
      greetingText.textContent = window.I18n.t(greetingKey);
    }

    // 更新昵称 - 登录后使用用户名
    let displayNickname;
    let isLoggedIn = false;

    if (window.SekaiAuth && window.SekaiAuth.isAuthenticated()) {
      const userInfo = await window.SekaiAuth.getUserInfo();
      if (userInfo) {
        displayNickname = userInfo.preferred_username || userInfo.name || userInfo.email;
        isLoggedIn = true;
        // 登录后，将用户名保存到 localStorage（用于其他功能）
        const oldNickname = localStorage.getItem('userNickname');
        if (oldNickname !== displayNickname) {
          localStorage.setItem('userNickname', displayNickname);
          // 通知 LiveStatus 更新用户名（重新连接）
          if (window.LiveStatus && window.LiveStatus.updateUsername) {
            window.LiveStatus.updateUsername();
          }
        }
      }
    }

    if (!isLoggedIn) {
      const defaultNickname = window.I18n?.t('settings.home.default_nickname') || '「世界」的居民';
      displayNickname = localStorage.getItem('userNickname') || defaultNickname;
    }

    if (userNickname) userNickname.textContent = displayNickname;

    // 更新编辑按钮状态
    if (editNicknameBtn) {
      if (isLoggedIn) {
        editNicknameBtn.disabled = true;
        editNicknameBtn.style.opacity = '0.5';
        editNicknameBtn.style.cursor = 'not-allowed';
        editNicknameBtn.title = '登录后昵称锁定为用户名';
      } else {
        editNicknameBtn.disabled = false;
        editNicknameBtn.style.opacity = '1';
        editNicknameBtn.style.cursor = 'pointer';
        editNicknameBtn.title = '编辑昵称';
      }
    }

    // 更新统计摘要
    const savedStats = localStorage.getItem('userStats');
    if (savedStats) {
      try {
        const stats = JSON.parse(savedStats);
        if (streakSummary && window.I18n) {
          streakSummary.textContent = window.I18n.t('settings.home.streak_summary', { days: stats.streak_days || 1 });
        }
        if (timeSummary && window.I18n) {
          const hours = ((stats.total_time || 0) / 3600).toFixed(1);
          timeSummary.textContent = window.I18n.t('settings.home.time_summary', { hours });
        }
      } catch (e) {}
    }

    // 随机提示
    if (randomTipText) {
      randomTipText.textContent = getDailyTip();
    }
  }

  /**
   * 切换面板显示
   */
  function togglePanel() {
    settingsPanel.classList.toggle('hidden');
    if (!settingsPanel.classList.contains('hidden')) {
      if (window.achievementSystem) {
        window.achievementSystem.updateUI();
      }
      updateHomeTab();
    }
  }

  // 编辑昵称
  if (editNicknameBtn) {
    editNicknameBtn.addEventListener('click', async () => {
      // 检查是否已登录
      if (window.SekaiAuth && window.SekaiAuth.isAuthenticated()) {
        alert('登录后昵称已锁定为用户名，无法修改。');
        return;
      }

      const currentName = localStorage.getItem('userNickname') || '「世界」的居民';
      const newName = prompt('请输入你的昵称:', currentName);
      if (newName && newName.trim() !== '') {
        localStorage.setItem('userNickname', newName.trim());
        await updateHomeTab();
        // 通知 LiveStatus 更新用户名
        if (window.LiveStatus && window.LiveStatus.updateUsername) {
          window.LiveStatus.updateUsername();
        }
      }
    });
  }

  // 标签切换逻辑
  const sidebarBtns = settingsPanel.querySelectorAll('.sidebar-btn');
  const tabContents = settingsPanel.querySelectorAll('.tab-content');

  sidebarBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      
      // 更新侧边栏按钮
      sidebarBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // 更新标签内容
      tabContents.forEach(content => {
        if (content.id === `tab-${tabId}`) {
          content.classList.add('active');
        } else {
          content.classList.remove('active');
        }
      });
    });
  });

  // 事件监听器
  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePanel();
  });

  if (settingsCloseBtn) {
    settingsCloseBtn.addEventListener('click', togglePanel);
  }

  // 防止面板内点击传播
  settingsPanel.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // --- 版本信息 ---
  // 占位符在构建时由 build.sh 替换
  const APP_VERSION = {
    commit: '__BUILD_VERSION__',
    date: '__BUILD_DATE__',
    fullSha: '__BUILD_FULL_SHA__'
  };

  // GitHub 仓库信息
  const GITHUB_REPO = {
    owner: 'bili-47177171806',
    repo: '25ji-sagyo'
  };

  let latestCommitInfo = null;

  /**
   * 从 GitHub API 获取最新提交信息
   */
  async function fetchLatestCommit() {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO.owner}/${GITHUB_REPO.repo}/commits/main`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }
    
    const data = await response.json();
    return {
      sha: data.sha,
      shortSha: data.sha.substring(0, 7),
      date: new Date(data.commit.committer.date).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).replace(/\//g, '-'),
      message: data.commit.message.split('\n')[0]
    };
  }

  /**
   * 更新版本显示
   */
  function updateVersionDisplay(versionEl, latestCommit) {
    const isUpToDate = APP_VERSION.fullSha === latestCommit.sha || 
                       APP_VERSION.commit === latestCommit.shortSha;
    
    if (isUpToDate) {
      versionEl.innerHTML = `
        <span class="version-current">📦 ${APP_VERSION.date} (${APP_VERSION.commit})</span>
        <span class="version-uptodate">✅ 已是最新版本</span>
      `;
    } else {
      versionEl.innerHTML = `
        <span class="version-current">📦 当前: ${APP_VERSION.date} (${APP_VERSION.commit})</span>
        <span class="version-update-available">
          🆕 新版本可用: ${latestCommit.date} (${latestCommit.shortSha})
        </span>
      `;
    }
  }

  /**
   * 显示版本详情模态框
   */
  function showVersionModal() {
    const existingModal = document.getElementById('versionModal');
    if (existingModal) existingModal.remove();

    const isDev = APP_VERSION.commit.startsWith('__');
    const isUpToDate = latestCommitInfo && (APP_VERSION.fullSha === latestCommitInfo.sha || APP_VERSION.commit === latestCommitInfo.shortSha);
    
    const modalHtml = `
      <div class="version-modal-overlay active" id="versionModal">
        <div class="version-modal">
          <div class="version-modal-header">
            <h3 class="version-modal-title">📦 版本信息</h3>
            <button class="version-modal-close" onclick="document.getElementById('versionModal').remove()">×</button>
          </div>
          
          <div class="version-info-grid">
            <div class="version-label">构建日期</div>
            <div class="version-value">${isDev ? 'Development' : APP_VERSION.date}</div>
            
            <div class="version-label">Commit</div>
            <div class="version-value">${isDev ? 'N/A' : APP_VERSION.commit}</div>
            
            <div class="version-label">Full SHA</div>
            <div class="version-value" style="font-size: 11px;">${isDev ? 'N/A' : APP_VERSION.fullSha}</div>
            
            <div class="version-label">状态</div>
            <div class="version-value">
              ${isDev ? '<span style="color: #ffa500">开发模式</span>' : 
                (!latestCommitInfo ? '<span style="color: #aaa">检查中...</span>' : 
                  (isUpToDate ? '<span style="color: #4ade80">已是最新</span>' : '<span style="color: #60a5fa">有新版本可用</span>')
                )
              }
            </div>
          </div>

          ${latestCommitInfo && !isUpToDate ? `
            <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);">
              <div class="version-label" style="margin-bottom: 8px;">最新版本 (${latestCommitInfo.shortSha})</div>
              <div style="font-size: 13px; color: rgba(255,255,255,0.8); background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px;">
                ${latestCommitInfo.message}
              </div>
              <div style="font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 4px;">
                发布于 ${latestCommitInfo.date}
              </div>
            </div>
          ` : ''}

          <div class="version-actions">
            <button class="version-btn version-btn-secondary" onclick="document.getElementById('versionModal').remove()">关闭</button>
            ${latestCommitInfo && !isUpToDate ? `
              <button class="version-btn version-btn-primary" onclick="(function() { const url = new URL(window.location.href); url.searchParams.set('v', '${latestCommitInfo.shortSha}'); window.location.href = url.toString(); })()">
                刷新页面以更新
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    document.getElementById('versionModal').addEventListener('click', (e) => {
      if (e.target.id === 'versionModal') {
        e.target.remove();
      }
    });
  }

  /**
   * 显示版本信息并检查更新
   */
  async function displayVersion() {
    const versionEl = document.getElementById('appVersion');
    if (!versionEl) return;
    
    versionEl.addEventListener('click', showVersionModal);
    
    const isDev = APP_VERSION.commit.startsWith('__');
    
    if (isDev) {
      versionEl.innerHTML = '<span class="version-dev">🛠️ Dev Build</span>';
      versionEl.title = 'Click for details';
    } else {
      versionEl.innerHTML = `<span class="version-current">📦 ${APP_VERSION.date} (${APP_VERSION.commit})</span> <span class="version-checking">🔄 检查更新中...</span>`;
      versionEl.title = 'Click for details';
      
      try {
        const latestCommit = await fetchLatestCommit();
        latestCommitInfo = latestCommit;
        updateVersionDisplay(versionEl, latestCommit);
      } catch (error) {
        console.warn('Failed to check for updates:', error);
        versionEl.innerHTML = `<span class="version-current">📦 ${APP_VERSION.date} (${APP_VERSION.commit})</span>`;
      }
    }
  }

  // --- Language Selector ---
  const languageSelect = document.getElementById('languageSelect');

  /**
   * 初始化语言选择器
   */
  function initLanguageSelector() {
    if (!languageSelect || !window.I18n) return;

    const currentLang = window.I18n.getCurrentLanguage();
    languageSelect.value = currentLang;

    languageSelect.addEventListener('change', async (e) => {
      const newLang = e.target.value;
      await window.I18n.setLanguage(newLang);
      updateHomeTab();
    });
  }

  // --- Health Reminder Elements ---
  const sedentaryEnabled = document.getElementById('sedentaryEnabled');
  const sedentaryInterval = document.getElementById('sedentaryInterval');
  const hydrationEnabled = document.getElementById('hydrationEnabled');
  const hydrationInterval = document.getElementById('hydrationInterval');

  /**
   * 初始化健康提醒设置
   */
  function initHealthSettings() {
    if (!window.healthReminderSystem) return;

    const config = window.healthReminderSystem.getConfig();

    // 久坐提醒
    if (sedentaryEnabled) {
      sedentaryEnabled.checked = config.sedentary.enabled;
      sedentaryEnabled.addEventListener('change', (e) => {
        const currentConfig = window.healthReminderSystem.getConfig();
        window.healthReminderSystem.updateConfig({
          sedentary: { ...currentConfig.sedentary, enabled: e.target.checked }
        });
      });
    }

    if (sedentaryInterval) {
      sedentaryInterval.value = config.sedentary.interval;
      sedentaryInterval.addEventListener('change', (e) => {
        let val = parseInt(e.target.value, 10);
        if (val < 15) val = 15;
        const currentConfig = window.healthReminderSystem.getConfig();
        window.healthReminderSystem.updateConfig({
          sedentary: { ...currentConfig.sedentary, interval: val }
        });
      });
    }

    // 喝水提醒
    if (hydrationEnabled) {
      hydrationEnabled.checked = config.hydration.enabled;
      hydrationEnabled.addEventListener('change', (e) => {
        const currentConfig = window.healthReminderSystem.getConfig();
        window.healthReminderSystem.updateConfig({
          hydration: { ...currentConfig.hydration, enabled: e.target.checked }
        });
      });
    }

    if (hydrationInterval) {
      hydrationInterval.value = config.hydration.interval;
      hydrationInterval.addEventListener('change', (e) => {
        let val = parseInt(e.target.value, 10);
        if (val < 15) val = 15;
        const currentConfig = window.healthReminderSystem.getConfig();
        window.healthReminderSystem.updateConfig({
          hydration: { ...currentConfig.hydration, interval: val }
        });
      });
    }
  }

  // 初始化版本显示
  displayVersion();
  // 初始化语言选择器
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLanguageSelector);
  } else {
    setTimeout(initLanguageSelector, 0);
  }
  // 初始化健康设置 - 延迟执行以确保 healthReminderSystem 已初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHealthSettings);
  } else {
    // DOM 已加载，但 healthReminderSystem 可能仍在初始化中，稍微延迟
    setTimeout(initHealthSettings, 0);
  }

  if (!localStorage.getItem('userNickname')) {
    localStorage.setItem('userNickname', '「世界」的居民_' + [...Array(4)].map(_=>"23456789BCDFGHJKLMNPQRSTVWXY"[Math.random()*28|0]).join(''));
  }

  // 监听语言变化事件
  window.addEventListener('languagechange', () => {
    updateHomeTab();
  });

  // 导出到全局命名空间
  window.SettingsPanel = {
    toggle: togglePanel,
    updateHomeTab,
    getDailyTip
  };
})();
