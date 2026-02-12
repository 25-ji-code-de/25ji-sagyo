// Notification System
// Minimal, dependency-free toast notifications
(function() {
  'use strict';

  class NotificationManager {
    constructor() {
      this.container = null;
      this.init();
    }

    init() {
      // Create container if it doesn't exist
      if (!document.getElementById('sekai-notification-container')) {
        this.container = document.createElement('div');
        this.container.id = 'sekai-notification-container';
        document.body.appendChild(this.container);
      } else {
        this.container = document.getElementById('sekai-notification-container');
      }
    }

    /**
     * Show a notification
     * @param {string} message - The message to display
     * @param {string} type - 'success', 'error', 'info', 'warning'
     * @param {number} duration - Duration in ms (default 3000)
     */
    show(message, type = 'info', duration = 3000) {
      const notification = document.createElement('div');
      notification.className = `sekai-notification sekai-notification-${type}`;
      
      const icon = this.getIcon(type);
      
      notification.innerHTML = `
        <div class="sekai-notification-icon">${icon}</div>
        <div class="sekai-notification-content">${message}</div>
        <button class="sekai-notification-close">&times;</button>
      `;

      // Close button handler
      notification.querySelector('.sekai-notification-close').addEventListener('click', () => {
        this.dismiss(notification);
      });

      this.container.appendChild(notification);

      // Animation in
      requestAnimationFrame(() => {
        notification.classList.add('show');
      });

      // Auto dismiss
      if (duration > 0) {
        setTimeout(() => {
          this.dismiss(notification);
        }, duration);
      }
    }
    
    dismiss(notification) {
      notification.classList.remove('show');
      notification.addEventListener('transitionend', () => {
        if (notification.parentElement) {
          notification.remove();
        }
      });
    }

    getIcon(type) {
      switch (type) {
        case 'success':
          return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        case 'error':
          return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
        case 'warning':
          return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
        case 'info':
        default:
          return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
      }
    }
    
    // Quick helpers
    success(msg, duration) { this.show(msg, 'success', duration); }
    error(msg, duration) { this.show(msg, 'error', duration); }
    info(msg, duration) { this.show(msg, 'info', duration); }
    warning(msg, duration) { this.show(msg, 'warning', duration); }
  }

  // Expose globally
  window.SekaiNotification = new NotificationManager();
})();
