/**
 * Error Notification System - Warp Style
 * 
 * Features:
 * - Toast-style error messages (red/salmon background)
 * - Auto-fade after duration (default 5s)
 * - Manual dismiss with X button
 * - Configurable auto-fade toggle
 * - Stacks multiple errors
 * - Smooth animations
 */

import { useState, useEffect } from 'react';
import { X, AlertCircle, Info, CheckCircle, AlertTriangle } from 'lucide-react';

export type NotificationType = 'error' | 'warning' | 'success' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  duration?: number; // milliseconds, 0 = no auto-dismiss
  dismissible?: boolean;
}

interface ErrorNotificationProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
  autoFadeEnabled?: boolean;
}

export function ErrorNotification({ 
  notifications, 
  onDismiss, 
  autoFadeEnabled = true 
}: ErrorNotificationProps) {
  
  const getTypeStyles = (type: NotificationType) => {
    switch (type) {
      case 'error':
        return {
          bg: 'bg-red-500/15',
          border: 'border-red-500/40',
          text: 'text-red-300',
          icon: AlertCircle
        };
      case 'warning':
        return {
          bg: 'bg-yellow-500/15',
          border: 'border-yellow-500/40',
          text: 'text-yellow-300',
          icon: AlertTriangle
        };
      case 'success':
        return {
          bg: 'bg-green-500/15',
          border: 'border-green-500/40',
          text: 'text-green-300',
          icon: CheckCircle
        };
      case 'info':
        return {
          bg: 'bg-blue-500/15',
          border: 'border-blue-500/40',
          text: 'text-blue-300',
          icon: Info
        };
    }
  };
  
  return (
    <div className="error-notification-container fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md">
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onDismiss={onDismiss}
          autoFadeEnabled={autoFadeEnabled}
          typeStyles={getTypeStyles(notification.type)}
        />
      ))}
    </div>
  );
}

interface NotificationItemProps {
  notification: Notification;
  onDismiss: (id: string) => void;
  autoFadeEnabled: boolean;
  typeStyles: {
    bg: string;
    border: string;
    text: string;
    icon: any;
  };
}

