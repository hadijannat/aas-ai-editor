<script setup lang="ts">
import { useNotificationStore } from '@/stores/notification';
import { storeToRefs } from 'pinia';

const notificationStore = useNotificationStore();
const { notifications } = storeToRefs(notificationStore);
</script>

<template>
  <div class="toast-container">
    <TransitionGroup name="toast">
      <div
        v-for="notification in notifications"
        :key="notification.id"
        :class="['toast', `toast-${notification.type}`]"
      >
        <span class="toast-message">{{ notification.message }}</span>
        <button
          class="toast-close"
          @click="notificationStore.remove(notification.id)"
        >
          ×
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  z-index: 1000;
}

.toast {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-radius: 0.375rem;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  min-width: 250px;
  max-width: 400px;
}

.toast-success {
  background-color: #dcfce7;
  color: #166534;
}

.toast-error {
  background-color: #fee2e2;
  color: #991b1b;
}

.toast-warning {
  background-color: #fef9c3;
  color: #854d0e;
}

.toast-info {
  background-color: #dbeafe;
  color: #1e40af;
}

.toast-message {
  flex: 1;
}

.toast-close {
  background: none;
  border: none;
  font-size: 1.25rem;
  cursor: pointer;
  opacity: 0.7;
}

.toast-close:hover {
  opacity: 1;
}

/* Transitions */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
</style>
