// Child-process fixture for the crash-log tests — run with
// tsx (the repo's devDependency), NOT plain node: the service
// is TypeScript.
//
// Usage: tsx tests/fixtures/crashLogChild.ts <mode> <dir>
//   append-exit — write one entry, then process.exit(0)
//     immediately. Proves the sync write + fsync: the entry
//     is on disk even though the process dies at once (no
//     buffering that loses the last entry).
//   throw — install the main crash handlers, then throw an
//     uncaught exception. The handler must write a
//     main-uncaught-exception entry and exit(1).
//   reject — install the handlers, then reject a promise
//     nobody awaits. Same, for main-unhandled-rejection.
import {
  CrashLogWriter,
  createCrashEntry,
  installMainCrashHandlers,
  setCrashContext,
} from '../../electron/services/crashLog';

const [mode, dir] = process.argv.slice(2);
if (!mode || !dir) {
  console.error('usage: crashLogChild.ts <append-exit|throw|reject> <dir>');
  process.exit(2);
}

const writer = new CrashLogWriter({ homeDir: dir, sessionId: 'childsession' });
setCrashContext({ appVersion: '9.9.9-test', commit: 'testcommit' });

if (mode === 'append-exit') {
  writer.append(
    createCrashEntry({ kind: 'startup', message: 'child started — append-exit' }),
  );
  process.exit(0);
}

if (mode === 'throw') {
  installMainCrashHandlers(writer);
  setTimeout(() => {
    throw new Error('boom-child-uncaught');
  }, 10);
  // Keep the process alive until the throw lands.
  setTimeout(() => process.exit(3), 5000);
} else if (mode === 'reject') {
  installMainCrashHandlers(writer);
  setTimeout(() => {
    void Promise.reject(new Error('boom-child-rejection'));
  }, 10);
  setTimeout(() => process.exit(3), 5000);
} else {
  console.error(`unknown mode: ${mode}`);
  process.exit(2);
}
