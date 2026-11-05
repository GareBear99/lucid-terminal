/**
 * Browser page actions (Area 4) pure tests: the script builders in
 * `src/lib/browserActions.ts` and the parameter validators.
 *
 * The builders must embed parameters with JSON.stringify so quotes,
 * newlines and backslashes in a selector or a fill value cannot
 * break out of the script — a renderer bug must never be able to
 * run arbitrary JS in a page.
 *
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest';
import {
  buildClickScript,
  buildFillScript,
  buildGetStateScript,
  buildPageSummaryPrompt,
  buildReadTextScript,
  buildSearchResultsScript,
  buildSelectorPresentScript,
  clampWaitTimeout,
  formatSearchResults,
  isValidFillValue,
  isValidSelector,
  MAX_ACTION_TEXT_CHARS,
  MAX_FILL_VALUE_LENGTH,
  MAX_PAGE_TEXT_FOR_AI,
  MAX_SEARCH_RESULTS,
  MAX_SELECTOR_LENGTH,
  MAX_WAIT_TIMEOUT_MS,
  DEFAULT_WAIT_TIMEOUT_MS,
} from '../src/lib/browserActions';

describe('validators', () => {
  it('isValidSelector accepts real selectors, rejects empty/oversize/non-strings', () => {
    expect(isValidSelector('#submit')).toBe(true);
    expect(isValidSelector('input[name="email"]')).toBe(true);
    expect(isValidSelector('')).toBe(false);
    expect(isValidSelector('   ')).toBe(false);
    expect(isValidSelector('x'.repeat(MAX_SELECTOR_LENGTH + 1))).toBe(false);
    expect(isValidSelector('x'.repeat(MAX_SELECTOR_LENGTH))).toBe(true);
    expect(isValidSelector(undefined)).toBe(false);
    expect(isValidSelector(42)).toBe(false);
  });

  it('isValidFillValue rejects oversize values', () => {
    expect(isValidFillValue('hello')).toBe(true);
    expect(isValidFillValue('')).toBe(true);
    expect(isValidFillValue('x'.repeat(MAX_FILL_VALUE_LENGTH))).toBe(true);
    expect(isValidFillValue('x'.repeat(MAX_FILL_VALUE_LENGTH + 1))).toBe(false);
    expect(isValidFillValue(undefined)).toBe(false);
  });

  it('clampWaitTimeout defaults, floors and caps', () => {
    expect(clampWaitTimeout(undefined)).toBe(DEFAULT_WAIT_TIMEOUT_MS);
    expect(clampWaitTimeout(NaN)).toBe(DEFAULT_WAIT_TIMEOUT_MS);
    expect(clampWaitTimeout(-5)).toBe(0);
    expect(clampWaitTimeout(2500)).toBe(2500);
    expect(clampWaitTimeout(999999)).toBe(MAX_WAIT_TIMEOUT_MS);
  });
});

describe('buildReadTextScript', () => {
  it('reads title, url and capped body text', () => {
    const script = buildReadTextScript();
    expect(script).toContain('document.title');
    expect(script).toContain('location.href');
    expect(script).toContain('innerText');
    expect(script).toContain(`slice(0, ${MAX_ACTION_TEXT_CHARS})`);
  });
});

describe('buildGetStateScript', () => {
  it('reports forms with fields and labels, never field values', () => {
    const script = buildGetStateScript();
    expect(script).toContain('document.forms');
    expect(script).toContain('autocomplete');
    expect(script).toContain('hasValue');
    expect(script).toContain('label');
    // Values are never returned: only the hasValue boolean.
    expect(script).not.toMatch(/password[^;]*\.value/);
    expect(script).toContain("document.readyState !== 'complete'");
  });
});

describe('buildFillScript', () => {
  it('uses the native setter trick so React forms notice', () => {
    const script = buildFillScript('#email', 'gary@example.com');
    expect(script).toContain('HTMLInputElement.prototype');
    expect(script).toContain("new Event('input'");
    expect(script).toContain("new Event('change'");
  });

  it('refuses password fields in-page', () => {
    const script = buildFillScript('#pw', 'secret');
    expect(script).toContain("el.type === 'password'");
    expect(script).toContain("'password-field'");
  });

  it('reports not-found and not-fillable', () => {
    const script = buildFillScript('#x', 'v');
    expect(script).toContain("'not-found'");
    expect(script).toContain("'not-fillable'");
  });

  it('embeds nasty values safely — quotes, newlines and backslashes cannot break out', () => {
    const nasty = 'a"b\nc\\d\re${x}';
    const script = buildFillScript('input[name="q\\"u"]', nasty);
    // The JSON-escaped forms are present…
    expect(script).toContain(JSON.stringify(nasty));
    expect(script).toContain(JSON.stringify('input[name="q\\"u"]'));
    // …and the raw unescaped value never appears.
    expect(script).not.toContain(nasty);
  });
});

describe('buildClickScript', () => {
  it('scrolls into view and clicks; reports not-found', () => {
    const script = buildClickScript('#submit');
    expect(script).toContain('scrollIntoView');
    expect(script).toContain('.click()');
    expect(script).toContain("'not-found'");
    expect(script).toContain(JSON.stringify('#submit'));
  });

  it('embeds nasty selectors safely', () => {
    const nasty = 'a[href="x\\"y"]';
    const script = buildClickScript(nasty);
    expect(script).toContain(JSON.stringify(nasty));
    expect(script).not.toContain(nasty);
  });
});

describe('buildSelectorPresentScript', () => {
  it('returns whether the selector matches, and never throws on a bad selector', () => {
    const script = buildSelectorPresentScript('#ready');
    expect(script).toContain('document.querySelector');
    expect(script).toContain('try');
    expect(script).toContain('catch');
    expect(script).toContain(JSON.stringify('#ready'));
  });
});

describe('buildSearchResultsScript + formatSearchResults', () => {
  it('reads result links and snippets, capped', () => {
    const script = buildSearchResultsScript();
    expect(script).toContain('a.result__a');
    expect(script).toContain('result__snippet');
    expect(script).toContain(`>= ${MAX_SEARCH_RESULTS}`);
    expect(script).toContain('title');
    expect(script).toContain('url');
  });

  it('formats results numbered with URL and snippet', () => {
    const text = formatSearchResults([
      { title: 'First', url: 'https://first.example/', snippet: 'Snip.' },
      { title: 'Second', url: 'https://second.example/', snippet: '' },
    ]);
    expect(text).toContain('1. First');
    expect(text).toContain('https://first.example/');
    expect(text).toContain('Snip.');
    expect(text).toContain('2. Second');
  });

  it('reports honestly when nothing matched', () => {
    expect(formatSearchResults([])).toBe('No search results found.');
  });
});

describe('buildPageSummaryPrompt', () => {
  it('includes the URL and the page text', () => {
    const prompt = buildPageSummaryPrompt(
      'https://example.com/',
      'Hello world.',
    );
    expect(prompt).toContain('https://example.com/');
    expect(prompt).toContain('Hello world.');
    expect(prompt).toMatch(/summarise/i);
  });

  it('caps long page text for the chat context', () => {
    const prompt = buildPageSummaryPrompt(
      'https://example.com/',
      'x'.repeat(MAX_PAGE_TEXT_FOR_AI + 5000),
    );
    expect(prompt.length).toBeLessThanOrEqual(
      MAX_PAGE_TEXT_FOR_AI + 'https://example.com/'.length + 200,
    );
  });
});
