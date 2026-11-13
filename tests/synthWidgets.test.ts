/**
 * Widget registry tests — the demo widget system (Gary, 2026-11-12
 * ~16:48 PST): widgets are registered units, built-ins are native
 * and cannot be replaced or unregistered, custom widgets register
 * through registerSynthWidget and always land as non-native.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import {
  clearSynthWidgetRegistryForTests,
  getSynthWidget,
  hasSynthWidget,
  listSynthWidgets,
  registerBuiltInSynthWidget,
  registerSynthWidget,
  unregisterSynthWidget,
  widgetsGateMet,
} from '../src/lib/synthWidgets';
import { COMPASS_WIDGET } from '../src/components/Synth/widgets/CompassWidget';
import type { SynthWidgetContext } from '../src/lib/synthWidgets';
import { createCreatorBuild } from '../src/lib/synthDisclaimer';
import {
  DEFAULT_MODULES,
  DEFAULT_SHELL_BLUEPRINT,
} from '../src/lib/synthBlueprint';

function TestWidget() {
  return null;
}

function OtherWidget() {
  return null;
}

function validOwnBuild() {
  const build = createCreatorBuild(
    'iteration-8',
    'F1B49B1CB10D6FED',
    'pink',
    DEFAULT_SHELL_BLUEPRINT,
    DEFAULT_MODULES,
    'default',
  );
  expect(build).not.toBeNull();
  return build;
}

beforeEach(() => {
  // Clean slate per test; the compass is re-registered explicitly.
  clearSynthWidgetRegistryForTests();
  registerBuiltInSynthWidget(COMPASS_WIDGET);
});

describe('widget registry', () => {
  test('the compass is registered as the native first widget', () => {
    const listed = listSynthWidgets();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe('compass');
    expect(listed[0].native).toBe(true);
    expect(getSynthWidget('compass')).toBe(listed[0]);
    expect(hasSynthWidget('compass')).toBe(true);
    expect(hasSynthWidget('nope')).toBe(false);
    expect(getSynthWidget('nope')).toBeUndefined();
  });

  test('a custom widget registers as non-native, in order after the compass', () => {
    const def = registerSynthWidget({
      id: 'my-widget',
      name: 'My widget',
      description: 'A custom widget.',
      Component: TestWidget as unknown as (
        ctx: SynthWidgetContext,
      ) => null,
    });
    expect(def.native).toBe(false);
    const listed = listSynthWidgets();
    expect(listed.map((w) => w.id)).toEqual(['compass', 'my-widget']);
  });

  test('registering with native: true still lands as non-native', () => {
    // A caller cannot claim native status: the registry forces it
    // false. (Cast: `native` is not a registerable field.)
    const sneaky = {
      id: 'sneaky',
      name: 'Sneaky',
      description: 'Tries to claim native.',
      Component: TestWidget,
      native: true,
    } as unknown as Parameters<typeof registerSynthWidget>[0];
    const def = registerSynthWidget(sneaky);
    expect(def.native).toBe(false);
  });

  test('re-registering the same definition is a no-op, never a throw', () => {
    expect(() =>
      registerBuiltInSynthWidget(COMPASS_WIDGET),
    ).not.toThrow();
    expect(listSynthWidgets()).toHaveLength(1);
  });

  test('a different widget claiming an existing id throws', () => {
    expect(() =>
      registerSynthWidget({
        id: 'compass',
        name: 'Fake compass',
        description: 'Tries to shadow the native compass.',
        Component: OtherWidget as never,
      }),
    ).toThrow(/already registered/);
    expect(listSynthWidgets()).toHaveLength(1);
    expect(getSynthWidget('compass')?.Component).toBe(
      COMPASS_WIDGET.Component,
    );
  });

  test('unregister removes a custom widget, refuses natives and unknowns', () => {
    registerSynthWidget({
      id: 'temp',
      name: 'Temp',
      description: 'Temporary.',
      Component: TestWidget as never,
    });
    expect(unregisterSynthWidget('temp')).toBe(true);
    expect(hasSynthWidget('temp')).toBe(false);
    expect(unregisterSynthWidget('temp')).toBe(false);
    expect(() => unregisterSynthWidget('compass')).toThrow(/native/);
    expect(hasSynthWidget('compass')).toBe(true);
  });

  test('bad ids and missing components throw', () => {
    for (const badId of ['', 'Bad ID', 'UPPER', 'has space', '-lead']) {
      expect(() =>
        registerSynthWidget({
          id: badId,
          name: 'Bad',
          description: 'Bad id.',
          Component: TestWidget as never,
        }),
      ).toThrow(/kebab-case/);
    }
    expect(() =>
      registerSynthWidget({
        id: 'no-component',
        name: 'No component',
        description: 'Missing Component.',
        Component: undefined as never,
      }),
    ).toThrow(/Component/);
  });
});

describe('widgetsGateMet — the permanent-creation gate', () => {
  // UPDATED 2026-11-12 ~20:15 PST (guest leak — the widgets wave
  // FAILED live verification as guest): the gate takes a third
  // argument, demoLocked, and a demo-locked session never passes,
  // whatever the persisted flags say. The old 2-arg calls below
  // asserted the flag + build alone; the corrected behaviour is
  // flag + build + NOT demo-locked.
  test('the demo state (flag false, no build) hides widgets', () => {
    expect(widgetsGateMet(false, null, false)).toBe(false);
    expect(widgetsGateMet(false, validOwnBuild(), false)).toBe(false);
  });

  test('the flag alone, without a saved build, hides widgets', () => {
    expect(widgetsGateMet(true, null, false)).toBe(false);
    expect(widgetsGateMet(true, { choice: 'build' }, false)).toBe(false);
  });

  test('a saved build alone, without the flag, hides widgets', () => {
    expect(widgetsGateMet(false, validOwnBuild(), false)).toBe(false);
  });

  test('flag AND a valid saved creation shows widgets', () => {
    expect(widgetsGateMet(true, validOwnBuild(), false)).toBe(true);
  });

  test('a demo-locked session never passes, even with flag AND a valid saved creation', () => {
    // The guest leak: the persisted flags pass for a guest (the
    // veil never touches them), so the gate must fail on the
    // session lock alone.
    expect(widgetsGateMet(true, validOwnBuild(), true)).toBe(false);
    expect(widgetsGateMet(true, null, true)).toBe(false);
    expect(widgetsGateMet(false, null, true)).toBe(false);
  });
});
