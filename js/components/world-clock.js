// js/components/world-clock.js
// 世界时钟组件

(function() {
  'use strict';

  const toggleClockWidgetBtn = document.getElementById('toggleClockWidget');
  const worldClockSection = document.getElementById('worldClockSection');

  // World Clock elements - Time.is style
  const localHoursEl = document.getElementById('localHours');
  const localMinutesEl = document.getElementById('localMinutes');
  const localSecondsEl = document.getElementById('localSeconds');
  const localMillisecondsEl = document.getElementById('localMilliseconds');
  const localDateEl = document.getElementById('localDate');

  // Configurable World Clocks
  const clockSelects = [
    document.getElementById('clock1Select'),
    document.getElementById('clock2Select'),
    document.getElementById('clock3Select')
  ];

  const clockTimeEls = [
    document.getElementById('clock1Time'),
    document.getElementById('clock2Time'),
    document.getElementById('clock3Time')
  ];

  // 可用时区列表
  const AVAILABLE_TIMEZONES = [
    { label: '东京 🗼', zone: 'Asia/Tokyo' },
    { label: '纽约 🗽', zone: 'America/New_York' },
    { label: '伦敦 🏰', zone: 'Europe/London' },
    { label: '巴黎 🗼', zone: 'Europe/Paris' },
    { label: '洛杉矶 🌴', zone: 'America/Los_Angeles' },
    { label: '悉尼 🐨', zone: 'Australia/Sydney' },
    { label: '上海 🐼', zone: 'Asia/Shanghai' },
    { label: '迪拜 🏙️', zone: 'Asia/Dubai' },
    { label: '莫斯科 🏰', zone: 'Europe/Moscow' },
    { label: '新加坡 🦁', zone: 'Asia/Singapore' },
    { label: '首尔 🏯', zone: 'Asia/Seoul' },
    { label: '温哥华 🍁', zone: 'America/Vancouver' },
    { label: '圣保罗 🇧🇷', zone: 'America/Sao_Paulo' },
    { label: 'UTC 🌍', zone: 'UTC' }
  ];

  // 默认选择
  let selectedTimeZones = ['Asia/Tokyo', 'America/New_York', 'Europe/London'];
  let clockWidgetVisible = false;
  let updateInterval = null;

  /**
   * 加载保存的时区设置
   */
  function loadSettings() {
    try {
      const saved = localStorage.getItem('worldClockTimeZones');
      if (saved) {
        selectedTimeZones = JSON.parse(saved);
      }

      const visibleSaved = localStorage.getItem('clockWidgetVisible');
      if (visibleSaved !== null) {
        clockWidgetVisible = visibleSaved === 'true';
      } else {
        // 默认：显示时钟组件
        clockWidgetVisible = true;
      }
    } catch (e) {
      console.warn('Failed to load world clock settings:', e);
    }
  }

  /**
   * 保存时区设置
   */
  function saveSettings() {
    try {
      localStorage.setItem('worldClockTimeZones', JSON.stringify(selectedTimeZones));
      localStorage.setItem('clockWidgetVisible', clockWidgetVisible);
    } catch (e) {
      console.warn('Failed to save world clock settings:', e);
    }
  }

  /**
   * 初始化时区选择器
   */
  function initSelects() {
    clockSelects.forEach((select, index) => {
      if (!select) return;

      // 填充选项
      AVAILABLE_TIMEZONES.forEach(tz => {
        const option = document.createElement('option');
        option.value = tz.zone;
        option.textContent = tz.label;
        select.appendChild(option);
      });

      // 设置选中值
      if (selectedTimeZones[index]) {
        select.value = selectedTimeZones[index];
      }

      // 添加变化监听器
      select.addEventListener('change', (e) => {
        selectedTimeZones[index] = e.target.value;
        saveSettings();
        updateWorldClocks();
      });
    });
  }

  /**
   * 切换时钟组件可见性
   */
  function toggleClockWidget() {
    clockWidgetVisible = !clockWidgetVisible;
    
    if (worldClockSection) {
      worldClockSection.classList.toggle('collapsed', !clockWidgetVisible);
    }
    if (toggleClockWidgetBtn) {
      toggleClockWidgetBtn.classList.toggle('active', clockWidgetVisible);
    }
    
    saveSettings();

    // 根据可见性启动/停止更新
    if (clockWidgetVisible) {
      startUpdates();
    } else {
      stopUpdates();
    }
  }

  /**
   * 更新世界时钟显示
   */
  function updateWorldClocks() {
    const now = new Date();
    const ms = now.getMilliseconds();

    // 本地时间（带毫秒）
    if (localHoursEl && localMinutesEl && localSecondsEl && localMillisecondsEl) {
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const milliseconds = '.' + String(ms).padStart(3, '0');

      localHoursEl.textContent = hours;
      localMinutesEl.textContent = minutes;
      localSecondsEl.textContent = seconds;
      localMillisecondsEl.textContent = milliseconds;
    }

    // 本地日期
    if (localDateEl) {
      const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
      const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${weekdays[now.getDay()]}`;
      localDateEl.textContent = dateStr;
    }

    // 更新可配置时钟
    clockTimeEls.forEach((el, index) => {
      if (!el) return;
      const zone = selectedTimeZones[index];
      if (!zone) return;

      try {
        const time = new Date(now.toLocaleString('en-US', { timeZone: zone }));
        const h = String(time.getHours()).padStart(2, '0');
        const m = String(time.getMinutes()).padStart(2, '0');
        const s = String(time.getSeconds()).padStart(2, '0');
        el.textContent = `${h}:${m}:${s}`;
      } catch (e) {
        el.textContent = '--:--:--';
      }
    });
  }

  /**
   * 启动时钟更新
   */
  function startUpdates() {
    if (updateInterval) return;
    updateWorldClocks();
    // 每 50ms 更新一次以实现平滑的毫秒显示
    updateInterval = setInterval(updateWorldClocks, 50);
  }

  /**
   * 停止时钟更新
   */
  function stopUpdates() {
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
  }

  /**
   * 应用保存的可见性状态
   */
  function applyVisibility() {
    if (worldClockSection) {
      worldClockSection.classList.toggle('collapsed', !clockWidgetVisible);
    }
    if (toggleClockWidgetBtn) {
      toggleClockWidgetBtn.classList.toggle('active', clockWidgetVisible);
    }

    if (clockWidgetVisible) {
      startUpdates();
    }
  }

  // 初始化
  loadSettings();
  initSelects();
  applyVisibility();

  // 绑定切换按钮事件
  if (toggleClockWidgetBtn) {
    toggleClockWidgetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleClockWidget();
    });
  }

  // 导出到全局命名空间
  window.WorldClock = {
    toggle: toggleClockWidget,
    update: updateWorldClocks,
    getTimezones: () => [...selectedTimeZones],
    setTimezone: (index, zone) => {
      if (index >= 0 && index < selectedTimeZones.length) {
        selectedTimeZones[index] = zone;
        if (clockSelects[index]) {
          clockSelects[index].value = zone;
        }
        saveSettings();
        updateWorldClocks();
      }
    }
  };
})();