function NotificationItem({ 
  notification, 
  onDismiss, 
  autoFadeEnabled,
  typeStyles 
}: NotificationItemProps) {
  const [isExiting, setIsExiting] = useState(false);
  const Icon = typeStyles.icon;
  
  useEffect(() => {
    if (autoFadeEnabled && notification.duration && notification.duration > 0) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, notification.duration);
      
      return () => clearTimeout(timer);
    }
  }, [notification.id, notification.duration, autoFadeEnabled]);
  
  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss(notification.id);
    }, 300); // Match animation duration
  };
  
  return (
    <div
      className={`
        ${typeStyles.bg} ${typeStyles.border} ${typeStyles.text}
        border rounded-lg p-3 pr-10 shadow-lg
        backdrop-blur-sm
        relative
        transition-all duration-300 ease-in-out
        ${isExiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'}
        animate-slide-in-right
      `}
    >
      <div className="flex items-start gap-2">
        <Icon size={18} className="flex-shrink-0 mt-0.5" />
        <p className="text-sm font-medium flex-1">{notification.message}</p>
      </div>
      
      {notification.dismissible !== false && (
        <button
          onClick={handleDismiss}
          className={`
            absolute top-2 right-2 p-1 rounded-md
            hover:bg-white/10 transition-colors
            ${typeStyles.text}
          `}
          title="Dismiss"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/**
 * Notification Manager Hook
 * Manages notification state and provides helper functions
 */

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [autoFadeEnabled, setAutoFadeEnabled] = useState(true);
  
  const addNotification = (
    type: NotificationType,
    message: string,
    duration: number = 5000,
    dismissible: boolean = true
  ) => {
    const id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const notification: Notification = {
      id,
      type,
      message,
      duration: autoFadeEnabled ? duration : 0,
      dismissible
    };
    
    setNotifications(prev => [...prev, notification]);
    
    return id;
  };
  
  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };
  
  const clearAll = () => {
    setNotifications([]);
  };
  
  // Helper methods for common notification types
  const error = (message: string, duration = 5000) => 
    addNotification('error', message, duration);
  
  const warning = (message: string, duration = 5000) => 
    addNotification('warning', message, duration);
  
  const success = (message: string, duration = 3000) => 
    addNotification('success', message, duration);
  
  const info = (message: string, duration = 4000) => 
    addNotification('info', message, duration);
  
  return {
    notifications,
    autoFadeEnabled,
    setAutoFadeEnabled,
    addNotification,
    removeNotification,
    clearAll,
    error,
    warning,
    success,
    info
  };
}

/**
 * Image Upload Limiter
 * Enforces 3-image limit per conversation/tab
 * Auto-inserts file path after limit reached
 */

export class ImageUploadLimiter {
  private imageCount: number = 0;
  private maxImages: number = 3;
  private notificationCallback?: (message: string) => void;
  
  constructor(maxImages: number = 3) {
    this.maxImages = maxImages;
  }
  
  setNotificationCallback(callback: (message: string) => void) {
    this.notificationCallback = callback;
  }
  
  canUploadImage(): boolean {
    return this.imageCount < this.maxImages;
  }
  
  incrementCount(): void {
    this.imageCount++;
  }
  
  getCount(): number {
    return this.imageCount;
  }
  
  getRemainingCount(): number {
    return Math.max(0, this.maxImages - this.imageCount);
  }
  
  reset(): void {
    this.imageCount = 0;
  }
  
  /**
   * Handle image upload attempt
   * Returns: { allowed: boolean, message?: string, shouldInsertPath?: boolean }
   */
  handleImageUpload(file: File): {
    allowed: boolean;
    message?: string;
    shouldInsertPath?: boolean;
    path?: string;
  } {
    if (this.canUploadImage()) {
      this.incrementCount();
      return { allowed: true };
    }
    
    // Limit exceeded - insert path instead
    const message = `1 image wasn't attached - limit is ${this.maxImages} images per conversation.`;
    
    if (this.notificationCallback) {
      this.notificationCallback(message);
    }
    
    // Return file path for insertion
    const path = (file as any).path || file.name;
    
    return {
      allowed: false,
      message,
      shouldInsertPath: true,
      path
    };
  }
}

/**
 * Request Error Handler
 * Handles failed LLM requests with appropriate error messages
 */

export class RequestErrorHandler {
  private notificationCallback?: (message: string, type: NotificationType) => void;
  
  setNotificationCallback(callback: (message: string, type: NotificationType) => void) {
    this.notificationCallback = callback;
  }
  
  handleError(error: Error, context?: string): void {
    let message = this.getErrorMessage(error);
    
    if (context) {
      message = `${context}: ${message}`;
    }
    
    if (this.notificationCallback) {
      this.notificationCallback(message, 'error');
    }
  }
  
  private getErrorMessage(error: Error): string {
    const errorStr = error.message.toLowerCase();
    
    // Network errors
    if (errorStr.includes('network') || errorStr.includes('fetch')) {
      return 'Network error - check your connection and try again';
    }
    
    // Timeout errors
    if (errorStr.includes('timeout')) {
      return 'Request timed out - the model took too long to respond';
    }
    
    // API key errors
    if (errorStr.includes('api key') || errorStr.includes('unauthorized')) {
      return 'API key error - check your credentials in Settings';
    }
    
    // Rate limit errors
    if (errorStr.includes('rate limit') || errorStr.includes('429')) {
      return 'Rate limit exceeded - please wait a moment and try again';
    }
    
    // Model not found
    if (errorStr.includes('not found') || errorStr.includes('404')) {
      return 'Model not found - check that the model is installed';
    }
    
    // Out of memory
    if (errorStr.includes('memory') || errorStr.includes('oom')) {
      return 'Out of memory - try a smaller model or reduce context length';
    }
    
    // Context too long
    if (errorStr.includes('context') || errorStr.includes('too long')) {
      return 'Input too long - reduce the prompt length or conversation history';
    }
    
    // Generic error
    return `Error: ${error.message}`;
  }
  
  /**
   * Handle successful request completion
   */
  handleSuccess(message?: string): void {
    if (this.notificationCallback && message) {
      this.notificationCallback(message, 'success');
    }
  }
}

/**
 * Auto-fade Settings Component
 * Toggle for requiring manual dismiss vs auto-fade
 */

interface AutoFadeSettingsProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export function AutoFadeSettings({ enabled, onChange }: AutoFadeSettingsProps) {
  return (
    <div className="flex items-center justify-between p-3 bg-[var(--bg-secondary)] rounded-lg">
      <div className="flex-1">
        <h4 className="text-sm font-medium text-[var(--text-primary)]">
          Auto-dismiss notifications
        </h4>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Notifications fade automatically after a few seconds. Disable to require manual dismiss.
        </p>
      </div>
      <label className="relative inline-flex items-center cursor-pointer ml-4">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className="
          w-11 h-6 
          bg-gray-700 
          peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 
          rounded-full peer 
          peer-checked:after:translate-x-full 
          peer-checked:after:border-white 
          after:content-[''] 
          after:absolute 
          after:top-[2px] 
          after:left-[2px] 
          after:bg-white 
          after:rounded-full 
          after:h-5 
          after:w-5 
          after:transition-all 
          peer-checked:bg-blue-600
        "></div>
      </label>
    </div>
  );
}

/**
 * CSS Animation (add to globals.css)
 * 
 * @keyframes slide-in-right {
 *   from {
 *     opacity: 0;
 *     transform: translateX(100%);
 *   }
 *   to {
 *     opacity: 1;
 *     transform: translateX(0);
 *   }
 * }
 * 
 * .animate-slide-in-right {
 *   animation: slide-in-right 0.3s ease-out;
 * }
 */
