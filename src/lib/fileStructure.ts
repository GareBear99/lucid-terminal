/**
 * File structure from a tree-sitter tree (steal #2 — 2026-11-14).
 *
 * Pure extraction over a parsed tree: definitions, imports, exports,
 * the enclosing function at a position, and the identifiers in scope
 * there. No engine, no I/O — the caller (src/lib/treeSitter.ts) owns
 * the Parser/Language/Query compilation and passes a `runQuery`
 * callback, so this module never touches WASM and is unit-testable
 * with a stub runner (the real tests use the real engine).
 *
 * The queries are Lucid's own, written against the TS/JS node types
 * (verified against tree-sitter-typescript's node-types.json) and
 * informed by the grammar's shipped tags.scm / locals.scm (MIT):
 * the TS tags.scm covers function/method/class/interface signatures;
 * the JS surface (variable declarators, arrow functions, assignments)
 * is covered here directly. Tree-sitter gives structure, not
 * meaning — no type inference, no cross-file resolution. It feeds
 * the driving intelligence precise scoped context instead of raw
 * text; it is not the brain.
 *
 * Positions: tree-sitter rows are 0-based, columns are byte offsets
 * within the row. Monaco positions are 1-based lines, UTF-16
 * columns — the caller converts before calling in (see
 * monacoPositionToTreeSitter).
 */

import type { Node, QueryMatch, QueryOptions } from 'web-tree-sitter';

export type QueryRunner = (
  source: string,
  node: Node,
  options?: QueryOptions,
) => QueryMatch[];

export type DefinitionKind =
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'variable';

export interface FileDefinition {
  name: string;
  kind: DefinitionKind;
  /** Byte offset of the declaration's start. */
  startIndex: number;
  /** Byte offset of the declaration's end. */
  endIndex: number;
  startRow: number;
  endRow: number;
}

/** One query per definition shape — each pattern captures the
 *  declaration itself (@def) and its name (@name) in one match. */
export const DEFINITIONS_QUERY = `
(function_declaration name: (identifier) @name) @def
(generator_function_declaration name: (identifier) @name) @def
(function_signature name: (identifier) @name) @def
(variable_declarator name: (identifier) @name) @def
(method_definition name: (property_identifier) @name) @def
(method_signature name: (property_identifier) @name) @def
(abstract_method_signature name: (property_identifier) @name) @def
(class_declaration name: (type_identifier) @name) @def
(abstract_class_declaration name: (type_identifier) @name) @def
(interface_declaration name: (type_identifier) @name) @def
(type_alias_declaration name: (type_identifier) @name) @def
(enum_declaration name: (identifier) @name) @def
`;

export const IMPORT_NAMES_QUERY = `
(import_clause (identifier) @name)
(import_clause (named_imports (import_specifier name: (identifier) @name)))
(import_clause (namespace_import (identifier) @name))
`;

export const EXPORT_SPECIFIER_QUERY = `
(export_specifier) @spec
`;

/** Variable declarators anywhere under a node (used for
 *  scope-local names — the caller filters by nearest function). */
export const VARIABLE_DECLARATOR_QUERY = `
(variable_declarator name: (identifier) @name) @def
`;

const KIND_BY_NODE_TYPE: Record<string, DefinitionKind> = {
  function_declaration: 'function',
  generator_function_declaration: 'function',
  function_signature: 'function',
  variable_declarator: 'variable',
  method_definition: 'method',
  method_signature: 'method',
  abstract_method_signature: 'method',
  class_declaration: 'class',
  abstract_class_declaration: 'class',
  interface_declaration: 'interface',
  type_alias_declaration: 'type',
  enum_declaration: 'enum',
};

/** Convert a (0-based row, byte column) to a byte offset in the text. */
export function positionToByteOffset(
  text: string,
  row: number,
  byteColumn: number,
): number {
  const encoder = new TextEncoder();
  let offset = 0;
  let currentRow = 0;
  while (currentRow < row) {
    const nl = text.indexOf('\n', offset);
    if (nl === -1) return encoder.encode(text).length;
    offset = nl + 1;
    currentRow++;
  }
  return offset + byteColumn;
}

/** Convert a Monaco position (1-based line, 1-based UTF-16 column)
 *  to a tree-sitter position (0-based row, byte column). */
