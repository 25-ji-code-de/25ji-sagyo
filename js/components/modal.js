// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2025-2026 The 25-ji-code-de Team

(function() {
  'use strict';

  class ModalManager {
    constructor() {
      this.overlay = null;
      this.init();
    }

    init() {
      if (!document.getElementById('sekai-modal-overlay')) {
        this.overlay = document.createElement('div');
        this.overlay.id = 'sekai-modal-overlay';
        this.overlay.className = 'sekai-modal-overlay sekai-hidden';
        document.body.appendChild(this.overlay);
      } else {
        this.overlay = document.getElementById('sekai-modal-overlay');
      }
    }

    /**
     * Show a confirmation modal
     * @param {string} title
     * @param {string} message
     * @param {string} confirmText
     * @param {string} cancelText
     * @returns {Promise<boolean>}
     */
    confirm(title, message, confirmText = '确定', cancelText = '取消') {
      return new Promise((resolve) => {
        this.overlay.innerHTML = `
          <div class="sekai-modal">
            <h3 class="sekai-modal-title">${title}</h3>
            <div class="sekai-modal-content">${message.replace(/\n/g, '<br>')}</div>
            <div class="sekai-modal-actions">
              <button class="sekai-modal-btn sekai-modal-btn-cancel">${cancelText}</button>
              <button class="sekai-modal-btn sekai-modal-btn-confirm">${confirmText}</button>
            </div>
          </div>
        `;

        const close = (result) => {
            this.overlay.classList.add('sekai-hidden');
            setTimeout(() => {
                this.overlay.innerHTML = '';
            }, 300); // Wait for transition
            resolve(result);
        };

        const cancelBtn = this.overlay.querySelector('.sekai-modal-btn-cancel');
        const confirmBtn = this.overlay.querySelector('.sekai-modal-btn-confirm');

        cancelBtn.addEventListener('click', () => close(false));
        confirmBtn.addEventListener('click', () => close(true));

        // Click overlay to close
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) close(false);
        }, { once: true });

        this.overlay.classList.remove('sekai-hidden');
      });
    }

    /**
     * Show a prompt modal
     * @param {string} title
     * @param {string} defaultValue
     * @returns {Promise<string|null>}
     */
    prompt(title, defaultValue = '') {
        return new Promise((resolve) => {
            this.overlay.innerHTML = `
              <div class="sekai-modal">
                <h3 class="sekai-modal-title">${title}</h3>
                <div class="sekai-modal-content">
                    <input type="text" class="sekai-modal-input" value="${defaultValue}" />
                </div>
                <div class="sekai-modal-actions">
                  <button class="sekai-modal-btn sekai-modal-btn-cancel">取消</button>
                  <button class="sekai-modal-btn sekai-modal-btn-confirm">确定</button>
                </div>
              </div>
            `;
    
            const input = this.overlay.querySelector('input');
            const cancelBtn = this.overlay.querySelector('.sekai-modal-btn-cancel');
            const confirmBtn = this.overlay.querySelector('.sekai-modal-btn-confirm');

            const close = (result) => {
                this.overlay.classList.add('sekai-hidden');
                setTimeout(() => {
                    this.overlay.innerHTML = '';
                }, 300);
                resolve(result);
            };

            // Setup proper input handling
            input.value = defaultValue;
            
            // Handle enter key
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    close(input.value);
                } else if (e.key === 'Escape') {
                    close(null);
                }
            });
    
            cancelBtn.addEventListener('click', () => close(null));
            confirmBtn.addEventListener('click', () => close(input.value));
            
            // Click overlay to close
            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) close(null);
            }, { once: true });
    
            this.overlay.classList.remove('sekai-hidden');
            setTimeout(() => input.focus(), 50); // Focus after show
          });
    }
  }

  window.SekaiModal = new ModalManager();
})();
