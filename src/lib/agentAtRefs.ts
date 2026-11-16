/**
 * @-references — the agent's explicit context pins
 *
 * Type `@` in the agent input and attach files, folders,
 * code symbols, docs, web pages or git history. Use `@`
 * when you know which files matter; skip it when you do
 * not — the agent's own search finds relevant files.
 * `.cursorignore` applies to @-mentions too: ignored
 * files cannot be attached.
 *
 * Lucid's shape of that, local and deterministic: the
 * prompt's `@...` tokens are parsed, resolved against
 * the workspace index, and handed to the planner as
 * scope — never guessed, never fetched. `@docs`, `@web`
 * and `@git` are honestly unsupported: the local agent
 * has no network and no docs index, so they resolve to
 * `unsupported` with the reason, and the planner says so
 * instead of planning a file op around them. A `@file`
 * the index cannot resolve is `unresolved`, and the
 * planner names it + close matches instead of guessing
 * a path (the same rule as the file-candidate resolver).
 *
 * Pure except for the index reads in resolve — no host
 * I/O, no stores, no network.
 */

import type { AgentFileIndex } from './agentIndex';
import { resolveAgentPath } from './agentHost';

export type AtRefKind = 'file' | 'folder' | 'symbol' | 'codebase' | 'docs' | 'web' | 'git';

export interface ParsedAtRef {
  /** The token as typed, without the `@`. */
  raw: string;
  kind: AtRefKind;
  /** The target: a path, a symbol name, or the keyword. */
  target: string;
}

export interface ResolvedAtRef extends ParsedAtRef {
  status: 'resolved' | 'unresolved' | 'unsupported';
  /** Resolved paths (files under a folder; definitions
   *  of a symbol; the one file). Undefined when the ref
   *  did not resolve — never a guessed path. */
  paths?: string[];
  /** Why it did not resolve (unresolved / unsupported). */
  reason?: string;
}

/** `@token` — the `@` must start a token (start of the
 *  prompt or after whitespace), so `user@example.com`
 *  is never a reference. */
const AT_REF_RE = /(?:^|\s)@([A-Za-z0-9_][A-Za-z0-9_.\-/]*)/g;

/** Trailing punctuation that ends a sentence, not a path. */
const TRAILING_PUNCT = /[.,;:!?]+$/;

function classify(token: string): AtRefKind {
  const lower = token.toLowerCase();
  if (lower === 'codebase') return 'codebase';
  if (lower === 'docs') return 'docs';
  if (lower === 'web') return 'web';
  if (lower === 'git') return 'git';
  if (token.endsWith('/')) return 'folder';
  if (token.includes('/') || token.includes('.')) return 'file';
  return 'symbol';
}

/** Parse every @-reference in the prompt, in order. */
export function parseAtReferences(prompt: string): ParsedAtRef[] {
  const refs: ParsedAtRef[] = [];
  AT_REF_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = AT_REF_RE.exec(prompt)) !== null) {
    const token = match[1].replace(TRAILING_PUNCT, '');
    if (!token) continue;
    refs.push({ raw: token, kind: classify(token), target: token });
  }
  return refs;
}

/** The prompt with every parsed @-reference removed
 *  (the planner parses the instruction, not the pins). */
export function stripAtReferences(prompt: string, refs: ParsedAtRef[]): string {
  let out = prompt;
  for (const ref of refs) {
    out = out.replace(`@${ref.raw}`, ' ');
  }
  return out.replace(/\s+/g, ' ').trim();
}

export interface AtRefResolveContext {
  index: AgentFileIndex;
  workspaceRoot: string;
  cwd: string;
}

function resolveFileTarget(
  target: string,
  ctx: AtRefResolveContext,
): { paths: string[] } | { reason: string } {
  const candidates = [
    resolveAgentPath(target, ctx.cwd, ctx.workspaceRoot),
    resolveAgentPath(target, undefined, ctx.workspaceRoot),
  ];
  for (const path of candidates) {
    if (ctx.index.getKnownPaths().includes(path)) {
      if (ctx.index.isIgnoredByRules(path)) {
        return { reason: `"${target}" is ignored by .cursorignore / .gitignore and cannot be attached.` };
      }
      return { paths: [path] };
    }
  }
  const basename = target.split('/').pop() ?? target;
  const globbed = ctx.index.glob(`**/${basename}`);
  const first = globbed.find((p) => !ctx.index.isIgnoredByRules(p));
  if (first) return { paths: [first] };
  if (globbed.length > 0) {
    return { reason: `"${target}" is ignored by .cursorignore / .gitignore and cannot be attached.` };
  }
  return { reason: `I couldn’t find "${target}" in this workspace.` };
}

function resolveFolderTarget(
  target: string,
  ctx: AtRefResolveContext,
): { paths: string[] } | { reason: string } {
  const dir = resolveAgentPath(target.replace(/\/+$/, ''), ctx.cwd, ctx.workspaceRoot);
  const prefix = `${dir.replace(/\/$/, '')}/`;
  const under = ctx.index
    .getKnownPaths()
    .filter((p) => p.startsWith(prefix) && !ctx.index.isIgnoredByRules(p));
  if (under.length > 0) return { paths: under };
  return { reason: `I couldn’t find a folder "${target}" in this workspace.` };
}

/** Resolve parsed references against the index. A ref
 *  that cannot be resolved is reported, never guessed. */
export function resolveAtReferences(
  refs: ParsedAtRef[],
  ctx: AtRefResolveContext,
): ResolvedAtRef[] {
  return refs.map((ref): ResolvedAtRef => {
    switch (ref.kind) {
      case 'codebase':
        // The whole indexed codebase — no target to resolve.
        return { ...ref, status: 'resolved', paths: [] };
      case 'docs':
        return {
          ...ref,
          status: 'unsupported',
          reason:
            '@docs needs an indexed documentation source — the local agent has no docs index and no network, so it cannot attach documentation.',
        };
      case 'web':
        return {
          ...ref,
          status: 'unsupported',
          reason:
            '@web needs the network — the local agent never fetches the web, so it cannot attach a page.',
        };
      case 'git':
        return {
          ...ref,
          status: 'unsupported',
          reason:
            '@git needs git history context — the local agent has no git-history source, so it cannot attach commits or diffs.',
        };
      case 'file': {
        const resolved = resolveFileTarget(ref.target, ctx);
        return 'paths' in resolved
          ? { ...ref, status: 'resolved', paths: resolved.paths }
          : { ...ref, status: 'unresolved', reason: resolved.reason };
      }
      case 'folder': {
        const resolved = resolveFolderTarget(ref.target, ctx);
        return 'paths' in resolved
          ? { ...ref, status: 'resolved', paths: resolved.paths }
          : { ...ref, status: 'unresolved', reason: resolved.reason };
      }
      case 'symbol': {
        const hits = ctx.index.findSymbol(ref.target);
        if (hits.length === 0) {
          return { ...ref, status: 'unresolved', reason: `No symbol named "${ref.target}" in the workspace.` };
        }
        return {
          ...ref,
          status: 'resolved',
          paths: [...new Set(hits.map((h) => h.path))],
        };
      }
    }
  });
}
