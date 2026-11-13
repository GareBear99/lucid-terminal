/**
 * Auto-detection: does this composer draft look like a prompt for
 * the agent rather than a shell command? (Heavy terminal work,
 * 2026-11-13 — Warp auto-detects agent prompts in terminal
 * sessions; Lucid had no detection at all.)
 *
 * SUGGEST-ONLY, never auto-route: a `true` here only changes the
 * hint line to offer the hand-off ("looks like a prompt — ⌘⏎ send
 * to agent"). The draft still submits to the shell unless the user
 * presses ⌘⏎. False negatives are fine (no offer); false
 * positives are the cost — so the rules are conservative: anything
 * that smells like a shell line is NOT a prompt.
 *
 * Pure function — no React, no stores — unit-testable on its own.
 */

/** First words that mark the line as a shell command, not a
 *  prompt. The common interactive-shell vocabulary (coreutils,
 *  git, package managers, runtimes, editors, system tools).
 *  `sudo` / `time` / `env` prefixes are stripped before the
 *  check, so `sudo apt update` still reads as a command. */
export const SHELL_COMMAND_FIRST_WORDS: readonly string[] = [
  // coreutils / files
  'ls', 'cd', 'pwd', 'cat', 'less', 'more', 'head', 'tail', 'echo',
  'mkdir', 'rmdir', 'rm', 'cp', 'mv', 'touch', 'ln', 'chmod', 'chown',
  'find', 'grep', 'sed', 'awk', 'sort', 'uniq', 'wc', 'diff', 'tar',
  'zip', 'unzip', 'gzip', 'open', 'which', 'type', 'man', 'history',
  'clear', 'exit', 'kill', 'ps', 'top', 'htop', 'df', 'du', 'mount',
  'ssh', 'scp', 'curl', 'wget', 'ping', 'dig', 'nslookup',
  // editors
  'vim', 'vi', 'nvim', 'nano', 'emacs', 'code', 'subl',
  // vcs / builds
  'git', 'gh', 'hg', 'svn', 'make', 'cmake', 'ninja', 'gcc', 'clang',
  'cargo', 'rustc', 'go', 'javac', 'java',
  // runtimes / package managers
  'node', 'npm', 'npx', 'yarn', 'pnpm', 'bun', 'deno', 'python',
  'python3', 'pip', 'pip3', 'ruby', 'gem', 'bundle', 'php', 'composer',
  'brew', 'apt', 'apt-get', 'dnf', 'yum', 'pacman',
  // containers / infra
  'docker', 'kubectl', 'terraform', 'ansible', 'vagrant',
  // shells / misc
  'bash', 'zsh', 'sh', 'fish', 'tmux', 'screen', 'watch', 'sleep',
  'export', 'alias', 'unalias', 'source', 'eval', 'exec', 'test',
];

/** Words that mark a multi-word line as a request, not a command:
 *  questions, imperatives, and ask-verbs. */
const PROMPT_MARKER_WORDS: readonly string[] = [
  'how', 'why', 'what', 'when', 'where', 'which', 'who',
  'can', 'could', 'should', 'would', 'will', 'please',
  'explain', 'describe', 'summarize', 'summarise', 'translate',
  'fix', 'make', 'create', 'write', 'build', 'add', 'change',
  'update', 'find', 'show', 'tell', 'give', 'generate',
  'implement', 'refactor', 'debug', 'test', 'review', 'help',
  'check', 'list', 'search', 'plan', 'design', 'improve',
];

/** Shell metacharacters: a bare line containing one is a shell
 *  line (pipeline, redirect, chain, substitution, glob, flag,
 *  assignment, path). A prompt almost never contains them. */
const SHELL_META = /[|><&;$`*=~]|--|\.\/|\.\.\//;

export interface AgentPromptDetection {
  isPrompt: boolean;
  reason: string;
}

/** Does this draft look like an agent prompt? */
export function detectAgentPrompt(input: string): AgentPromptDetection {
  const trimmed = input.trim();
  if (!trimmed) return { isPrompt: false, reason: 'empty' };
  // A Lucid slash line is a Lucid command, never an agent prompt.
  if (trimmed.startsWith('/')) return { isPrompt: false, reason: 'slash-command' };
  // A multi-line draft is a script / paste, not a prompt.
  if (trimmed.includes('\n')) return { isPrompt: false, reason: 'multi-line' };
  // A path or a command substitution is a shell line.
  if (/^(~\/|\/|\.\/)/.test(trimmed)) return { isPrompt: false, reason: 'path' };
  if (SHELL_META.test(trimmed)) return { isPrompt: false, reason: 'shell-metacharacters' };

  const words = trimmed.split(/\s+/);
  // Strip `sudo` / `time` / `env ...` prefixes before the
  // first-word check, so `sudo apt update` still reads as a
  // command.
  let first = words[0].toLowerCase();
  if ((first === 'sudo' || first === 'time') && words.length > 1) {
    first = words[1].toLowerCase();
  }
  if (SHELL_COMMAND_FIRST_WORDS.includes(first)) {
    return { isPrompt: false, reason: 'known-shell-command' };
  }

  // A question is a prompt, however short.
  if (trimmed.endsWith('?')) return { isPrompt: true, reason: 'question' };
  // Three-plus words with a request marker is a prompt.
  if (words.length >= 3) {
    const lower = words.map((w) => w.toLowerCase().replace(/[^a-z]/g, ''));
    if (lower.some((w) => PROMPT_MARKER_WORDS.includes(w))) {
      return { isPrompt: true, reason: 'request-words' };
    }
  }
  // Six-plus bare words with no shell markers is almost never a
  // shell one-liner — it reads as a sentence.
  if (words.length >= 6) return { isPrompt: true, reason: 'long-bare-line' };
  return { isPrompt: false, reason: 'too-short-or-plain' };
}
