// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2025-2026 The 25-ji-code-de Team

// js/utils/asset-loader.js
// R2 CDN 资源加载器

(function() {
  'use strict';

  const R2_BASE = 'https://assets.nightcord.de5.net';
  const knownAssets = new Set();

  /**
   * 获取资源 URL（用于需要 URL 的元素，而非 Response）
   * 返回 R2 URL，并在需要时触发上传
   * @param {string} path - 资源路径（以 / 开头）
   * @returns {Promise<string>} - 资源的完整 URL
   */
  async function getAssetUrl(path) {
    const r2Url = `${R2_BASE}${path}`;

    if (knownAssets.has(path)) {
      return r2Url;
    }

    // 通过 HEAD 请求检查资源是否存在
    try {
      const headResp = await fetch(r2Url, { method: 'HEAD' });

      if (headResp.ok) {
        knownAssets.add(path);
        return r2Url;
      }

      if (headResp.status === 404) {
        // 404 时触发预取
        try {
          const uploadResp = await fetch(`https://api.nightcord.de5.net/assets/prefetch?path=${encodeURIComponent(path)}`);
          const result = await uploadResp.json();

          if (result.status === 'prefetched' || result.status === 'exists') {
            knownAssets.add(path);
            return r2Url;
          }
        } catch (e) {
          console.warn('Prefetch trigger failed:', e);
        }
      }
    } catch (e) {
      console.warn('Asset check failed:', e);
    }
    
    // 无论如何返回 R2 URL，让调用者处理任何错误
    return r2Url;
  }

  /**
   * 获取 R2 基础 URL
   * @returns {string}
   */
  function getBaseUrl() {
    return R2_BASE;
  }

  /**
   * 检查资源是否已缓存到已知列表
   * @param {string} path
   * @returns {boolean}
   */
  function isKnownAsset(path) {
    return knownAssets.has(path);
  }

  /**
   * 将路径标记为已知资源
   * @param {string} path
   */
  function markAsKnown(path) {
    knownAssets.add(path);
  }

  // 导出到全局命名空间
  window.AssetLoader = {
    getAssetUrl,
    getBaseUrl,
    isKnownAsset,
    markAsKnown,
    R2_BASE
  };
})();
