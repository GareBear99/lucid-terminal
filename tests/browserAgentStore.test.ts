/**
 * Browser Phase B — agent store tests: the renderer mirrors
 * main's `browser:agent-state` snapshots (holder, queue, in-use,
 * splash, fullscreen, mouse, Gary's control, finger lock,
 * LuciferAI, popped-out tab).
 *
 * Run with: npm test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  initialBrowserAgentState,
  useBrowserAgentStore,
} from '../src/stores/browserAgentStore';
import type { BrowserAgentStateSnapshot } from '../src/lib/browserAgent';

const snapshot = (
  overrides: Partial<BrowserAgentStateSnapshot> = {},
): BrowserAgentStateSnapshot => ({
  ...initialBrowserAgentState,
  ...overrides,
});

beforeEach(() => {
  useBrowserAgentStore.getState().applyAgentState(initialBrowserAgentState);
});

describe('browser agent store', () => {
  it('starts idle, mouse hidden, finger unlocked, LuciferAI on', () => {
    const state = useBrowserAgentStore.getState();
    expect(state.holder).toBeNull();
    expect(state.inUse).toBe(false);
    expect(state.splash).toBe(false);
    expect(state.fullscreen).toBe(false);
    expect(state.mouse).toBeNull();
    expect(state.garyHasControl).toBe(false);
    expect(state.fingerLocked).toBe(false);
    expect(state.luciferAiEnabled).toBe(true);
    expect(state.poppedOutTabId).toBeNull();
  });

  it('mirrors a burst snapshot: holder, splash, mouse, popped-out tab', () => {
    useBrowserAgentStore.getState().applyAgentState(
      snapshot({
        holder: 'lucifer-ai',
        inUse: true,
        splash: true,
        mouse: { x: 120, y: 80 },
        poppedOutTabId: 'tab-1',
      }),
    );
    const state = useBrowserAgentStore.getState();
    expect(state.holder).toBe('lucifer-ai');
    expect(state.inUse).toBe(true);
    expect(state.splash).toBe(true);
    expect(state.mouse).toEqual({ x: 120, y: 80 });
    expect(state.poppedOutTabId).toBe('tab-1');
  });

  it('mirrors fullscreen while in use, and the queue behind the holder', () => {
    useBrowserAgentStore.getState().applyAgentState(
      snapshot({
        holder: 'lucifer-ai',
        queuedHolders: ['agent-2'],
        inUse: true,
        splash: false,
        fullscreen: true,
      }),
    );
    const state = useBrowserAgentStore.getState();
    expect(state.fullscreen).toBe(true);
    expect(state.queuedHolders).toEqual(['agent-2']);
  });

  it('applyAgentState marks the mirror hydrated (the LuciferAI-off bar waits for it)', () => {
    useBrowserAgentStore.setState({ hydrated: false });
    expect(useBrowserAgentStore.getState().hydrated).toBe(false);
    useBrowserAgentStore.getState().applyAgentState(snapshot({}));
    expect(useBrowserAgentStore.getState().hydrated).toBe(true);
  });

  it('mirrors LuciferAI disabled + Gary in control', () => {
    useBrowserAgentStore.getState().applyAgentState(
      snapshot({
        luciferAiEnabled: false,
        garyHasControl: true,
        mouse: null,
      }),
    );
    const state = useBrowserAgentStore.getState();
    expect(state.luciferAiEnabled).toBe(false);
    expect(state.garyHasControl).toBe(true);
    expect(state.mouse).toBeNull();
  });

  it('clearMouse hides the cursor locally', () => {
    useBrowserAgentStore
      .getState()
      .applyAgentState(snapshot({ mouse: { x: 10, y: 10 } }));
    useBrowserAgentStore.getState().clearMouse();
    expect(useBrowserAgentStore.getState().mouse).toBeNull();
  });

  it('a later snapshot replaces the earlier one wholesale', () => {
    useBrowserAgentStore
      .getState()
      .applyAgentState(snapshot({ inUse: true, holder: 'lucifer-ai' }));
    useBrowserAgentStore.getState().applyAgentState(initialBrowserAgentState);
    expect(useBrowserAgentStore.getState().inUse).toBe(false);
    expect(useBrowserAgentStore.getState().holder).toBeNull();
  });
});
