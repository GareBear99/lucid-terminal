/**
 * The built-in `lucid` extension (Raycast steal — 2026-11-16).
 *
 * Raycast ships built-in extensions (Calculator, Clipboard
 * History, Quicklinks, Window Management, …) alongside the
 * Store; Lucid ships one built-in extension with the commands
 * the palette model itself needs:
 * - `lucid:create-quicklink` — a no-view command with two
 *   arguments (name, link): the arguments ARE the form, the
 *   way Raycast's argument commands take their values in Root
 *   Search before running.
 * - `lucid:calculator` — a no-view command with one argument
 *   (the expression); the inline calculator in Root Search is
 *   the same evaluator, reached without a command.
 * - `lucid:toggle-extension` — enable/disable an extension
 *   (the dropdown lists the extensions registered at startup;
 *   extensions registered later do not appear — follow-up).
 * - `lucid:copy-command-deeplink` — copy the deeplink for a
 *   command (the dropdown lists the commands known at startup).
 *
 * The existing registry commands are NOT re-registered here:
 * the providers adapt them as the `lucid` extension's commands,
 * so the palette lists them without a second source of truth.
 * Registration is idempotent per registry set: calling this
 * twice with the same registries is a no-op.
 */

import {
  paletteExtensions,
  paletteQuicklinks,
  buildDeeplink,
  evaluateCalculator,
  type PaletteExtensionRegistry,
  type QuicklinkRegistry,
} from './paletteExtensions';
import {
  commandRegistry,
  type CommandRegistry,
} from './commandRegistry';

export interface PaletteBuiltinDeps {
  copyText: (text: string) => void;
}

export interface PaletteBuiltinRegistries {
  extensions: PaletteExtensionRegistry;
  quicklinks: QuicklinkRegistry;
  commands: CommandRegistry;
}

export function registerPaletteBuiltins(
  deps: PaletteBuiltinDeps,
  registries: PaletteBuiltinRegistries = {
    extensions: paletteExtensions,
    quicklinks: paletteQuicklinks,
    commands: commandRegistry,
  },
): void {
  const { extensions, quicklinks, commands } = registries;
  if (extensions.getExtension('lucid')) return;

  const extensionOptions = extensions
    .extensionsList()
    .map((e) => ({ title: e.title, value: e.id }));
  const commandOptions = [
    ...commands.all().map((d) => ({ title: d.title, value: d.id, extensionId: 'lucid' })),
    ...extensions.commands().map((d) => ({ title: d.title, value: d.id, extensionId: d.extensionId ?? '' })),
  ];

  extensions.registerExtension({
    id: 'lucid',
    title: 'Lucid',
    description: 'Built-in palette commands: quicklinks, calculator, extensions',
    author: 'lucid',
    commands: [
      {
        id: 'lucid:create-quicklink',
        title: 'Create Quicklink…',
        description: 'Save a named shortcut to a URL, file, or deeplink',
        keywords: ['quicklink', 'link', 'shortcut', 'bookmark'],
        mode: 'no-view',
        arguments: [
          { name: 'name', placeholder: 'Name', type: 'text', required: true },
          { name: 'link', placeholder: 'Link', type: 'text', required: true },
        ],
        run: (_ctx, args) => {
          const name = (args.name ?? '').trim();
          const link = (args.link ?? '').trim();
          if (!name || !link) return;
          const id = `ql-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffff).toString(16)}`;
          try {
            quicklinks.register({ id, name, link });
          } catch {
            // A duplicate id (same millisecond, same random) is a
            // retry, not an error in the user's face.
          }
        },
      },
      {
        id: 'lucid:calculator',
        title: 'Calculator…',
        description: 'Evaluate an expression and copy the result',
        keywords: ['calc', 'calculate', 'math'],
        mode: 'no-view',
        arguments: [
          { name: 'expression', placeholder: 'Expression', type: 'text', required: true },
        ],
        run: (_ctx, args) => {
          const evaluated = evaluateCalculator(args.expression ?? '');
          if (evaluated) deps.copyText(evaluated.display);
        },
      },
      {
        id: 'lucid:toggle-extension',
        title: 'Toggle Extension…',
        description: 'Enable or disable a palette extension',
        keywords: ['extension', 'enable', 'disable'],
        mode: 'no-view',
        arguments: [
          {
            name: 'extension',
            placeholder: 'Extension',
            type: 'dropdown',
            required: true,
            data: extensionOptions.length > 0
              ? extensionOptions
              : [{ title: 'Lucid', value: 'lucid' }],
          },
        ],
        run: (_ctx, args) => {
          const id = args.extension;
          if (!id) return;
          extensions.setExtensionEnabled(id, !extensions.isExtensionEnabled(id));
        },
      },
      {
        id: 'lucid:copy-command-deeplink',
        title: 'Copy Command Deeplink…',
        description: 'Copy the lucid:// deeplink for a command',
        keywords: ['deeplink', 'link', 'copy', 'share'],
        mode: 'no-view',
        arguments: [
          {
            name: 'command',
            placeholder: 'Command',
            type: 'dropdown',
            required: true,
            data: commandOptions.map((c) => ({ title: c.title, value: c.value })),
          },
        ],
        run: (_ctx, args) => {
          const found = commandOptions.find((c) => c.value === args.command);
          if (!found) return;
          deps.copyText(buildDeeplink(found.extensionId, found.value));
        },
      },
    ],
  });
}
