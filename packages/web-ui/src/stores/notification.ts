/**
 * Notification Store
 *
 * Manages toast notifications.
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration: number;
}

let notificationId = 0;

export const useNotificationStore = defineStore('notification', () => {
  const notifications = ref<Notification[]>([]);

  function add(notification: Omit<Notification, 'id'>) {
    const id = `notification-${++notificationId}`;
    const newNotification: Notification = { ...notification, id };

    notifications.value.push(newNotification);

    // Auto-remove after duration
    if (notification.duration > 0) {
      setTimeout(() => {
        remove(id);
      }, notification.duration);
    }
  }

  function remove(id: string) {
    const index = notifications.value.findIndex((n) => n.id === id);
    if (index > -1) {
      notifications.value.splice(index, 1);
    }
  }

  function success(message: string, duration = 3000) {
    add({ type: 'success', message, duration });
  }

  function error(message: string, duration = 5000) {
    add({ type: 'error', message, duration });
  }

  function warning(message: string, duration = 4000) {
    add({ type: 'warning', message, duration });
  }

  function info(message: string, duration = 3000) {
    add({ type: 'info', message, duration });
  }

  return {
    notifications,
    add,
    remove,
    success,
    error,
    warning,
    info,
  };
});
