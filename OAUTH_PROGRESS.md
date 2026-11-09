# Google Drive OAuth — progress log (Gary, 2026-11-08)

Approved next step after the Connect-button start: the loopback redirect
listener, the code-for-token exchange, and secure token storage, wired into
the Google Drive segment. Gary still owes the Desktop-app OAuth client ID —
no client ID / secret / token is invented anywhere; the code takes the client
ID from Settings (`googleDriveClientId`) and fails cleanly without it.

Worktree: `~/workspace/lucid-gdrive-oauth`, detached HEAD 97fc20c (= master HEAD).
Push target: GitHub master (Lucid push authorized). Verify every push with
`git ls-remote` HEAD, never PUSH_RC alone.

Baselines (2026-11-08 ~16:55 PST, before any new code):
- `npx tsc --noEmit -p tsconfig.json` (src): 0 errors.
- `npx tsc --noEmit -p tsconfig.node.json` (electron): 72 pre-existing errors,
  0 in googleDrive/secureStorage files. Goal: still 72 after this work.
- Worktree was clean except a 1-line package-lock.json diff
  (`"hasInstallScript": true`) left by the previous coordinator — reverted
  2026-11-08 ~16:55 PST; tree clean at start.

## Phase 0 — resume (DONE 2026-11-08 ~16:55 PST)
- Reverted the package-lock.json diff. Tree clean.
- Read: `src/lib/googleDriveAuth.ts` (PKCE + auth URL, already done),
  `src/components/Modules/GoogleDriveSegment.tsx` (Connect button, no token
  storage yet), `electron/services/secureStorage.ts` (secureStorage /
  apiKeyStorage / pingKeyStorage / telegramBotTokenStorage /
  stripeApiKeyStorage pattern), `electron/main.ts` (IPC handler registration),
  `electron/preload.ts` + `src/types/index.ts` (LucidAPI surface),
  `tests/googleDriveAuth.test.ts` (existing renderer tests).

## Phase 1 — main-process OAuth service (DONE 2026-11-08 ~17:02 PST)
- New: `electron/services/googleDriveOAuth.ts` (386 lines) — loopback listener
  (http://127.0.0.1:8765, 10-min timeout, favicon probes ignored, bind
  failure reported), redirect parsing, code-for-token exchange (PKCE, no
  secret), refresh (keeps old refresh token when Google omits a new one),
  authenticated Drive API GET.
- Tests: `tests/googleDriveOAuth.test.ts` — **20 passed, 0 failed**
  (`npx vitest run tests/googleDriveOAuth.test.ts`, 509ms). Listener binds
  on 127.0.0.1 and captures code/state with a real fetch; exchange posts
  the verifier and parses a token response (mock fetch); refresh + API
  GET + error mapping covered.

## Phase 2 — secure token storage (DONE 2026-11-08 ~17:07 PST)
- Added `googleDriveTokenStorage` to `electron/services/secureStorage.ts`
  (same pattern as stripeApiKeyStorage): tokens JSON encrypted via
  `secureStorage.setSecret('google-drive-tokens', …)`; get validates the
  shape and returns null on corrupt data instead of crashing.
- Tests: `tests/googleDriveTokenStorage.test.ts` — **5 passed, 0 failed**.
  Round-trip, tokens never in plain Settings, delete clears, corrupt
  value reads as null, refresh-token-null round-trips. (Mock electron +
  electron-store, same pattern as `tests/browserActionsMain.test.ts`.)

## Phase 3 — IPC + preload + types (TODO)
- New: `electron/ipc/googleDrive.ts` — `google-drive:startListener`,
  `google-drive:stopListener`, `google-drive:exchangeCode`,
  `google-drive:hasTokens`, `google-drive:disconnect`,
  `google-drive:verifyConnection`; sends `google-drive:auth-redirect`
  to the renderer that started the listener.
- Register in `electron/main.ts`; expose in `electron/preload.ts`
  (`window.lucidAPI.googleDrive`); add types in `electron/preload.ts`
  LucidAPI interface + `src/types/index.ts`.

## Phase 4 — renderer wiring (TODO)
- Extend `src/lib/googleDriveAuth.ts` (redirect-result type shared with
  main; keep the "what it does NOT do yet" header honest).
- `src/components/Modules/GoogleDriveSegment.tsx`: Connect → start listener
  → open auth URL → wait for redirect event → verify state against the
  saved PKCE attempt → exchange → verify with a real Drive call →
  Connected; Disconnect button when connected; plain-language failure
  notes (no client ID / listener failed / denied / exchange failed).
- Extend `tests/googleDriveAuth.test.ts` for the new renderer pieces.

## Phase 5 — verify + push (TODO)
- `npx tsc --noEmit -p tsconfig.json` → 0 errors.
- `npx tsc --noEmit -p tsconfig.node.json` → still 72 errors, 0 new.
- `npx vitest run tests/googleDriveOAuth.test.ts tests/googleDriveAuth.test.ts`
  → record exact pass/fail counts.
- Commit incrementally per phase; push to master; verify with
  `git ls-remote` HEAD showing the commit.

## Still missing (blocked on Gary, NOT this task)
- The Desktop-app OAuth client ID from Gary (stored in Settings as
  `googleDriveClientId`). Without it Connect says plainly what is missing.
- End-to-end live sign-in (needs the real client ID + Gary signing in).
- Drive file operations (find/upload/download/organise/share) — the
  connection is this task; the file work is next.

## Resume point
- If stopped mid-phase, the phase header above says what is done and what
  is next; each phase is committed separately, so resume at the first
  TODO phase. Never redo setup: node_modules is installed, worktree is
  at 97fc20c, no fresh clone, no npm install unless a dependency is
  actually missing.
