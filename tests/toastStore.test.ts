/**
 * Toast store tests.
 *
 * The bell panel in the terminal tab bar is the persistent home for
 * notifications: dismissing a toast only hides it from the toast
 * stack (it stays in the store), and opening the bell panel marks
 * everything read (the badge clears). Deleting still happens only
 * from the panel (per-item dismiss / clear-all).
 *
 * Run with: npm test
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  useToastStore,
  unreadCount,
  visibleToastNotifications,
} from '../src/stores/toastStore';

const reset = () => useToastStore.setState({ notifications: [] });

beforeEach(reset);

describe('toastStore', () => {
  it('creates notifications unread and toast-visible by default', () => {
    const id = useToastStore.getState().error('Disk full');
    const [n] = useToastStore.getState().notifications;
    expect(useToastStore.getState().notifications).toHaveLength(1);
    expect(n.id).toBe(id);
    expect(n.read).toBe(false);
    expect(n.toastDismissed).toBe(false);
    expect(n.duration).toBe(5000);
  });

  it('keeps the documented default durations per type', () => {
    const s = useToastStore.getState();
    s.error('e');
    s.warning('w');
    s.info('i');
    s.success('s');
    const byType = Object.fromEntries(
      useToastStore.getState().notifications.map((n) => [n.type, n.duration]),
    );
    expect(byType.error).toBe(5000);
    expect(byType.warning).toBe(5000);
    expect(byType.info).toBe(4000);
    expect(byType.success).toBe(3000);
  });

  it('dismissToast hides the toast but keeps the notification for the bell panel', () => {
    const id = useToastStore.getState().error('Disk full');
    useToastStore.getState().dismissToast(id);
    const { notifications } = useToastStore.getState();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].toastDismissed).toBe(true);
    // Still unread — dismissing a toast is not seeing it.
    expect(notifications[0].read).toBe(false);
    expect(unreadCount(notifications)).toBe(1);
    // The toast stack (which filters on this) no longer shows it.
    expect(visibleToastNotifications(notifications)).toHaveLength(0);
  });

  it('markAllRead clears the unread count without deleting anything', () => {
    const s = useToastStore.getState();
    s.error('Disk full');
    s.info('Saved');
    expect(unreadCount(useToastStore.getState().notifications)).toBe(2);
    useToastStore.getState().markAllRead();
    const { notifications } = useToastStore.getState();
    expect(notifications).toHaveLength(2);
    expect(notifications.every((n) => n.read)).toBe(true);
    expect(unreadCount(notifications)).toBe(0);
  });

  it('unreadCount counts only unread notifications', () => {
    const s = useToastStore.getState();
    s.error('Disk full');
    s.info('Saved');
    s.success('Done');
    expect(unreadCount(useToastStore.getState().notifications)).toBe(3);
    useToastStore.getState().markAllRead();
    s.warning('Low disk');
    expect(unreadCount(useToastStore.getState().notifications)).toBe(1);
  });

  it('visibleToastNotifications returns only toasts that have not gone yet', () => {
    const s = useToastStore.getState();
    const a = s.error('First');
    s.error('Second');
    useToastStore.getState().dismissToast(a);
    const visible = visibleToastNotifications(useToastStore.getState().notifications);
    expect(visible).toHaveLength(1);
    expect(visible[0].message).toBe('Second');
  });

  it('removeNotification deletes just that notification', () => {
    const s = useToastStore.getState();
    const a = s.error('First');
    s.error('Second');
    useToastStore.getState().removeNotification(a);
    const { notifications } = useToastStore.getState();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].message).toBe('Second');
  });

  it('clearAll empties the store', () => {
    const s = useToastStore.getState();
    s.error('First');
    s.info('Second');
    useToastStore.getState().clearAll();
    expect(useToastStore.getState().notifications).toHaveLength(0);
  });
});
