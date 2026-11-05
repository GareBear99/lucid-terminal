# Known Issues

> Rewritten 2026-11-05. The 2026-02-28 version described a pre-llamafile
> world and is superseded — see "Resolved" below. This file now lists only
> items verified open as of the rewrite date. If the open list is empty,
> that is accurate, not an omission: report new issues on GitHub (see below).

## Open issues

None currently tracked in this file.

## Resolved (kept for the record)

### LLM Integration Architecture Mismatch (ex-Issue #1, 2026-02-28) — RESOLVED

The old entry said the app assumed Ollama, AI features were non-functional,
and `electron/core/llm/ollamaClient.ts` needed deletion, with an 8–12 h fix.
That world is gone: the llamafile migration is done, `electron/core/llm/`
now holds `llamafileManager.ts`, `modelBackend.ts`, `bypassRouter.ts`,
`modelFiles.ts` and `modelEnabledState.ts`, and `ollamaClient.ts` does not
exist. Ollama survives only as one optional provider in `modelBackend.ts`
(alongside LM Studio, OpenAI, Anthropic, llamafile, local) — not as the
assumed architecture.

### TypeScript Type Warnings (2026-02-28) — RESOLVED

The old entry said `npm run typecheck` showed errors about missing IPC
interface properties (`daemonLogs`, `fixnetSync`, `getStorageInfo`).
`npx tsc --noEmit` is clean (0 errors) as of 2026-11-05. If type errors
reappear, file them as a new issue rather than reviving this entry.

## Roadmap notes (carried over UNVERIFIED from 2026-02-28)

These were listed as planned enhancements in the old version. None has been
verified as still planned or still wanted — they are kept here so the ideas
are not lost, not as committed work:

- Phase 3: FixNet Search UI — quality grades in search results, consensus scores, ranked candidates
- Phase 4: Execution Steps UI — real-time step progress, collapsible details, error states with retry
- Phase 5: Streaming Token Display — token-by-token streaming for Tier 2+, progress indicators, stall detection
- Phase 6: Quality Metrics Dashboard — fix quality distribution charts, success-rate analytics

---

## 🐛 Reporting Issues

Found a bug? Please report it:

1. **Check existing issues**: https://github.com/GareBear99/lucid-terminal/issues
2. **Create new issue** with:
   - Clear description
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable
   - System info (OS, Node.js version)

**Security issues**: Please report privately via GitHub Security Advisories

---

**Last Updated**: 2026-11-05
**Document Version**: 2.0.0 (rewritten; v1.0.0 was 2026-02-28)
