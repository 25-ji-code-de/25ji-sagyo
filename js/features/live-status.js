// js/features/live-status.js
// 实时状态模块 - 管理在线人数和广播消息
(function() {
  'use strict';

  /**
   * 配置
   */
  const CONFIG = {
    hostname: 'edge-chat-demo.cloudflareworkers.com',
    roomname: 'nightcord-sagyo-live',
    reconnectDelay: 10000,
    // 获取用户名：优先使用设置的昵称，否则生成随机用户名
    getUsername: () => {
      const savedNickname = localStorage.getItem('userNickname');
      if (savedNickname && savedNickname.trim() !== '' && savedNickname !== '「世界」的居民') {
        return savedNickname.trim();
      }
      // 随机匿名用户名
      return `user_${Math.random().toString(36).substring(2, 8)}`;
    }
  };

  /**
   * DOM 元素缓存
   */
  const elements = {
    onlineCount: null,
    broadcastText: null,
    liveDot: null
  };

  /**
   * 状态
   */
  let ws = null;
  let onlineUsers = new Set();
  let currentUsername = null;
  let rejoined = false;
  let shouldReconnect = true;
  let startTime = null;

  /**
   * 初始化 DOM 元素引用
   */
  function initElements() {
    elements.onlineCount = document.querySelector('#liveStatus .stat-value');
    elements.broadcastText = document.querySelector('#liveStatus .broadcast-text');
    elements.liveDot = document.querySelector('#liveStatus .live-dot');
  }

  /**
   * 更新在线人数显示
   * @param {number} count - 在线人数
   */
  function updateOnlineCount(count) {
    if (elements.onlineCount) {
      elements.onlineCount.textContent = count.toLocaleString();
    }
  }

  /**
   * 更新广播消息显示
   * @param {string} message - 广播消息
   */
  function updateBroadcastMessage(message) {
    if (!elements.broadcastText) return;
    
    const el = elements.broadcastText;
    const wrapper = el.parentElement;
    
    // 设置文本内容
    el.textContent = message;
    el.setAttribute('data-full-text', message);
    
    // 等待渲染后检查是否需要滚动
    requestAnimationFrame(() => {
      const textWidth = el.scrollWidth;
      const wrapperWidth = wrapper ? wrapper.clientWidth : 240;
      
      if (textWidth > wrapperWidth) {
        // 文本过长，启用滚动动画
        const scrollDistance = -(textWidth - wrapperWidth + 20); // 多滚动一点确保能看到结尾
        el.style.setProperty('--scroll-distance', `${scrollDistance}px`);
        el.classList.add('scrolling');
      } else {
        // 文本不长，移除滚动
        el.classList.remove('scrolling');
        el.style.removeProperty('--scroll-distance');
      }
    });
  }

  /**
   * 设置连接状态指示器
   * @param {'connected'|'connecting'|'disconnected'} status - 连接状态
   */
  function setConnectionStatus(status) {
    if (!elements.liveDot) return;
    
    // 移除所有状态类
    elements.liveDot.classList.remove('connected', 'connecting', 'disconnected');
    elements.liveDot.classList.add(status);
    
    // 根据状态更新样式
    switch (status) {
      case 'connected':
        elements.liveDot.style.backgroundColor = '#4caf50';
        elements.liveDot.style.boxShadow = '0 0 6px rgba(76, 175, 80, 0.6)';
        break;
      case 'connecting':
        elements.liveDot.style.backgroundColor = '#ff9800';
        elements.liveDot.style.boxShadow = '0 0 6px rgba(255, 152, 0, 0.6)';
        break;
      case 'disconnected':
        elements.liveDot.style.backgroundColor = '#f44336';
        elements.liveDot.style.boxShadow = '0 0 6px rgba(244, 67, 54, 0.6)';
        break;
    }
  }

  /**
   * 处理收到的 WebSocket 消息
   * @param {Object} data - 消息数据
   */
  function handleMessage(data) {
    // 处理不同类型的消息
    if (data.joined) {
      // 用户加入
      onlineUsers.add(data.joined);
      updateOnlineCount(onlineUsers.size);
      updateBroadcastMessage(`${data.joined} 加入了 Nightcord 作业空间`);
    } else if (data.quit) {
      // 用户离开
      onlineUsers.delete(data.quit);
      updateOnlineCount(onlineUsers.size);
    } else if (data.ready) {
      // 历史消息加载完成
      updateBroadcastMessage('已连接到 Nightcord 作业空间');
    } else if (data.message) {
      // 广播消息
      updateBroadcastMessage(data.message);
    } else if (data.broadcast) {
      // 服务端广播
      updateBroadcastMessage(data.broadcast);
    } else if (data.error) {
      console.warn('[LiveStatus] Server error:', data.error);
    }
  }

  /**
   * 重新连接到服务器
   */
  async function rejoin() {
    if (rejoined) return;
    
    rejoined = true;
    ws = null;

    // Don't try to reconnect too rapidly
    const timeSinceLastJoin = Date.now() - startTime;
    if (timeSinceLastJoin < CONFIG.reconnectDelay) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.reconnectDelay - timeSinceLastJoin));
    }

    // Reconnect
    connect();
  }

  /**
   * 连接到 WebSocket 服务器
   */
  function connect() {
    // 每次连接时重新获取用户名（可能已更新）
    currentUsername = CONFIG.getUsername();
    
    rejoined = false;
    shouldReconnect = true;
    startTime = Date.now();
    
    setConnectionStatus('connecting');
    updateBroadcastMessage('正在连接 Nightcord...');

    try {
      const url = `wss://${CONFIG.hostname}/api/room/${CONFIG.roomname}/websocket`;
      ws = new WebSocket(url);

      ws.addEventListener('open', () => {
        console.log('[LiveStatus] Connected to server');
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ name: currentUsername }));
        }
        setConnectionStatus('connected');
      });

      ws.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data);
          handleMessage(data);
        } catch (e) {
          console.warn('[LiveStatus] Failed to parse message:', e);
        }
      });

      ws.addEventListener('close', (event) => {
        console.log('[LiveStatus] Disconnected:', event.code, event.reason);
        setConnectionStatus('disconnected');
        updateBroadcastMessage('连接已断开，正在重连...');
        onlineUsers.clear();
        if (shouldReconnect) rejoin();
      });

      ws.addEventListener('error', (event) => {
        console.error('[LiveStatus] WebSocket error:', event);
        setConnectionStatus('disconnected');
        if (shouldReconnect) rejoin();
      });

    } catch (e) {
      console.error('[LiveStatus] Failed to create WebSocket:', e);
      setConnectionStatus('disconnected');
      updateBroadcastMessage('连接失败');
    }
  }

  /**
   * 发送消息到服务器
   * @param {Object} message - 要发送的消息对象
   * @returns {boolean} 是否成功发送
   */
  function send(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  /**
   * 发送广播消息
   * @param {string} message - 要广播的消息
   * @returns {boolean} 是否成功发送
   */
  function sendBroadcast(message) {
    return send({ message: message });
  }

  /**
   * 发送用户活动事件（如完成番茄钟）
   * @param {string} eventType - 事件类型
   * @param {Object} [data] - 附加数据
   */
  function sendActivity(eventType, data = {}) {
    return send({
      type: 'activity',
      event: eventType,
      ...data
    });
  }

  /**
   * 断开连接
   */
  function disconnect() {
    shouldReconnect = false;
    if (ws) {
      try { ws.close(); } catch (e) {}
      ws = null;
    }
    setConnectionStatus('disconnected');
    updateBroadcastMessage('已离线');
  }

  /**
   * 重新连接
   */
  function reconnect() {
    shouldReconnect = true;
    if (!ws || ws.readyState === WebSocket.CLOSED) {
      connect();
    }
  }

  /**
   * 检查是否已连接
   * @returns {boolean}
   */
  function isConnected() {
    return ws && ws.readyState === WebSocket.OPEN;
  }

  /**
   * 更新用户名（当用户在设置中修改昵称后调用）
   * 会断开当前连接并以新用户名重新连接
   */
  function updateUsername() {
    const newUsername = CONFIG.getUsername();
    if (newUsername !== currentUsername && isConnected()) {
      console.log('[LiveStatus] Username changed, reconnecting...');
      // 断开并重连以更新服务器上的用户名
      shouldReconnect = true;
      if (ws) {
        try { ws.close(); } catch (e) {}
      }
      // reconnect will be triggered by the close event
    }
  }

  /**
   * 初始化模块
   */
  function init() {
    initElements();
    
    // 延迟初始化 WebSocket，确保页面加载完成
    if (document.readyState === 'complete') {
      connect();
    } else {
      window.addEventListener('load', connect);
    }

    // 页面关闭时断开连接
    window.addEventListener('beforeunload', () => {
      shouldReconnect = false;
      if (ws) {
        try { ws.close(); } catch (e) {}
      }
    });

    // 页面可见性变化时处理连接
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        // 页面可见时重新连接（如果已断开）
        if (!ws || ws.readyState === WebSocket.CLOSED) {
          reconnect();
        }
      }
    });
  }

  // DOM Ready 后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 导出公共 API
  window.LiveStatus = {
    sendBroadcast,
    sendActivity,
    disconnect,
    reconnect,
    updateUsername,
    isConnected,
    getOnlineCount: () => onlineUsers.size,
    getCurrentUsername: () => currentUsername
  };

})();
