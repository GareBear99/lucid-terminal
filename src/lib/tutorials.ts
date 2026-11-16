/**
 * Tutorials.
 *
 * Atom's tutorial feature is a `tutorials/` directory of
 * files, each exposing a JSON structure with a title, a
 * description and a `steps` array; `tutorial` opens one and
 * `tutorial.next()` advances a step. Kite's tutorial is a
 * sequence of Python files the user completes, each step
 * revealing its solution.
 *
 * Lucid's shape: the same JSON structure, but the steps are
 * Lucid's own features — Kite's Python completions tutorial
 * would be meaningless here (Lucid's engine is TypeScript,
 * not Python). A step is a title, a prompt (what to try)
 * and a solution (the answer, revealed by the viewer —
 * Kite's reveal-the-solution shape). Built-ins ship in the
 * bundle; a user-authored tutorial JSON can be loaded from
 * a file (the picker's "Load a tutorial file…" row), parsed
 * by the same strict validator.
 *
 * Pure data + validation — no store, no DOM.
 */
export interface TutorialStep {
  /** The step's short title. */
  title: string;
  /** What to try — the instruction, shown up front. */
  prompt: string;
  /** The answer, revealed by "Show solution". */
  solution: string;
}

export interface Tutorial {
  /** Stable id (used by the store + the picker). */
  id: string;
  title: string;
  description: string;
  steps: TutorialStep[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Strict shape check: anything malformed parses as null, never a half-tutorial. */
export function parseTutorial(value: unknown): Tutorial | null {
  if (!isRecord(value)) return null;
  if (!isNonEmptyString(value.id)) return null;
  if (!isNonEmptyString(value.title)) return null;
  if (!isNonEmptyString(value.description)) return null;
  if (!Array.isArray(value.steps) || value.steps.length === 0) return null;
  const steps: TutorialStep[] = [];
  for (const raw of value.steps) {
    if (!isRecord(raw)) return null;
    if (!isNonEmptyString(raw.title)) return null;
    if (!isNonEmptyString(raw.prompt)) return null;
    if (!isNonEmptyString(raw.solution)) return null;
    steps.push({ title: raw.title, prompt: raw.prompt, solution: raw.solution });
  }
  return { id: value.id, title: value.title, description: value.description, steps };
}

export const BUILTIN_TUTORIALS: Tutorial[] = [
  {
    id: 'editor-essentials',
    title: 'Editor essentials',
    description:
      'The five keystrokes the editor runs on: palette, Quick Open, symbols, project search, and the terminal split.',
    steps: [
      {
        title: 'Open the command palette',
        prompt: 'Open the command palette and find the "Go to Symbol" command in it.',
        solution:
          'Press Cmd Shift P anywhere in Lucid. Type "symbol" — the palette filters to "Go to Symbol in File…". Every command in Lucid lives here.',
      },
      {
        title: 'Open a file with Quick Open',
        prompt: 'Open any file by name, without touching the Explorer.',
        solution:
          'Press Cmd P, type the first letters of the file name, and press Enter. The finder searches the project (the file list is indexed from the project root) and the last-opened file is listed first.',
      },
      {
        title: 'Jump to a symbol',
        prompt: 'With a TypeScript file open, jump straight to one of its functions.',
        solution:
          'Press Cmd R. The list is the file\'s outline (functions, classes, methods). Arrow down to preview each symbol in place — the cursor follows as you move — and Enter lands on it.',
      },
      {
        title: 'Find in project',
        prompt: 'Find every use of a word across the whole project, then jump to one.',
        solution:
          'Press Cmd Shift F in the editor. Type the word, press Enter — the results are grouped by file. Click a match to open it at that line. Replace All is in the same panel.',
      },
      {
        title: 'Split the terminal',
        prompt: 'Split the terminal into two panes side by side.',
        solution:
          'Press Cmd D (or the split button in the tab strip). Each pane is its own tab and shell — the split group is the unison part. Cmd Shift D splits horizontally, stacking below.',
      },
    ],
  },
  {
    id: 'ghost-completions',
    title: 'Ghost completions',
    description:
      'How Lucid finishes what you are typing: the merged completion list, pattern ghosts, and signature help.',
    steps: [
      {
        title: 'Trigger a completion',
        prompt: 'In a TypeScript file, start typing the name of something already in the file.',
        solution:
          'Type at least two characters. The completion list merges every source into one list — the language server first, then snippets, patterns, structure, and words — with each item badged by its source.',
      },
      {
        title: 'Accept a completion',
        prompt: 'Accept a completion from the list.',
        solution:
          'Arrow to the item you want and press Tab or Enter. Snippet items expand in place — the placeholders become tab stops you jump through with Tab.',
      },
      {
        title: 'Pattern ghosts',
        prompt: 'Type a line that looks like one you have already written in this file.',
        solution:
          'The pattern index learns the file\'s own shapes. A completion that matches a pattern you have used before appears at the bottom of the list (badged "Pattern") — the same shape, offered again.',
      },
      {
        title: 'Signature help',
        prompt: 'See a function\'s parameters while you call it.',
        solution:
          'Type ( after a function name. The signature popup shows the parameters and highlights the one you are filling in; a comma moves to the next. It comes from the same language server as the completions.',
      },
    ],
  },
];

export function findBuiltinTutorial(id: string): Tutorial | undefined {
  return BUILTIN_TUTORIALS.find((t) => t.id === id);
}
