/**
 * Browser Phase B — finger queue tests: one agent at a time,
 * QUEUED, if eligible (the phone-finger pattern: a finger starts
 * enabled, Gary locks it explicitly).
 *
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest';
import { BrowserFingerQueue } from '../electron/services/browserFingerQueue';

describe('browser finger queue', () => {
  it('starts enabled: the first requester is granted', () => {
    const queue = new BrowserFingerQueue();
    expect(queue.isLocked()).toBe(false);
    expect(queue.request('lucifer-ai')).toEqual({ granted: true });
    expect(queue.getHolder()).toBe('lucifer-ai');
  });

  it('re-requesting as the holder is a no-op grant', () => {
    const queue = new BrowserFingerQueue();
    queue.request('lucifer-ai');
    expect(queue.request('lucifer-ai')).toEqual({ granted: true });
    expect(queue.getQueue()).toEqual([]);
  });

  it('queues later agents in order and reports their position', () => {
    const queue = new BrowserFingerQueue();
    queue.request('lucifer-ai');
    expect(queue.request('agent-2')).toEqual({
      granted: false,
      position: 1,
      reason: 'queued',
    });
    expect(queue.request('agent-3')).toEqual({
      granted: false,
      position: 2,
      reason: 'queued',
    });
    expect(queue.request('agent-2')).toEqual({
      granted: false,
      position: 1,
      reason: 'queued',
    });
    expect(queue.getQueue()).toEqual(['agent-2', 'agent-3']);
  });

  it('release grants the next waiter in order', () => {
    const queue = new BrowserFingerQueue();
    queue.request('lucifer-ai');
    queue.request('agent-2');
    queue.request('agent-3');
    expect(queue.release('lucifer-ai')).toBe('agent-2');
    expect(queue.getHolder()).toBe('agent-2');
    expect(queue.getQueue()).toEqual(['agent-3']);
    expect(queue.release('agent-2')).toBe('agent-3');
    expect(queue.release('agent-3')).toBeNull();
    expect(queue.getHolder()).toBeNull();
  });

  it('only the holder can release it', () => {
    const queue = new BrowserFingerQueue();
    queue.request('lucifer-ai');
    queue.request('agent-2');
    expect(queue.release('agent-2')).toBeNull();
    expect(queue.getHolder()).toBe('lucifer-ai');
    expect(queue.getQueue()).toEqual(['agent-2']);
  });

  it('cancel drops a waiter without touching the holder', () => {
    const queue = new BrowserFingerQueue();
    queue.request('lucifer-ai');
    queue.request('agent-2');
    queue.request('agent-3');
    queue.cancel('agent-2');
    expect(queue.getQueue()).toEqual(['agent-3']);
    expect(queue.release('lucifer-ai')).toBe('agent-3');
  });

  it('a locked finger refuses outright — never queues', () => {
    const queue = new BrowserFingerQueue(true);
    expect(queue.isLocked()).toBe(true);
    expect(queue.request('lucifer-ai')).toEqual({
      granted: false,
      position: null,
      reason: 'locked',
    });
    expect(queue.getHolder()).toBeNull();
    expect(queue.getQueue()).toEqual([]);
  });

  it('locking stops new grants; unlocking lets agents in again', () => {
    const queue = new BrowserFingerQueue();
    queue.request('lucifer-ai');
    queue.lock();
    expect(queue.request('agent-2')).toEqual({
      granted: false,
      position: null,
      reason: 'locked',
    });
    queue.unlock();
    expect(queue.request('agent-2')).toEqual({
      granted: false,
      position: 1,
      reason: 'queued',
    });
  });

  it('suspendHolder drops the holder without granting the next waiter', () => {
    const queue = new BrowserFingerQueue();
    queue.request('lucifer-ai');
    queue.request('agent-2');
    queue.suspendHolder('lucifer-ai');
    expect(queue.getHolder()).toBeNull();
    expect(queue.getQueue()).toEqual(['agent-2']);
    // The waiter can take it next — Gary handed it back.
    expect(queue.request('agent-2')).toEqual({ granted: true });
  });

  it('clearAll drops the holder and the whole queue', () => {
    const queue = new BrowserFingerQueue();
    queue.request('lucifer-ai');
    queue.request('agent-2');
    queue.clearAll();
    expect(queue.getHolder()).toBeNull();
    expect(queue.getQueue()).toEqual([]);
    expect(queue.request('agent-2')).toEqual({ granted: true });
  });
});
