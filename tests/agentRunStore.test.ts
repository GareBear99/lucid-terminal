// @vitest-environment jsdom
/**
 * agentRunStore — the reactive in-flight signal the Zed Stop
 * button reads (2026-11-15). One boolean per tab, set by
 * runAgentTurnForTab on start and cleared in its finally.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { useAgentRunStore } from '../src/stores/agentRunStore';

describe('agentRunStore — the agent run in-flight signal', () => {
  beforeEach(() => {
    useAgentRunStore.getState().resetAgentRunStoreForTests();
  });

  it('starts empty', () => {
    expect(useAgentRunStore.getState().inFlightByTab).toEqual({});
  });

  it('sets and clears the signal for one tab', () => {
    const store = useAgentRunStore.getState();
    store.setAgentRunInFlight('terminal-1', true);
    expect(useAgentRunStore.getState().inFlightByTab['terminal-1']).toBe(true);
    store.setAgentRunInFlight('terminal-1', false);
    expect(useAgentRunStore.getState().inFlightByTab['terminal-1']).toBeUndefined();
  });

  it('tracks tabs independently — clearing one leaves the other in flight', () => {
    const store = useAgentRunStore.getState();
    store.setAgentRunInFlight('terminal-1', true);
    store.setAgentRunInFlight('terminal-2', true);
    store.setAgentRunInFlight('terminal-1', false);
    expect(useAgentRunStore.getState().inFlightByTab['terminal-1']).toBeUndefined();
    expect(useAgentRunStore.getState().inFlightByTab['terminal-2']).toBe(true);
  });

  it('reset clears every tab', () => {
    const store = useAgentRunStore.getState();
    store.setAgentRunInFlight('terminal-1', true);
    store.setAgentRunInFlight('terminal-2', true);
    store.resetAgentRunStoreForTests();
    expect(useAgentRunStore.getState().inFlightByTab).toEqual({});
  });
});
