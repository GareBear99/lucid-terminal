import { describe, expect, it } from 'vitest';
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_PURPLE,
  HEARTBEAT_RED,
  HEARTBEAT_TYPING_PAUSE_MS,
  bloodDropFrameIndex,
  heartbeatFrameFor,
  isTypingPaused,
  shouldAdvanceFrame,
  shouldShowHeartbeat,
} from '../src/components/Terminal/heartbeatLogic';

describe('heartbeatFrameFor — colour/skull alternation, blood drop on the 💀 frame only', () => {
  it('frame 0 is red with the skull & bones and NO blood drop', () => {
    const frame = heartbeatFrameFor(0);
    expect(frame.color).toBe(HEARTBEAT_RED);
    expect(frame.skull).toBe('☠️');
    expect(frame.text).toBe('Idle • Awaiting Commands... ☠️');
    expect(frame.text).not.toContain('🩸');
  });

  it('frame 1 is purple with the skull and the blood drop', () => {
    const frame = heartbeatFrameFor(1);
    expect(frame.color).toBe(HEARTBEAT_PURPLE);
    expect(frame.skull).toBe('💀');
    expect(frame.text).toBe('🩸 Idle • Awaiting Commands... 💀');
    expect(frame.text).toContain('🩸');
  });

  it('the blood drop appears only on the alternate-skull (odd) frames', () => {
    for (let i = 0; i < 6; i++) {
      const frame = heartbeatFrameFor(i);
      if (i % 2 === 0) {
        expect(frame.text).not.toContain('🩸');
      } else {
        expect(frame.text).toContain('🩸');
      }
    }
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

describe('shouldShowHeartbeat — active and idle, or dripping', () => {
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

  it('SHOWS while busy when the fangs drip — the hold, not a hide', () => {
    expect(shouldShowHeartbeat(true, true, true)).toBe(true);
  });

  it('shows when idle and dripping', () => {
    expect(shouldShowHeartbeat(true, false, true)).toBe(true);
  });

  it('hides when the plugin is offline even while dripping', () => {
    expect(shouldShowHeartbeat(false, true, true)).toBe(false);
    expect(shouldShowHeartbeat(false, false, true)).toBe(false);
  });
});

describe('bloodDropFrameIndex — "shift to the blood drop next"', () => {
  it('an even (demon-face) frame jumps to the next odd frame', () => {
    expect(bloodDropFrameIndex(0)).toBe(1);
    expect(bloodDropFrameIndex(2)).toBe(3);
    expect(bloodDropFrameIndex(100)).toBe(101);
  });

  it('an odd (blood-drop) frame stays put — no jump, no reset', () => {
    expect(bloodDropFrameIndex(1)).toBe(1);
    expect(bloodDropFrameIndex(3)).toBe(3);
    expect(bloodDropFrameIndex(5)).toBe(5);
  });

  it('the held frame is always a blood-drop frame', () => {
    for (let i = 0; i < 10; i++) {
      const held = bloodDropFrameIndex(i);
      expect(held % 2).toBe(1);
      expect(heartbeatFrameFor(held).text).toContain('🩸');
    }
  });
});

describe('shouldAdvanceFrame — the 1s tick, held while dripping', () => {
  const NOW = 100000;
  const LONG_AGO = 0; // last keystroke far outside the typing-pause window

  it('advances while active, idle, not dripping, and not typing', () => {
    expect(shouldAdvanceFrame(true, false, false, LONG_AGO, NOW)).toBe(true);
  });

  it('does NOT advance while dripping — the frame is held', () => {
    expect(shouldAdvanceFrame(true, false, true, LONG_AGO, NOW)).toBe(false);
    // Even busy+dripping (the hold state): no advance.
    expect(shouldAdvanceFrame(true, true, true, LONG_AGO, NOW)).toBe(false);
  });

  it('does NOT advance while busy without dripping — plain shell hides it', () => {
    expect(shouldAdvanceFrame(true, true, false, LONG_AGO, NOW)).toBe(false);
  });

  it('does NOT advance when the plugin is offline', () => {
    expect(shouldAdvanceFrame(false, false, false, LONG_AGO, NOW)).toBe(false);
  });

  it('does NOT advance while paused for typing, even when otherwise cycling', () => {
    expect(shouldAdvanceFrame(true, false, false, NOW - 100, NOW)).toBe(false);
  });

  it('resumes advancing once the hold ends — same rule, dripping false again', () => {
    // Hold: dripping true → no advance. Release: dripping false → advance.
    expect(shouldAdvanceFrame(true, true, true, LONG_AGO, NOW)).toBe(false);
    expect(shouldAdvanceFrame(true, true, false, LONG_AGO, NOW)).toBe(false); // still busy: hidden, no advance
    expect(shouldAdvanceFrame(true, false, false, LONG_AGO, NOW)).toBe(true); // idle again: cycling resumes
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
