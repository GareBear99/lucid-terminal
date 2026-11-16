/**
 * Tutorial panel.
 *
 * Rendered by AtomModals when the 'tutorials' modal is open.
 * Two views: the picker (a FuzzyModal over the built-in
 * tutorials, plus a "Load a tutorial file…" row that reads a
 * user-authored tutorial JSON through the fs bridge and
 * validates it with the same strict parser) and the step
 * viewer (the open tutorial's current step: title, prompt,
 * a "Show solution" reveal — Kite's shape — Previous/Next,
 * and a step counter).
 *
 * The panel is a modal, not a dock: tutorials are opened
 * on demand from the palette (the "Tutorials…" command) and
 * closed when done.
 */
import { useState } from 'react';
import { X, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';
import { FuzzyModal, type FuzzyModalItem } from '../FuzzyModal/FuzzyModal';
import { BUILTIN_TUTORIALS, parseTutorial } from '../../lib/tutorials';
import { useTutorialStore } from '../../stores/tutorialStore';
import { useModalStore } from '../../stores/modalStore';
import { useToastStore } from '../../stores/toastStore';

const LOAD_FILE_ITEM_ID = '__load-tutorial-file__';

function TutorialPicker() {
  const openTutorial = useTutorialStore((s) => s.openTutorial);
  const close = useModalStore((s) => s.close);

  const items: FuzzyModalItem[] = [
    ...BUILTIN_TUTORIALS.map((t) => ({
      id: t.id,
      label: t.title,
      detail: `${t.steps.length} steps — ${t.description}`,
    })),
    {
      id: LOAD_FILE_ITEM_ID,
      label: 'Load a tutorial file…',
      detail: 'Open a tutorial JSON file (title, description, steps)',
    },
  ];

  const loadFromFile = async () => {
    try {
      const path = await window.lucidAPI?.fs?.selectFile?.([
        { name: 'Tutorial', extensions: ['json'] },
      ]);
      if (!path) return;
      const text = await window.lucidAPI.fs.readFile(path);
      const parsed: unknown = JSON.parse(text);
      const tutorial = parseTutorial(parsed);
      if (!tutorial) {
        useToastStore.getState().error('That file is not a valid tutorial (title, description, steps).');
        return;
      }
      openTutorial(tutorial);
    } catch {
      useToastStore.getState().error('Could not load that tutorial file.');
    }
  };

  return (
    <FuzzyModal
      open
      placeholder="Browse tutorials…"
      items={items}
      emptyText="No tutorials"
      onSelect={async (item) => {
        if (item.id === LOAD_FILE_ITEM_ID) {
          await loadFromFile();
          return;
        }
        const tutorial = BUILTIN_TUTORIALS.find((t) => t.id === item.id);
        if (tutorial) openTutorial(tutorial);
      }}
      onClose={close}
    />
  );
}

function TutorialViewer() {
  const tutorial = useTutorialStore((s) => s.tutorial);
  const stepIndex = useTutorialStore((s) => s.stepIndex);
  const nextStep = useTutorialStore((s) => s.nextStep);
  const previousStep = useTutorialStore((s) => s.previousStep);
  const closeTutorial = useTutorialStore((s) => s.closeTutorial);
  const close = useModalStore((s) => s.close);
  const [solutionShown, setSolutionShown] = useState(false);

  if (!tutorial) return null;
  const step = tutorial.steps[stepIndex];
  const last = stepIndex === tutorial.steps.length - 1;
  const first = stepIndex === 0;

  // Changing steps hides the solution again — each step's
  // answer is revealed on purpose, not carried over.
  const go = (fn: () => void) => () => {
    setSolutionShown(false);
    fn();
  };

  return (
    <div
      className="fuzzy-modal-backdrop"
      data-testid="tutorial-viewer"
      onClick={close}
    >
      <div
        className="fuzzy-modal"
        role="dialog"
        aria-label={tutorial.title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 pt-3">
          <BookOpen size={16} className="text-[var(--accent)] shrink-0" />
          <h2 className="text-sm font-semibold flex-1 truncate">{tutorial.title}</h2>
          <span className="text-xs text-[var(--text-muted)] shrink-0">
            Step {stepIndex + 1} of {tutorial.steps.length}
          </span>
          <button
            onClick={close}
            className="btn-ghost p-1 rounded"
            aria-label="Close tutorial"
          >
            <X size={16} />
          </button>
        </div>
        <p className="px-4 pt-1 text-xs text-[var(--text-muted)]">{tutorial.description}</p>

        <div className="px-4 py-3 space-y-3">
          <h3 className="text-sm font-semibold">{step.title}</h3>
          <p className="text-sm text-[var(--text-primary)] leading-relaxed">{step.prompt}</p>
          {solutionShown ? (
            <div className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
              <p className="text-xs font-semibold text-[var(--text-secondary)] mb-1">Solution</p>
              <p className="text-sm text-[var(--text-primary)] leading-relaxed">{step.solution}</p>
            </div>
          ) : (
            <button
              onClick={() => setSolutionShown(true)}
              className="btn btn-secondary text-xs"
            >
              Show solution
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 px-4 pb-3">
          <button
            onClick={go(previousStep)}
            disabled={first}
            className="btn btn-secondary text-xs flex items-center gap-1 disabled:opacity-40"
          >
            <ChevronLeft size={14} /> Previous
          </button>
          <button
            onClick={go(nextStep)}
            disabled={last}
            className="btn btn-secondary text-xs flex items-center gap-1 disabled:opacity-40"
          >
            Next <ChevronRight size={14} />
          </button>
          <div className="flex-1" />
          <button
            onClick={() => {
              closeTutorial();
            }}
            className="btn-ghost text-xs"
          >
            All tutorials
          </button>
        </div>
      </div>
    </div>
  );
}

export function TutorialPanel() {
  const tutorial = useTutorialStore((s) => s.tutorial);
  if (tutorial) return <TutorialViewer />;
  return <TutorialPicker />;
}
