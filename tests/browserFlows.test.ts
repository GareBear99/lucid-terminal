/**
 * Browser flows (Area 7) pure tests: definition validation, the
 * supervision-gate rules, and step descriptions in
 * `src/lib/browserFlows.ts`.
 *
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest';
import {
  describeStep,
  stepNeedsApproval,
  validateFlowDefinition,
  type FlowDefinition,
  type FlowStep,
} from '../src/lib/browserFlows';

const validFlow = (steps: FlowStep[] = []): FlowDefinition => ({
  name: 'Test flow',
  steps,
});

describe('validateFlowDefinition', () => {
  it('accepts a valid flow of every kind', () => {
    expect(
      validateFlowDefinition(
        validFlow([
          { kind: 'navigate', url: 'https://example.com/' },
          { kind: 'wait', selector: '#ready' },
          { kind: 'fill', selector: '#q', value: 'hello' },
          { kind: 'click', selector: '#go' },
          { kind: 'verify', expectedText: 'Results' },
          { kind: 'verify', selector: '#results' },
        ]),
      ),
    ).toEqual([]);
  });

  it('rejects a missing name, missing steps, and non-objects', () => {
    expect(validateFlowDefinition(null)).toEqual([
      'A flow needs a name and a list of steps.',
    ]);
    expect(validateFlowDefinition('nope')).toEqual([
      'A flow needs a name and a list of steps.',
    ]);
    expect(validateFlowDefinition(validFlow([]))).toEqual([
      'A flow needs at least one step.',
    ]);
    expect(
      validateFlowDefinition({ name: '', steps: [{ kind: 'click', selector: '#x' }] }),
    ).toEqual(['A flow needs a name.']);
  });

  it('rejects unknown step kinds and non-step entries', () => {
    expect(
      validateFlowDefinition(
        validFlow([{ kind: 'explode' } as unknown as FlowStep]),
      ),
    ).toEqual([
      'Step 1: unknown kind "explode" (expected one of navigate, wait, fill, click, verify).',
    ]);
    expect(validateFlowDefinition(validFlow([null as unknown as FlowStep]))).toEqual([
      'Step 1: not a step.',
    ]);
  });

  it('rejects a navigate without an http(s) URL', () => {
    expect(
      validateFlowDefinition(validFlow([{ kind: 'navigate', url: 'file:///etc/passwd' }])),
    ).toEqual(['Step 1: navigate needs an http(s) URL.']);
    expect(
      validateFlowDefinition(validFlow([{ kind: 'navigate' }])),
    ).toEqual(['Step 1: navigate needs an http(s) URL.']);
  });

  it('rejects bad selectors, an over-long fill value, and bad timeouts', () => {
    expect(
      validateFlowDefinition(validFlow([{ kind: 'wait', selector: '' }])),
    ).toEqual(['Step 1: wait needs a valid selector.']);
    expect(
      validateFlowDefinition(validFlow([{ kind: 'fill', selector: '#q', value: 'x'.repeat(10001) }])),
    ).toEqual(['Step 1: fill needs a value (at most 10000 characters).']);
    expect(
      validateFlowDefinition(
        validFlow([{ kind: 'wait', selector: '#x', timeout: -1 }]),
      ),
    ).toEqual(['Step 1: timeout must be a positive number of ms.']);
    expect(
      validateFlowDefinition(
        validFlow([{ kind: 'click', selector: '#x', requiresApproval: 'yes' as unknown as boolean }]),
      ),
    ).toEqual(['Step 1: requiresApproval must be true or false.']);
  });

  it('rejects a verify with neither selector nor text', () => {
    expect(validateFlowDefinition(validFlow([{ kind: 'verify' }]))).toEqual([
      'Step 1: verify needs a selector or text to check for.',
    ]);
  });

  it('rejects more than 50 steps', () => {
    const steps: FlowStep[] = Array.from({ length: 51 }, () => ({
      kind: 'click' as const,
      selector: '#x',
    }));
    expect(validateFlowDefinition(validFlow(steps))).toEqual([
      'A flow has at most 50 steps.',
    ]);
  });

  it('collects several problems at once', () => {
    expect(
      validateFlowDefinition(
        validFlow([
          { kind: 'navigate', url: 'notaurl' },
          { kind: 'click', selector: '' },
        ]),
      ),
    ).toEqual([
      'Step 1: navigate needs an http(s) URL.',
      'Step 2: click needs a valid selector.',
    ]);
  });
});

describe('stepNeedsApproval', () => {
  it('an explicitly flagged step always needs approval', () => {
    expect(
      stepNeedsApproval({ kind: 'click', selector: '#next' }),
    ).toBe(false);
    expect(
      stepNeedsApproval({
        kind: 'click',
        selector: '#next',
        requiresApproval: true,
      }),
    ).toBe(true);
  });

  it('a click on a money/irreversible control needs approval', () => {
    for (const selector of [
      '#buy-now',
      '.checkout-button',
      'button.pay',
      '#place-order',
      '#confirm-purchase',
      'input[type=submit]',
    ]) {
      expect(stepNeedsApproval({ kind: 'click', selector })).toBe(true);
    }
    expect(stepNeedsApproval({ kind: 'click', selector: '#next-page' })).toBe(
      false,
    );
  });

  it('a navigate to a checkout/payment page needs approval', () => {
    expect(
      stepNeedsApproval({
        kind: 'navigate',
        url: 'https://shop.example/checkout',
      }),
    ).toBe(true);
    expect(
      stepNeedsApproval({
        kind: 'navigate',
        url: 'https://shop.example/payment',
      }),
    ).toBe(true);
    expect(
      stepNeedsApproval({ kind: 'navigate', url: 'https://example.com/' }),
    ).toBe(false);
  });

  it('wait, fill and verify steps are not auto-gated', () => {
    expect(stepNeedsApproval({ kind: 'wait', selector: '#buy' })).toBe(false);
    expect(
      stepNeedsApproval({ kind: 'fill', selector: '#card', value: '1' }),
    ).toBe(false);
    expect(stepNeedsApproval({ kind: 'verify', expectedText: 'buy' })).toBe(
      false,
    );
  });
});

describe('describeStep', () => {
  it('describes every kind without leaking a fill value', () => {
    expect(describeStep({ kind: 'navigate', url: 'https://x/' }, 0)).toBe(
      '1. Go to https://x/',
    );
    expect(describeStep({ kind: 'wait', selector: '#r' }, 1)).toBe(
      '2. Wait for #r',
    );
    expect(describeStep({ kind: 'fill', selector: '#q', value: 'secret' }, 2)).toBe(
      '3. Fill #q',
    );
    expect(describeStep({ kind: 'click', selector: '#go' }, 3)).toBe(
      '4. Click #go',
    );
    expect(describeStep({ kind: 'verify', expectedText: 'Done' }, 4)).toBe(
      '5. Check the page contains "Done"',
    );
    expect(describeStep({ kind: 'verify', selector: '#ok' }, 5)).toBe(
      '6. Check #ok is present',
    );
  });
});
