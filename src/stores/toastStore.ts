import { create } from 'zustand';
import type { Notification, NotificationType } from '../components/Terminal/ErrorNotification';

/**
 * Global toast store.
 *
 * The Warp-style ErrorNotification component existed but was only used by a
 * demo file, so real errors (file access, terminal spawn, Monaco fallback)
 * were silent. This store lets any code — components or other stores —
 * surface a toast without prop drilling. App.tsx renders the
 * <ErrorNotification> stack from this store.
 */
interface ToastState {
  notifications: Notification[];
  addNotification: (type: NotificationType, message: string, duration?: number) => string;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  error: (message: string, duration?: number) => string;
  warning: (message: string, duration?: number) => string;
  info: (message: string, duration?: number) => string;
  success: (message: string, duration?: number) => string;
}

function makeId(): string {
  return `notification-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useToastStore = create<ToastState>((set) => {
  const addNotification = (
    type: NotificationType,
    message: string,
    duration = 5000
  ): string => {
    const notification: Notification = {
      id: makeId(),
      type,
      message,
      duration,
      dismissible: true,
    };
    set((state) => ({ notifications: [...state.notifications, notification] }));
    return notification.id;
  };

  return {
    notifications: [],
    addNotification,
    removeNotification: (id) =>
      set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) })),
    clearAll: () => set({ notifications: [] }),
    error: (message, duration = 5000) => addNotification('error', message, duration),
    warning: (message, duration = 5000) => addNotification('warning', message, duration),
    info: (message, duration = 4000) => addNotification('info', message, duration),
    success: (message, duration = 3000) => addNotification('success', message, duration),
  };
});
