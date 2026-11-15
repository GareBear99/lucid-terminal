// @vitest-environment jsdom
/**
 * Tutorial panel (Atom steal #15, Kite half) — the picker
 * and the step viewer.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, act, fireEvent } from '@testing-library/react';
import { TutorialPanel } from '../src/components/Tutorials/TutorialPanel';
import { useTutorialStore } from '../src/stores/tutorialStore';
import { useModalStore } from '../src/stores/modalStore';
import { BUILTIN_TUTORIALS } from '../src/lib/tutorials';

describe('TutorialPanel', () => {
  beforeEach(() => {
    useTutorialStore.getState().resetForTests();
    useModalStore.getState().close();
    (window as unknown as { lucidAPI?: unknown }).lucidAPI = {
      fs: { selectFile: vi.fn(async () => null), readFile: vi.fn(async () => '') },
    };
  });

  it('the picker lists the built-in tutorials', () => {
    const { getByText } = render(<TutorialPanel />);
    for (const tutorial of BUILTIN_TUTORIALS) {
      expect(getByText(tutorial.title)).toBeTruthy();
    }
    expect(getByText('Load a tutorial file…')).toBeTruthy();
  });

  it('selecting a tutorial opens its first step', () => {
    const tutorial = BUILTIN_TUTORIALS[0];
    const { getByText, getByTestId } = render(<TutorialPanel />);
    act(() => {
      fireEvent.click(getByText(tutorial.title));
    });
    expect(getByTestId('tutorial-viewer')).toBeTruthy();
    expect(getByText('Step 1 of ' + tutorial.steps.length)).toBeTruthy();
    expect(getByText(tutorial.steps[0].title)).toBeTruthy();
    expect(getByText(tutorial.steps[0].prompt)).toBeTruthy();
  });

  it('Next advances, Previous goes back, the solution hides between steps', () => {
    const tutorial = BUILTIN_TUTORIALS[0];
    useTutorialStore.getState().openTutorial(tutorial);
    const { getByText, queryByText } = render(<TutorialPanel />);
    // Step 1: reveal the solution, then advance — the next
    // step's solution starts hidden.
    act(() => {
      fireEvent.click(getByText('Show solution'));
    });
    expect(getByText(tutorial.steps[0].solution)).toBeTruthy();
    act(() => {
      fireEvent.click(getByText('Next'));
    });
    expect(getByText('Step 2 of ' + tutorial.steps.length)).toBeTruthy();
    expect(queryByText(tutorial.steps[1].solution)).toBeNull();
    expect(getByText('Show solution')).toBeTruthy();
    act(() => {
      fireEvent.click(getByText('Previous'));
    });
    expect(getByText('Step 1 of ' + tutorial.steps.length)).toBeTruthy();
  });

  it('Next is disabled on the last step, Previous on the first', () => {
    const tutorial = BUILTIN_TUTORIALS[0];
    useTutorialStore.getState().openTutorial(tutorial);
    const { getByText } = render(<TutorialPanel />);
    expect((getByText('Previous') as HTMLButtonElement).disabled).toBe(true);
    act(() => {
      useTutorialStore.getState().goToStep(tutorial.steps.length - 1);
    });
    expect((getByText('Next') as HTMLButtonElement).disabled).toBe(true);
  });

  it('All tutorials returns to the picker', () => {
    useTutorialStore.getState().openTutorial(BUILTIN_TUTORIALS[0]);
    const { getByText, queryByTestId } = render(<TutorialPanel />);
    act(() => {
      fireEvent.click(getByText('All tutorials'));
    });
    expect(queryByTestId('tutorial-viewer')).toBeNull();
    expect(getByText('Load a tutorial file…')).toBeTruthy();
  });
});
