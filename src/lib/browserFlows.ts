/**
 * Browser flow definitions (Area 7) — pure types, validation, and
 * the supervision-gate rules. A flow is a named list of steps the
 * runner executes in order on one tab:
 *
 *   navigate — open a URL
 *   wait     — wait for a selector to appear
 *   fill     — type into a form field
 *   click    — click an element
 *   verify   — check the page (expected text, or a selector present)
 *
 * Nothing here touches Electron: the runner lives in
 * electron/services/browserFlows.ts, validation runs in main
 * before a flow starts, and the AI tool passes definitions
 * through the same validation.
 *
 * Supervision gates: a step runs only after Gary approves it when
 * it is explicitly flagged (`requiresApproval`), or when it
 * matches the money/irreversible heuristic below (a click on a
 * buy/checkout/pay/submit control, a navigate to a checkout or
 * payment page). The heuristic is a safety net, not a guarantee —
 * the explicit flag is the real gate, and the AI tool can never
 * complete a purchase unobserved because the purchase click is
 * always gated. Approval is per step, in the browser panel.
 */

import { isValidSelector, isValidFillValue } from './browserActions';

/** The kinds of step a flow can contain. */
export type FlowStepKind =
  | 'navigate'
  | 'wait'
  | 'fill'
  | 'click'
  | 'verify';

/** One step of a flow. Only the fields its kind needs are set. */
export interface FlowStep {
  kind: FlowStepKind;
  /** navigate: the URL to open. */
  url?: string;
  /** wait/fill/click/verify: the CSS selector. */
  selector?: string;
  /** fill: the text to type. */
  value?: string;
  /** wait/verify: how long to wait, ms (default 5000, max 30000). */
  timeout?: number;
  /** verify: text the page must contain (case-insensitive). */
  expectedText?: string;
  /** Pause for Gary's approval before this step runs. */
  requiresApproval?: boolean;
}

/** A flow: a name and the steps to run, in order. */
export interface FlowDefinition {
  name: string;
  steps: FlowStep[];
}

/** The terminal and in-progress states a flow can be in. */
export type FlowRunStatus =
  | 'running'
  | 'waiting-approval'
  | 'done'
  | 'failed'
  | 'rejected'
  | 'stopped';

/** A progress event, sent to the panel on every step boundary
 * and every state change. */
export interface FlowProgressEvent {
  flowId: string;
  name: string;
  /** Index of the step about to run (or just finished). */
  stepIndex: number;
  totalSteps: number;
  status: FlowRunStatus;
  /** Human-readable description of the current step, if any. */
  currentStep?: string;
  /** Why a flow failed, if it did. */
  error?: string;
}

/** An approval request: the runner is paused on this step and
 * waits for Gary. */
export interface FlowApprovalRequest {
  flowId: string;
  name: string;
  stepIndex: number;
  totalSteps: number;
  step: FlowStep;
  description: string;
}

/** The step kinds, for validation error messages. */
export const FLOW_STEP_KINDS: readonly FlowStepKind[] = [
  'navigate',
  'wait',
  'fill',
  'click',
  'verify',
];

/** A flow may not have more steps than this. */
export const MAX_FLOW_STEPS = 50;

/** Default wait timeout for wait/verify steps (ms). */
export const FLOW_DEFAULT_TIMEOUT_MS = 5000;

/** The longest a wait/verify step may wait (ms). */
export const FLOW_MAX_TIMEOUT_MS = 30000;

/** A selector that looks like a money or irreversible control:
 * buy, checkout, pay, purchase, place-order, confirm, submit. */
const MONEY_CLICK_PATTERN =
  /buy|checkout|pay|purchase|place[-_ ]?order|confirm|submit/i;

/** A URL that looks like a checkout or payment page. */
const MONEY_URL_PATTERN = /checkout|payment|\/buy|\/pay/i;

/** Does this step need Gary's approval before it runs? True when
 * it is explicitly flagged, or when it matches the
 * money/irreversible heuristic (a click on a buy/checkout/pay/
 * submit control, or a navigate to a checkout/payment page). */
