// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2025-2026 The 25-ji-code-de Team

// SEKAI Gateway API 客户端
(function() {
  'use strict';

  const CONFIG = window.SEKAI_CONFIG;
  const Auth = window.SekaiAuth;

  class API {
    /**
     * 上报用户事件
     */
    static async reportEvent(eventType, metadata = {}) {
      // 如果未登录，静默失败（不影响用户体验）
      if (!Auth.isAuthenticated()) {
        console.log('Not authenticated, skipping event report');
        return false;
      }

      try {
        const accessToken = await Auth.getValidAccessToken();
        if (!accessToken) {
          console.log('No valid access token, skipping event report');
          return false;
        }

        const response = await fetch(`${CONFIG.apiBaseUrl}/user/events`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            project: '25ji',
            event_type: eventType,
            metadata: metadata
          })
        });

        if (!response.ok) {
          console.error('Failed to report event:', response.status);
          return false;
        }

        console.log(`Event reported: ${eventType}`, metadata);
        return true;
      } catch (error) {
        console.error('Error reporting event:', error);
        return false;
      }
    }

    /**
     * 批量上报事件（用于数据迁移）
     */
    static async reportBatch(events) {
      if (!Auth.isAuthenticated()) {
        return false;
      }

      try {
        const accessToken = await Auth.getValidAccessToken();
        if (!accessToken) return false;

        // 逐个上报（未来可以优化为批量 API）
        for (const event of events) {
          await this.reportEvent(event.type, event.metadata);
          // 避免请求过快
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        return true;
      } catch (error) {
        console.error('Error reporting batch:', error);
        return false;
      }
    }
  }

  // Export to global
  window.SekaiAPI = API;
})();
