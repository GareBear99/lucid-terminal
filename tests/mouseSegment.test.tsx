/**
 * Mouse pointer registry tests (Gary, 2026-11-09 ~15:07–15:11 PST).
 *
 * The Mouse segment holds ALL the pointers Lucid has — mice and
 * finger pointers alike. The registry (src/lib/mouse.ts) is read
 * from the actual code: the Mac mouse (computer-control driver),
 * the browser's locked mouse (CDP + finger queue), and the Android
 * finger (scrcpy touch). Nothing is invented here, and the gaps
 * (multi-touch, stylus, trackpad gestures, Windows/Linux, iOS)
 * are stated as not built, never faked.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import {
  POINTER_TYPES,
  POINTER_GAPS,
  describeAndroidFinger,
  describeMouseStatus,
} from '../src/lib/mouse';

describe('POINTER_TYPES — the inventory, read from the code', () => {
  it('lists exactly the three pointer types the code has', () => {
    expect(POINTER_TYPES.map((p) => p.id)).toEqual([
      'mac-mouse',
      'browser-mouse',
      'android-finger',
    ]);
    for (const pointer of POINTER_TYPES) {
      expect(pointer.name).toBeTruthy();
      expect(pointer.where).toBeTruthy();
      expect(pointer.driver).toBeTruthy();
      expect(pointer.built).toBe(true);
    }
  });

  it('the Mac mouse reuses the computer-control driver — AppleScript + screencapture', () => {
    const mac = POINTER_TYPES.find((p) => p.id === 'mac-mouse')!;
    expect(mac.driver).toContain('AppleScript');
    expect(mac.driver).toContain('screencapture');
    expect(mac.note).toContain('macOS only');
  });

  it('the browser mouse is locked to the browser area through the finger queue', () => {
    const browser = POINTER_TYPES.find((p) => p.id === 'browser-mouse')!;
    expect(browser.driver).toContain('Input.dispatchMouseEvent');
    expect(browser.driver).toContain('clamped to the browser view bounds');
    expect(browser.where).toContain('never outside it');
  });

  it('the Android finger is scrcpy touch — one finger at a time, jar not bundled', () => {
    const finger = POINTER_TYPES.find((p) => p.id === 'android-finger')!;
    expect(finger.driver).toContain('INJECT_TOUCH_EVENT');
    expect(finger.driver).toContain('one finger at a time');
    expect(finger.note).toContain('not bundled yet');
  });
});

describe('POINTER_GAPS — what does NOT exist, stated honestly', () => {
  it('names multi-touch, stylus, trackpad gestures, Windows/Linux, and iOS as not built', () => {
    const joined = POINTER_GAPS.join(' ');
    expect(joined).toContain('Multi-touch');
    expect(joined).toContain('Stylus');
    expect(joined).toContain('Trackpad gestures');
    expect(joined).toContain('Windows and Linux');
    expect(joined).toContain('iOS');
    expect(POINTER_GAPS.length).toBe(5);
  });
});

describe('describeMouseStatus', () => {
  it('locked wins over everything — the kill switch', () => {
    expect(
      describeMouseStatus({
        locked: true,
        browserMouse: { x: 10, y: 20 },
        lastAction: { kind: 'click', outcome: 'landed', verified: true },
        androidDevices: 1,
      }),
    ).toEqual({
      status: 'Locked',
      detail:
        'The mouse does not move — every action is refused before anything runs. Unlock it in the Computer control section.',
    });
  });

  it('a live browser mouse reports its position, locked inside the browser area', () => {
    const status = describeMouseStatus({
      locked: false,
      browserMouse: { x: 100.4, y: 200.6 },
      lastAction: null,
      androidDevices: null,
    });
    expect(status.status).toBe('In the browser area');
    expect(status.detail).toContain('100, 201');
    expect(status.detail).toContain('locked inside the browser area');
  });

  it('a last Mac action reports its kind, outcome, and verification', () => {
    expect(
      describeMouseStatus({
        locked: false,
        browserMouse: null,
        lastAction: { kind: 'click', outcome: 'landed', verified: true },
        androidDevices: null,
      }),
    ).toEqual({
      status: 'Last action: click — landed',
      detail: 'Verified by reading the screen back afterwards.',
    });
    expect(
      describeMouseStatus({
        locked: false,
        browserMouse: null,
        lastAction: { kind: 'type', outcome: 'unverified', verified: false },
        androidDevices: null,
      }).detail,
    ).toContain('Not verified');
  });

  it('idle when nothing has happened yet', () => {
    expect(
      describeMouseStatus({
        locked: false,
        browserMouse: null,
        lastAction: null,
        androidDevices: null,
      }),
    ).toEqual({
      status: 'Idle',
      detail: 'No actions yet — the mouse moves only when it is driven.',
    });
  });
});

describe('describeAndroidFinger', () => {
  it('is honest about unknown, none, one, and several devices', () => {
    expect(describeAndroidFinger(null)).toContain('device state unknown');
    expect(describeAndroidFinger(0)).toContain('no Android device connected');
    expect(describeAndroidFinger(1)).toContain('one device connected');
    expect(describeAndroidFinger(2)).toContain('2 devices connected');
  });
});
