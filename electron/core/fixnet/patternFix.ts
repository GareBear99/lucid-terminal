/**
 * patternFix — the fast path for `fix`, ported from the Python
 * FixNet `_generate_fix()` (LUCID-BACKEND/core/enhanced_agent.py).
 *
 * The terminal (TS) owns `fix` (Gary, 2026-11-04). The Python
 * pattern-only fix is not a parallel system — it lives on here, as
 * the fast path the TS side tries before asking a model. No LLM is
 * ever consulted by this module, and it returns null for anything it
 * cannot fix deterministically rather than inventing a fix.
 *
 * Patterns (identical to the Python original):
 *   - `ModuleNotFoundError: No module named 'X'` → `import X`
 *     (plain import, never `from X import *`: the star-import fails
 *     identically when the module is not installed, and is wrong even
 *     when it is)
 *   - `name 'X' is not defined` with X a known name → the import for
 *     that name (os, sys, json, Path, datetime, time). Unknown name →
 *     null (the old Python code returned a `# TODO` comment, which is
 *     not a fix, so this never offers one).
 *
 * Also the V2 name-based validation (FIX_VALIDATION_V2.md): a fix for
 * `name 'X' is not defined` MUST import or define exactly X —
 * importing anything else is INVALID.
 */

/** Known names and the import line that defines them. */
export const COMMON_IMPORTS: Record<string, string> = {
  os: 'import os',
  sys: 'import sys',
  json: 'import json',
  Path: 'from pathlib import Path',
  datetime: 'from datetime import datetime',
  time: 'import time',
  requests: 'import requests',
  numpy: 'import numpy',
  pandas: 'import pandas',
  webbrowser: 'import webbrowser',
  BeautifulSoup: 'from bs4 import BeautifulSoup',
  bs: 'from bs4 import BeautifulSoup',
};

/**
 * Deterministic pattern fix for an error string, or null when no
 * pattern matches. The returned string is a single import line.
 */
export function patternFixForError(error: string): string | null {
  if (!error || !error.trim()) return null;

  // ModuleNotFoundError: No module named 'X' → import X
  const moduleMatch = error.match(
    /No module named ['"]([^'"]+)['"]/
  );
  if (
    (/ModuleNotFoundError/i.test(error) ||
      /No module named/i.test(error)) &&
    moduleMatch
  ) {
    const moduleName = moduleMatch[1].split('.')[0];
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(moduleName)) {
      return `import ${moduleName}`;
    }
    return null;
  }

  // name 'X' is not defined → the import for X, when X is known
  const nameMatch = error.match(
    /name ['"]([^'"]+)['"] is not defined/
  );
  if (/NameError/i.test(error) && nameMatch) {
    const varName = nameMatch[1];
    return COMMON_IMPORTS[varName] ?? null;
  }

  return null;
}

/**
 * Extract the missing name from a `name 'X' is not defined` error,
 * or null when the error is not of that form.
 */
export function missingNameFromError(error: string): string | null {
  const match = error.match(/name ['"]([^'"]+)['"] is not defined/);
  return match ? match[1] : null;
}

/**
 * V2 name-based validation: a fix for `name 'X' is not defined` is
 * VALID only when it imports or defines exactly X. Any other error
 * form is not covered by this rule and returns true (the rule does
 * not apply).
 */
export function validateFixForError(error: string, solution: string): boolean {
  const missing = missingNameFromError(error);
  if (!missing) return true;
  if (!solution || !solution.trim()) return false;
  // The solution must import or define exactly the missing name:
  // `import X`, `from ... import X`, `X = ...`, `def X`, `class X`.
  const pattern = new RegExp(
    `(^|\\n)\\s*(import\\s+${escapeRegExp(missing)}\\b` +
      `|from\\s+[\\w.]+\\s+import\\s+[^\\n]*\\b${escapeRegExp(missing)}\\b` +
      `|${escapeRegExp(missing)}\\s*=` +
      `|def\\s+${escapeRegExp(missing)}\\b` +
      `|class\\s+${escapeRegExp(missing)}\\b)`
  );
  return pattern.test(solution);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
