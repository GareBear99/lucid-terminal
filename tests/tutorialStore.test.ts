/**
 * Tutorial store (Atom steal #15, Kite half) — step navigation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useTutorialStore } from '../src/stores/tutorialStore';
import { BUILTIN_TUTORIALS } from '../src/lib/tutorials';

describe('tutorialStore', () => {
  beforeEach(() => {
    useTutorialStore.getState().resetForTests();
  });

  const tutorial = BUILTIN_TUTORIALS[0];

  it('starts with no tutorial open', () => {
    expect(useTutorialStore.getState().tutorial).toBeNull();
    expect(useTutorialStore.getState().stepIndex).toBe(0);
  });

  it('openTutorial starts at the first step', () => {
    useTutorialStore.getState().openTutorial(tutorial);
    expect(useTutorialStore.getState().tutorial?.id).toBe(tutorial.id);
    expect(useTutorialStore.getState().stepIndex).toBe(0);
  });

  it('next / previous advance and clamp at the ends', () => {
    const api = useTutorialStore.getState();
    api.openTutorial(tutorial);
    const last = tutorial.steps.length - 1;
    for (let i = 0; i < last + 3; i++) api.nextStep();
    expect(useTutorialStore.getState().stepIndex).toBe(last);
    for (let i = 0; i < last + 3; i++) api.previousStep();
    expect(useTutorialStore.getState().stepIndex).toBe(0);
  });

  it('goToStep clamps into range and does nothing with no tutorial', () => {
    const api = useTutorialStore.getState();
    api.goToStep(2);
    expect(useTutorialStore.getState().stepIndex).toBe(0);
    api.openTutorial(tutorial);
    api.goToStep(99);
    expect(useTutorialStore.getState().stepIndex).toBe(tutorial.steps.length - 1);
    api.goToStep(-5);
    expect(useTutorialStore.getState().stepIndex).toBe(0);
    api.goToStep(1);
    expect(useTutorialStore.getState().stepIndex).toBe(1);
  });

  it('closeTutorial clears the tutorial and the step', () => {
    const api = useTutorialStore.getState();
    api.openTutorial(tutorial);
    api.nextStep();
    api.closeTutorial();
    expect(useTutorialStore.getState().tutorial).toBeNull();
    expect(useTutorialStore.getState().stepIndex).toBe(0);
  });
});
