import { describe, expect, it } from 'vitest';
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_PURPLE,
  HEARTBEAT_RED,
  HEARTBEAT_TYPING_PAUSE_MS,
  heartbeatFrameFor,
  isTypingPaused,
  shouldShowHeartbeat,
} from '../src/components/Terminal/heartbeat';

describe('heartbeatFrameFor — the original alternation', () => {
  it('frame 0 is red with the skull & bones', () => {
    const frame = heartbeatFrameFor(0);
    expect(frame.color).toBe(HEARTBEAT_RED);
    expect(frame.skull).toBe('☠️');
    expect(frame.text).toBe('🩸 Idle • Awaiting Commands... ☠️');
  });

  it('frame 1 is purple with the skull', () => {
    const frame = heartbeatFrameFor(1);
    expect(frame.color).toBe(HEARTBEAT_PURPLE);
    expect(frame.skull).toBe('💀');
    expect(frame.text).toBe('🩸 Idle • Awaiting Commands... 💀');
  });

  it('alternates back to red on frame 2', () => {
    const frame = heartbeatFrameFor(2);
    expect(frame.color).toBe(HEARTBEAT_RED);
    expect(frame.skull).toBe('☠️');
  });

  it('alternates to purple on frame 3', () => {
    const frame = heartbeatFrameFor(3);
    expect(frame.color).toBe(HEARTBEAT_PURPLE);
    expect(frame.skull).toBe('💀');
  });

  it('ticks every 1 second, the original cycle', () => {
    expect(HEARTBEAT_INTERVAL_MS).toBe(1000);
  });
});

describe('shouldShowHeartbeat — active and idle only', () => {
  it('shows when the plugin is active and idle', () => {
    expect(shouldShowHeartbeat(true, false)).toBe(true);
  });

  it('hides while a task is running', () => {
    expect(shouldShowHeartbeat(true, true)).toBe(false);
  });

  it('hides when the plugin is offline', () => {
    expect(shouldShowHeartbeat(false, false)).toBe(false);
  });

  it('hides when the plugin is offline and busy', () => {
    expect(shouldShowHeartbeat(false, true)).toBe(false);
  });
});

describe('isTypingPaused — the original smart pausing', () => {
  it('pauses within the pause window after a keystroke', () => {
    expect(isTypingPaused(1000, 1000 + HEARTBEAT_TYPING_PAUSE_MS - 1)).toBe(true);
  });

  it('resumes once the pause window has passed', () => {
    expect(isTypingPaused(1000, 1000 + HEARTBEAT_TYPING_PAUSE_MS)).toBe(false);
  });

  it('is not paused when nothing was ever typed', () => {
    expect(isTypingPaused(0, 100000)).toBe(false);
  });
});
