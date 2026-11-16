/**
 * The jump stack — the position
 * stack behind go-back.
 *
 * Atom pushed the cursor position when a jump happened
 * (go-to-declaration, go-to-symbol) and popped it on go-back.
 * Lucid's project-symbol jump pushes the position the modal
 * opened with; `lucid:go-back` pops it and jumps back. The
 * stack is module-level and bounded (50) — it is navigation
 * state, not profile state, so it never persists.
 */

export interface JumpPosition {
  path: string;
  lineNumber: number;
  column: number;
}

const MAX_JUMP_STACK = 50;

const stack: JumpPosition[] = [];

/** Push the position a jump leaves from. */
export function pushJumpPosition(position: JumpPosition): void {
  stack.push(position);
  if (stack.length > MAX_JUMP_STACK) stack.shift();
}

/** Pop the most recent pushed position, or null when empty. */
export function popJumpPosition(): JumpPosition | null {
  return stack.pop() ?? null;
}

/** Peek without popping — the position go-back would return to. */
export function peekJumpPosition(): JumpPosition | null {
  return stack.length > 0 ? stack[stack.length - 1] : null;
}

export function resetJumpStackForTests(): void {
  stack.length = 0;
}