export function stepNeedsApproval(step: FlowStep): boolean {
  if (step.requiresApproval) return true;
  if (step.kind === 'click' && step.selector) {
    return MONEY_CLICK_PATTERN.test(step.selector);
  }
  if (step.kind === 'navigate' && step.url) {
    return MONEY_URL_PATTERN.test(step.url);
  }
  return false;
}

/** One line describing a step, for the progress UI and the
 * approval prompt. Never includes a fill value. */
export function describeStep(step: FlowStep, index: number): string {
  const n = index + 1;
  switch (step.kind) {
    case 'navigate':
      return `${n}. Go to ${step.url ?? '(no URL)'}`;
    case 'wait':
      return `${n}. Wait for ${step.selector ?? '(no selector)'}`;
    case 'fill':
      return `${n}. Fill ${step.selector ?? '(no selector)'}`;
    case 'click':
      return `${n}. Click ${step.selector ?? '(no selector)'}`;
    case 'verify':
      return step.expectedText
        ? `${n}. Check the page contains "${step.expectedText}"`
        : `${n}. Check ${step.selector ?? '(no selector)'} is present`;
  }
}

/** Is this value an http(s) URL? */
function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Validate a flow definition. Returns the list of problems;
 * an empty list means the flow may run. The runner and the AI
 * tool both reject invalid definitions with these messages. */
export function validateFlowDefinition(def: unknown): string[] {
  const errors: string[] = [];
  if (!def || typeof def !== 'object' || Array.isArray(def)) {
    return ['A flow needs a name and a list of steps.'];
  }
  const flow = def as Partial<FlowDefinition>;
  if (typeof flow.name !== 'string' || !flow.name.trim()) {
    errors.push('A flow needs a name.');
  }
  if (!Array.isArray(flow.steps) || flow.steps.length === 0) {
    errors.push('A flow needs at least one step.');
    return errors;
  }
  if (flow.steps.length > MAX_FLOW_STEPS) {
    errors.push(`A flow has at most ${MAX_FLOW_STEPS} steps.`);
  }
  flow.steps.forEach((step, i) => {
    const at = `Step ${i + 1}`;
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      errors.push(`${at}: not a step.`);
      return;
    }
    if (
      typeof step.kind !== 'string' ||
      !(FLOW_STEP_KINDS as readonly string[]).includes(step.kind)
    ) {
      errors.push(
        `${at}: unknown kind "${String(step.kind)}" (expected one of ${FLOW_STEP_KINDS.join(', ')}).`,
      );
      return;
    }
    if (step.requiresApproval !== undefined && typeof step.requiresApproval !== 'boolean') {
      errors.push(`${at}: requiresApproval must be true or false.`);
    }
    if (
      step.timeout !== undefined &&
      (typeof step.timeout !== 'number' ||
        !Number.isFinite(step.timeout) ||
        step.timeout <= 0)
    ) {
      errors.push(`${at}: timeout must be a positive number of ms.`);
    }
    switch (step.kind) {
      case 'navigate':
        if (!isHttpUrl(step.url)) {
          errors.push(`${at}: navigate needs an http(s) URL.`);
        }
        break;
      case 'wait':
        if (!isValidSelector(step.selector ?? '')) {
          errors.push(`${at}: wait needs a valid selector.`);
        }
        break;
      case 'fill':
        if (!isValidSelector(step.selector ?? '')) {
          errors.push(`${at}: fill needs a valid selector.`);
        }
        if (!isValidFillValue(step.value ?? '')) {
          errors.push(`${at}: fill needs a value (at most 10000 characters).`);
        }
        break;
      case 'click':
        if (!isValidSelector(step.selector ?? '')) {
          errors.push(`${at}: click needs a valid selector.`);
        }
        break;
      case 'verify': {
        const hasSelector = isValidSelector(step.selector ?? '');
        const hasText =
          typeof step.expectedText === 'string' && step.expectedText.trim() !== '';
        if (!hasSelector && !hasText) {
          errors.push(
            `${at}: verify needs a selector or text to check for.`,
          );
        }
        break;
      }
    }
  });
  return errors;
}
