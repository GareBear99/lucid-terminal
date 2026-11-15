/**
 * Whitespace-on-save, wrap-guide rulers, and bracket config
 * (Atom steal #20 — settings smalls, 2026-11-14).
 */
import { describe, it, expect } from 'vitest';
import {
  trimTrailingWhitespace,
  ensureSingleTrailingNewline,
  applyWhitespaceOnSave,
  parseRulers,
  editorOptionsForSettings,
} from '../src/lib/whitespace';

describe('trimTrailingWhitespace', () => {
  it('strips trailing spaces and tabs from every line', () => {
    expect(trimTrailingWhitespace('foo  \nbar\t\nbaz\n', 'a.ts')).toBe('foo\nbar\nbaz\n');
    expect(trimTrailingWhitespace('no trailing', 'a.ts')).toBe('no trailing');
  });

  it('preserves Markdown hard breaks (2+ trailing spaces)', () => {
    expect(trimTrailingWhitespace('line one  \nline two \n', 'notes.md')).toBe(
      'line one  \nline two\n',
    );
    expect(trimTrailingWhitespace('a  \n', 'README.MARKDOWN')).toBe('a  \n');
  });

  it('leaves CRLF content untouched (the EOL tile owns line endings)', () => {
    expect(trimTrailingWhitespace('foo  \r\nbar\t\r\n', 'a.ts')).toBe('foo  \r\nbar\t\r\n');
  });
});

describe('ensureSingleTrailingNewline', () => {
  it('adds one newline, collapses many, leaves empty alone', () => {
    expect(ensureSingleTrailingNewline('foo')).toBe('foo\n');
    expect(ensureSingleTrailingNewline('foo\n\n\n')).toBe('foo\n');
    expect(ensureSingleTrailingNewline('foo\n')).toBe('foo\n');
    expect(ensureSingleTrailingNewline('')).toBe('');
  });
});

describe('applyWhitespaceOnSave', () => {
  it('applies the enabled transforms in order, and nothing when both are off', () => {
    const content = 'foo  \nbar';
    expect(applyWhitespaceOnSave(content, 'a.ts', { trimTrailingWhitespace: true, ensureTrailingNewline: true })).toBe(
      'foo\nbar\n',
    );
    expect(applyWhitespaceOnSave(content, 'a.ts', { trimTrailingWhitespace: false, ensureTrailingNewline: false })).toBe(
      content,
    );
    expect(applyWhitespaceOnSave(content, 'a.ts', { trimTrailingWhitespace: true, ensureTrailingNewline: false })).toBe(
      'foo\nbar',
    );
  });
});

describe('parseRulers', () => {
  it('parses comma/space lists, sorted and unique, 1..1000 only', () => {
    expect(parseRulers('80, 120')).toEqual([80, 120]);
    expect(parseRulers('120 80 80 0 1001 abc')).toEqual([80, 120]);
    expect(parseRulers('')).toEqual([]);
    expect(parseRulers('1000')).toEqual([1000]);
  });
});

describe('editorOptionsForSettings', () => {
  it('maps the toggles onto Monaco options, defaulting on', () => {
    expect(editorOptionsForSettings({})).toEqual({
      autoClosingBrackets: 'always',
      autoSurround: 'languageDefined',
      matchBrackets: 'always',
      rulers: [],
    });
    expect(
      editorOptionsForSettings({
        editorAutoClosingBrackets: false,
        editorAutoSurround: false,
        editorMatchBrackets: false,
        editorRulers: [80, 120],
      }),
    ).toEqual({
      autoClosingBrackets: 'never',
      autoSurround: 'never',
      matchBrackets: 'never',
      rulers: [80, 120],
    });
  });
});
