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

## Phase 3 — IPC + preload + types (DONE 2026-11-08 ~17:20 PST)
- New: `electron/ipc/googleDrive.ts` — `google-drive:startListener`,
  `google-drive:stopListener`, `google-drive:exchangeCode`,
  `google-drive:hasTokens`, `google-drive:disconnect`,
  `google-drive:verifyConnection`; sends `google-drive:auth-redirect`
  to the renderer that started the listener.
- Registered in `electron/main.ts`; exposed in `electron/preload.ts`
  (`window.lucidAPI.googleDrive`); types in the preload LucidAPI
  interface + `src/types/index.ts`. The redirect/IPC result types
  are also in `src/lib/googleDriveAuth.ts` (renderer side).
- Gotcha fixed in this phase: the electron project must not import
  from src/ (TS6307) — importing googleDriveAuth.ts from preload
  or src/types pulled it into tsconfig.node.json (+1 TS6307, +2
  TS2802 for its Uint8Array spread under the node's ES5 target).
  Fix: the three copies of the types (src/lib, src/types,
  electron/preload) are defined locally and kept identical by hand.
  Also fixed a real TS2322 in the IPC file: getUsableAccessToken's
  error union was missing 'empty' (refresh can return it).
- Verified at commit: src tsc 0 errors, node tsc 72 (baseline),
  0 googleDrive errors; existing tests 25 passed (20 OAuth + 5
  storage). Commit: **406f271**.

## Phase 4 — renderer wiring (DONE 2026-11-08 ~17:28 PST)
- `src/lib/googleDriveAuth.ts`: shared `GoogleDriveAuthRedirect` /
  `GoogleDriveIpcResult` types; `checkGoogleDriveRedirect` (state
  must match the saved PKCE attempt before any exchange — a
  mismatch is never exchanged); `googleDriveFailureNote` (plain-
  language note for every error the flow can produce); header
  rewritten — the "does NOT do yet" now honestly says only Drive
  file operations + the live sign-in (needs Gary's client ID).
- `src/components/Modules/GoogleDriveSegment.tsx`: Connect →
  start listener → open auth URL → wait for redirect → verify
  state → exchange → verify with a real Drive call → Connected;
  Disconnect button when connected (deletes stored tokens);
  connected state read from main via hasTokens on mount; plain-
  language failure notes; Connect disabled while a sign-in is in
  flight; listener stopped if the sign-in page never opens.
- Tests: `tests/googleDriveAuth.test.ts` extended — **14 passed,
  0 failed** (was 7; +4 redirect check, +3 failure notes).
  Commit: **7e992fa**.

## Phase 5 — verify + push (VERIFY DONE, PUSH BLOCKED 2026-11-08 ~17:31 PST)
- `npx tsc --noEmit -p tsconfig.json` → **0 errors**.
- `npx tsc --noEmit -p tsconfig.node.json` → **72 errors
  (baseline), 0 in googleDrive files, 0 new**.
- `npx vitest run tests/googleDriveOAuth.test.ts
  tests/googleDriveAuth.test.ts tests/googleDriveTokenStorage.test.ts`
  → **39 passed, 0 failed** (20 OAuth + 14 renderer + 5 storage).
- **PUSH DID NOT LAND — blocked, not failed code:** this VM has
  no GitHub credentials (no credential helper, `gh` not logged
  in) and SSH is reset by the proxy, so `git push origin
  HEAD:master` fails with `fatal: could not read Username for
  'https://github.com'`. `git ls-remote` HEAD still shows
  97fc20c23526a0f35d05e233ab19ee6a0b61357a. NOTHING is live yet.
- **Resume for the push:** complete-history bundle verified at
  `~/workspace/lucid-gdrive-oauth.bundle` (HEAD 59b06e4, "The
  bundle records a complete history"). On the Mac (which holds
  the token): copy the bundle over, `git fetch <bundle> HEAD`,
  then `git push origin HEAD:master`, then verify with
  `git ls-remote origin HEAD` — it must show 59b06e4 (or the
  later head if the progress log was re-committed after the
  bundle). Remote master is still at 97fc20c, so the push is a
  clean fast-forward; no rebase needed unless master moves first.

## DONE — all five phases complete except the push (2026-11-08 ~17:31 PST)
- Commits (local, in the worktree + bundle): 8ab8059 (Phase 1),
  53a8a93 (Phase 2), 406f271 (Phase 3), 7e992fa (Phase 4),
  59b06e4 (progress log). OAUTH_PROGRESS.md committed with the
  final numbers.
- dist-electron/ is untracked build output — NOT committed, and
  NOT in .gitignore (only `dist/` is). Left untracked per plan.

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
