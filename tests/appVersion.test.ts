// The app version pill reads APP_VERSION — it must stay in sync
// with package.json (bump both together).
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { APP_VERSION } from '../src/lib/appVersion';

describe('APP_VERSION', () => {
  test('matches package.json', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
    expect(APP_VERSION).toBe(pkg.version);
  });
});
