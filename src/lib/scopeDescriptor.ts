/**
 * The scope system — the minimal
 * core, not the whole TextMate apparatus.
 *
 * A `ScopeDescriptor` is an ordered array of scope strings
 * from root to leaf, e.g.
 * `['source.ts', 'meta.function', 'string.quoted.double']`.
 * One object drives context-sensitivity: scoped keybindings
 * are the first consumer (a binding with a `scope` selector
 * only fires when the cursor's descriptor matches it).
 *
 * The descriptor is derived from Lucid's existing tree-sitter
 * tree: the node-type path at the cursor (root → the smallest
 * named node containing the position) is mapped through the
 * `SyntaxScopeMap`-style table below into TextMate-style
 * scope strings. Node types with no table entry pass through
 * verbatim — Atom's tree-sitter mode did the same for
 * `syntaxTreeScopeDescriptorForPosition` — so the descriptor
 * is never empty and selectors can still target them.
 *
 * Deliberately NOT ported: FirstMate (no TextMate runtime in
 * Lucid), the scored grammar selection (Lucid's two grammars
 * are already picked by extension in `getLanguageForPath`;
 * the scoring only matters when a third grammar lands), and
 * scoped settings/snippets (later consumers — the descriptor
 * and the matcher are the shared layer they will use).
 */

export type ScopeDescriptor = string[];

/** The grammars Lucid has. */
export type ScopeLanguage = 'typescript' | 'tsx';

/**
 * Tree-sitter node type → TextMate-style scope. The root
 * scope (`source.ts` / `source.tsx`) is prepended by
 * `scopeDescriptorForNodePath`, not listed here.
 */
export const SYNTAX_SCOPE_MAP: Record<string, string> = {
  function_declaration: 'meta.function',
  function_expression: 'meta.function',
  arrow_function: 'meta.function',
  method_definition: 'meta.function',
  method_signature: 'meta.function',
  function_signature: 'meta.function',
  class_declaration: 'meta.class',
  class_body: 'meta.class',
  interface_declaration: 'meta.interface',
  type_alias_declaration: 'meta.type',
  enum_declaration: 'meta.enum',
  string: 'string.quoted.double',
  template_string: 'string.template',
  template_substitution: 'string.template',
  comment: 'comment',
  number: 'constant.numeric',
  true: 'constant.language',
  false: 'constant.language',
  null: 'constant.language',
  undefined: 'constant.language',
  call_expression: 'meta.function-call',
  member_expression: 'meta.property-access',
  import_statement: 'meta.import',
  import_clause: 'meta.import',
  export_statement: 'meta.export',
  if_statement: 'keyword.control',
  else_clause: 'keyword.control',
  for_statement: 'keyword.control',
  for_in_statement: 'keyword.control',
  while_statement: 'keyword.control',
  do_statement: 'keyword.control',
  switch_statement: 'keyword.control',
  return_statement: 'keyword.control',
  try_statement: 'keyword.control',
  catch_clause: 'keyword.control',
  finally_clause: 'keyword.control',
  throw_statement: 'keyword.control',
  jsx_element: 'meta.jsx',
  jsx_self_closing_element: 'meta.jsx',
  jsx_opening_element: 'meta.jsx',
  jsx_expression: 'meta.jsx',
  object: 'meta.object',
  object_pattern: 'meta.object',
  array: 'meta.array',
  array_pattern: 'meta.array',
  arguments: 'meta.arguments',
  parameters: 'meta.parameters',
  variable_declarator: 'meta.variable',
  lexical_declaration: 'meta.variable',
  property_signature: 'meta.property',
  public_field_definition: 'meta.property',
};

/**
 * Build a descriptor from a node-type path (root → leaf) in a
 * file of the given language. Consecutive duplicate scopes
 * collapse (nested `meta.function` nodes are one scope).
 */
export function scopeDescriptorForNodePath(
  language: ScopeLanguage,
  nodeTypes: string[],
): ScopeDescriptor {
  const root = language === 'tsx' ? 'source.tsx' : 'source.ts';
  const descriptor: ScopeDescriptor = [root];
  for (let i = 0; i < nodeTypes.length; i += 1) {
    const nodeType = nodeTypes[i];
    let scope: string;
    if (nodeType === 'string_fragment' && i > 0) {
      // A string's content is not its own scope — it inherits
      // the enclosing string's: `string` → `string.quoted.double`,
      // `template_string` → `string.template`.
      scope = SYNTAX_SCOPE_MAP[nodeTypes[i - 1]] ?? nodeTypes[i - 1];
    } else {
      scope = SYNTAX_SCOPE_MAP[nodeType] ?? nodeType;
    }
    if (descriptor[descriptor.length - 1] !== scope) {
      descriptor.push(scope);
    }
  }
  return descriptor;
}

/**
 * Does one selector segment match one scope? `*` matches
 * anything; otherwise the scope must equal the segment or
 * start with `segment.` (a prefix match, so `string` matches
 * `string.quoted.double` and `string.template`).
 */
function segmentMatches(segment: string, scope: string): boolean {
  if (segment === '*') return true;
  return scope === segment || scope.startsWith(`${segment}.`);
}

/**
 * Does a scope descriptor match a selector? The selector is a
 * comma-separated list of alternatives (OR); each alternative
 * is a `>`-separated path of segments that must appear as a
 * contiguous run in the descriptor, in order. A single segment
 * matches anywhere in the chain; `*` matches any descriptor.
 * An empty selector never matches; a null descriptor matches
 * only `*`.
 *
 * This is the useful subset of Atom's scope selectors — enough
 * for scoped keybindings (`string.quoted`, `comment`,
 * `meta.function > string.template`) without porting the full
 * CSS-like selector engine.
 */
export function scopeMatches(
  descriptor: ScopeDescriptor | null,
  selector: string,
): boolean {
  const trimmed = selector.trim();
  if (!trimmed) return false;
  if (trimmed === '*') return true;
  if (!descriptor || descriptor.length === 0) return false;
  for (const alternative of trimmed.split(',')) {
    const segments = alternative
      .split('>')
      .map((part) => part.trim())
      .filter(Boolean);
    if (segments.length === 0) continue;
    // A run of `segments.length` consecutive descriptor scopes
    // matching the segments, in order, anywhere in the chain.
    for (let start = 0; start + segments.length <= descriptor.length; start += 1) {
      let ok = true;
      for (let i = 0; i < segments.length; i += 1) {
        if (!segmentMatches(segments[i], descriptor[start + i])) {
          ok = false;
          break;
        }
      }
      if (ok) return true;
    }
  }
  return false;
}