export function monacoPositionToTreeSitter(
  text: string,
  lineNumber: number,
  column: number,
): { row: number; column: number } {
  const row = Math.max(0, lineNumber - 1);
  const lines = text.split('\n');
  const line = lines[row] ?? '';
  const units = Math.max(0, Math.min(column - 1, line.length));
  const byteColumn = new TextEncoder().encode(line.slice(0, units)).length;
  return { row, column: byteColumn };
}

/** All definitions under `node` (whole file when `node` is the
 *  root). Destructured names (object/array patterns) are skipped —
 *  the name capture is an identifier only. */
export function extractDefinitions(
  node: Node,
  runQuery: QueryRunner,
): FileDefinition[] {
  const defs: FileDefinition[] = [];
  let matches: QueryMatch[];
  try {
    matches = runQuery(DEFINITIONS_QUERY, node);
  } catch {
    return defs;
  }
  for (const match of matches) {
    // Each match carries one @def (the declaration) and one @name.
    const def = match.captures.find((c) => c.name === 'def')?.node;
    const name = match.captures.find((c) => c.name === 'name')?.node;
    if (!def || !name) continue;
    const kind = KIND_BY_NODE_TYPE[def.type];
    if (!kind) continue;
    defs.push({
      name: name.text,
      kind,
      startIndex: def.startIndex,
      endIndex: def.endIndex,
      startRow: def.startPosition.row,
      endRow: def.endPosition.row,
    });
  }
  return defs;
}

/** Names imported by the file (default + named + namespace). */
export function extractImports(
  node: Node,
  runQuery: QueryRunner,
): string[] {
  let matches: QueryMatch[];
  try {
    matches = runQuery(IMPORT_NAMES_QUERY, node);
  } catch {
    return [];
  }
  const names: string[] = [];
  for (const match of matches) {
    for (const capture of match.captures) {
      if (capture.name === 'name') names.push(capture.node.text);
    }
  }
  return [...new Set(names)];
}

/** Names the file exports: `export { a, b }` specifiers plus the
 *  names of top-level definitions wrapped in an export_statement.
 *  For `export { helper as renamedHelper }` the exported name is
 *  the alias, not the local name. */
export function extractExports(
  node: Node,
  runQuery: QueryRunner,
): string[] {
  const exported = new Set<string>();
  try {
    for (const match of runQuery(EXPORT_SPECIFIER_QUERY, node)) {
      for (const capture of match.captures) {
        if (capture.name !== 'spec') continue;
        // alias: (identifier) when present, else name: (identifier).
        const spec = capture.node;
        const alias = spec.childForFieldName('alias');
        const name = spec.childForFieldName('name');
        const exportedName = alias?.text ?? name?.text;
        if (exportedName) exported.add(exportedName);
      }
    }
  } catch {
    // No specifiers — the definition walk below still runs.
  }
  for (const def of extractDefinitions(node, runQuery)) {
    if (isExportedDefinition(node, def)) exported.add(def.name);
  }
  return [...exported];
}

/** True when the definition's declaration is exported directly
 *  (`export function f …`, `export const x = …`) — the
 *  export_statement is the declaration's parent (or the parent of
 *  its lexical_declaration). A function nested inside an exported
 *  function is NOT exported, so the check is the direct parent,
 *  not any ancestor. */
function isExportedDefinition(root: Node, def: FileDefinition): boolean {
  const node = root.descendantForIndex(def.startIndex, def.endIndex);
  if (!node) return false;
  let parent = node.parent;
  if (parent?.type === 'lexical_declaration') parent = parent.parent;
  return parent?.type === 'export_statement';
}

const FUNCTION_NODE_TYPES = new Set([
  'function_declaration',
  'generator_function_declaration',
  'function_expression',
  'arrow_function',
  'method_definition',
  'function_signature',
]);

export interface EnclosingFunction {
  /** The function's name, when it has one (arrow functions and
   *  anonymous expressions return null — the range is still useful). */
  name: string | null;
  startIndex: number;
  endIndex: number;
  startRow: number;
  endRow: number;
}

/** The innermost function-like node containing (row, byteColumn),
 *  or null when the position is at the top level. */
export function getEnclosingFunction(
  root: Node,
  row: number,
  byteColumn: number,
): EnclosingFunction | null {
  const offset = positionToByteOffset(root.text, row, byteColumn);
  let node: Node | null = null;
  try {
    node = root.descendantForIndex(offset, offset);
  } catch {
    return null;
  }
  while (node) {
    if (FUNCTION_NODE_TYPES.has(node.type)) {
      return {
        name: functionNodeName(node),
        startIndex: node.startIndex,
        endIndex: node.endIndex,
        startRow: node.startPosition.row,
        endRow: node.endPosition.row,
      };
    }
    if (node.type === 'program') return null;
    node = node.parent;
  }
  return null;
}

