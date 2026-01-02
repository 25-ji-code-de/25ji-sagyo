/**
 * 广播消息模板
 * 用于根据用户活动生成实时广播消息
 * {username} 会被替换为当前用户名
 * {value} 会被替换为具体数值（如歌曲名、成就名等）
 */
const BROADCAST_TEMPLATES = {
  // --- 番茄钟相关 ---
  pomodoro_start: [
    "{username} 开始了新的番茄钟。",
    "{username} 正在专注中...",
    "来自远方的 {username} 开始作业了。"
  ],
  pomodoro_complete: [
    "{username} 完成了 25 分钟的专注！",
    "{username} 刚刚完成了一个番茄钟。",
    "{username} 又坚持了 25 分钟，真厉害！"
  ],
  pomodoro_break: [
    "{username} 开始休息了。",
    "{username} 正在短暂休息中..."
  ],

  // --- CD 播放器相关 ---
  music_play: [
    "{username} 正在聆听《{value}》。",
    "有人点播了《{value}》。",
    "《{value}》的旋律响起了。"
  ],

  // --- 成就相关 ---
  achievement_unlock: [
    "{username} 解锁了成就「{value}」！",
    "恭喜 {username} 达成「{value}」！",
    "{username} 获得了新成就：{value}"
  ],

  // --- 用户状态 ---
  user_join: [
    "{username} 加入了 Nightcord 作业空间。",
    "欢迎 {username} 的到来。",
    "{username} 上线了。"
  ],
  user_leave: [
    "{username} 离开了。",
    "{username} 下线了。"
  ],

  // --- 系统消息 ---
  system: [
    "系统提示：记得适度休息，保护视力。",
    "Nightcord 此时此刻连接着世界各地的作业者。"
  ]
};

/**
 * 根据事件类型和参数生成广播消息
 * @param {string} eventType - 事件类型 (如 'pomodoro_complete', 'music_play')
 * @param {string} [username] - 用户名
 * @param {string} [value] - 附加值（如歌曲名、成就名）
 * @returns {string} 生成的广播消息
 */
function generateBroadcastMessage(eventType, username, value) {
  username = username || '某位用户';
  value = value || '';
  
  const templates = BROADCAST_TEMPLATES[eventType];
  if (!templates || templates.length === 0) {
    return username + ' 做了些什么...';
  }
  
  // 随机选择一个模板
  const template = templates[Math.floor(Math.random() * templates.length)];
  
  // 替换占位符
  return template
    .replace('{username}', username)
    .replace('{value}', value);
}

// 导出到全局
window.BroadcastMessages = {
  TEMPLATES: BROADCAST_TEMPLATES,
  generate: generateBroadcastMessage
};
