// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2025-2026 The 25-ji-code-de Team

// SEKAI Pass OAuth 认证模块
(function() {
  'use strict';

  const CONFIG = window.SEKAI_CONFIG;

  class Auth {
    constructor() {
      this.accessTokenKey = 'sekai_access_token';
      this.refreshTokenKey = 'sekai_refresh_token';
      this.tokenExpiresAtKey = 'sekai_token_expires_at';
      this.codeVerifierKey = 'sekai_code_verifier';
      this.stateKey = 'sekai_auth_state';
    }

    // Generate random string
    generateRandomString(length) {
      const array = new Uint8Array(length);
      window.crypto.getRandomValues(array);
      return Array.from(array, dec => ('0' + dec.toString(16)).slice(-2)).join('');
    }

    // Base64URL encode
    base64UrlEncode(arrayBuffer) {
      let base64 = btoa(String.fromCharCode.apply(null, new Uint8Array(arrayBuffer)));
      return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    // SHA-256 hash
    async sha256(plain) {
      const encoder = new TextEncoder();
      const data = encoder.encode(plain);
      return await window.crypto.subtle.digest('SHA-256', data);
    }

    // Generate PKCE Challenge
    async generateCodeChallenge(verifier) {
      const hashed = await this.sha256(verifier);
      return this.base64UrlEncode(hashed);
    }

    // Initiate Login
    async login() {
      const state = this.generateRandomString(16);
      const codeVerifier = this.generateRandomString(32);

      localStorage.setItem(this.stateKey, state);
      localStorage.setItem(this.codeVerifierKey, codeVerifier);

      const codeChallenge = await this.generateCodeChallenge(codeVerifier);

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: CONFIG.clientId,
        redirect_uri: CONFIG.redirectUri,
        scope: CONFIG.scope,
        state: state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256'
      });

      window.location.href = `${CONFIG.authEndpoint}?${params.toString()}`;
    }

    // Handle Callback
    async handleCallback(code, state) {
      const storedState = localStorage.getItem(this.stateKey);
      const codeVerifier = localStorage.getItem(this.codeVerifierKey);

      if (state !== storedState) {
        throw new Error('Invalid state parameter');
      }

      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CONFIG.clientId,
        code: code,
        redirect_uri: CONFIG.redirectUri,
        code_verifier: codeVerifier
      });

      const response = await fetch(CONFIG.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token exchange failed: ${errorText}`);
      }

      const data = await response.json();

      // Store tokens
      localStorage.setItem(this.accessTokenKey, data.access_token);
      localStorage.setItem(this.refreshTokenKey, data.refresh_token);

      // Calculate and store expiration time
      const expiresAt = Date.now() + (data.expires_in * 1000);
      localStorage.setItem(this.tokenExpiresAtKey, expiresAt.toString());

      // Clean up
      localStorage.removeItem(this.stateKey);
      localStorage.removeItem(this.codeVerifierKey);

      return data;
    }

    // Get User Info
    async getUserInfo() {
      const token = await this.getValidAccessToken();
      if (!token) return null;

      try {
        const response = await fetch(CONFIG.userInfoEndpoint, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          if (response.status === 401) {
            this.logout();
            return null;
          }
          throw new Error('Failed to fetch user info');
        }

        return await response.json();
      } catch (e) {
        console.error(e);
        return null;
      }
    }

    // Get a valid access token, refreshing if necessary
    async getValidAccessToken() {
      const token = localStorage.getItem(this.accessTokenKey);
      const expiresAt = localStorage.getItem(this.tokenExpiresAtKey);

      if (!token) return null;

      // Check if token is expired or will expire in the next 5 minutes
      const now = Date.now();
      const expiryTime = parseInt(expiresAt);

      if (expiryTime && now >= expiryTime - 5 * 60 * 1000) {
        // Token expired or expiring soon, try to refresh
        console.log('Access token expired or expiring soon, refreshing...');
        const refreshed = await this.refreshAccessToken();
        if (!refreshed) {
          return null;
        }
        return localStorage.getItem(this.accessTokenKey);
      }

      return token;
    }

    // Refresh access token using refresh token
    async refreshAccessToken() {
      const refreshToken = localStorage.getItem(this.refreshTokenKey);
      if (!refreshToken) {
        console.error('No refresh token available');
        return false;
      }

      try {
        const params = new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: CONFIG.clientId,
          refresh_token: refreshToken
        });

        const response = await fetch(CONFIG.tokenEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params
        });

        if (!response.ok) {
          console.error('Token refresh failed:', response.status);
          this.logout();
          return false;
        }

        const data = await response.json();

        // Update tokens
        localStorage.setItem(this.accessTokenKey, data.access_token);
        localStorage.setItem(this.refreshTokenKey, data.refresh_token);

        // Update expiration time
        const expiresAt = Date.now() + (data.expires_in * 1000);
        localStorage.setItem(this.tokenExpiresAtKey, expiresAt.toString());

        console.log('Access token refreshed successfully');
        return true;
      } catch (error) {
        console.error('Error refreshing token:', error);
        this.logout();
        return false;
      }
    }

    isAuthenticated() {
      return !!localStorage.getItem(this.accessTokenKey);
    }

    logout() {
      localStorage.removeItem(this.accessTokenKey);
      localStorage.removeItem(this.refreshTokenKey);
      localStorage.removeItem(this.tokenExpiresAtKey);
      localStorage.removeItem(this.stateKey);
      localStorage.removeItem(this.codeVerifierKey);
      window.location.reload();
    }
  }

  // Export to global
  window.SekaiAuth = new Auth();
})();