/** A function node's own name: `function f`, `method m`, or the
 *  variable an arrow/function expression is assigned to
 *  (`const f = () => …`). Anonymous otherwise. */
function functionNodeName(node: Node): string | null {
  const nameChild = node.childForFieldName('name');
  if (nameChild) return nameChild.text;
  // Arrow / function expression assigned to a variable.
  const parent = node.parent;
  if (parent?.type === 'variable_declarator') {
    const declaratorName = parent.childForFieldName('name');
    if (declaratorName) return declaratorName.text;
  } else if (parent?.type === 'assignment_expression') {
    const left = parent.childForFieldName('left');
    if (left) return left.text;
  }
  return null;
}

/** Parameter identifiers of a function-like node (required +
 *  optional parameters; destructured patterns are skipped). */
function parameterNames(node: Node): string[] {
  const params = node.childForFieldName('parameters');
  if (!params) return [];
  const names: string[] = [];
  for (let i = 0; i < params.namedChildCount; i++) {
    const param = params.namedChild(i);
    if (!param) continue;
    if (
      param.type === 'required_parameter' ||
      param.type === 'optional_parameter'
    ) {
      const id = param.namedChild(0);
      if (id?.type === 'identifier') names.push(id.text);
    }
  }
  return names;
}

/** The nearest function-like ancestor of a node (the node itself
 *  counts when it is function-like). */
function nearestFunctionAncestor(node: Node): Node | null {
  let current: Node | null = node;
  while (current) {
    if (FUNCTION_NODE_TYPES.has(current.type)) return current;
    current = current.parent;
  }
  return null;
}

/**
 * Identifiers in scope at (row, byteColumn), nearest first:
 * the enclosing function's parameters, then variables declared
 * in the enclosing function (not in nested functions), then
 * top-level definitions, then imported names. Deduped, order
 * preserved. A completion source, not a scope proof — it answers
 * "what can I type here" for the ghost, it does not resolve
 * shadowing exactly.
 */
export function getIdentifiersInScope(
  root: Node,
  row: number,
  byteColumn: number,
  runQuery: QueryRunner,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (name: string) => {
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  };

  const offset = positionToByteOffset(root.text, row, byteColumn);
  let at: Node | null = null;
  try {
    at = root.descendantForIndex(offset, offset);
  } catch {
    at = null;
  }

  // Walk up through enclosing functions, collecting each one's
  // parameters and its own (non-nested) variables.
  let scope: Node | null = at;
  while (scope) {
    if (FUNCTION_NODE_TYPES.has(scope.type)) {
      for (const name of parameterNames(scope)) push(name);
      try {
        for (const match of runQuery(VARIABLE_DECLARATOR_QUERY, scope)) {
          for (const capture of match.captures) {
            if (capture.name !== 'name') continue;
            // Only variables whose nearest function IS this scope —
            // a declarator inside a nested arrow belongs to the
            // nested function, not to this one. Node objects are
            // NOT identity-stable across .parent accesses in
            // web-tree-sitter — compare with .equals(), never ===.
            const declarator = capture.node.parent;
            const nearest = declarator
              ? nearestFunctionAncestor(declarator)
              : null;
            if (nearest?.equals(scope)) {
              push(capture.node.text);
            }
          }
        }
      } catch {
        // Scope query failed — the outer scopes still apply.
      }
    }
    if (scope.type === 'program') break;
    scope = scope.parent;
  }

  // Top-level definitions, then imports.
  for (const def of extractDefinitions(root, runQuery)) {
    if (isTopLevelDefinition(root, def)) push(def.name);
  }
  for (const name of extractImports(root, runQuery)) push(name);
  return out;
}

/** True when the definition is a top-level declaration: its
 *  declaration node sits directly under the program, allowing an
 *  export_statement and/or a lexical_declaration in between
 *  (`export const x = …`). A definition nested in a function,
 *  class, or block is not top-level. */
export function isTopLevelDefinition(
  root: Node,
  def: FileDefinition,
): boolean {
  const node = root.descendantForIndex(def.startIndex, def.endIndex);
  if (!node) return false;
  let current: Node | null = node.parent;
  while (
    current &&
    (current.type === 'export_statement' ||
      current.type === 'lexical_declaration')
  ) {
    current = current.parent;
  }
  return current?.type === 'program';
}
