/**
 * Intent Parser - Deterministic Natural Language Understanding
 * 
 * Ported from LuciferAI's command_keywords.py
 * Parses natural language into structured intents WITHOUT LLM
 * 
 * Key Principle: NO LLM for parsing - only for final response generation
 * Just like Warp AI: Deterministic routing + LLM for output
 * 
 * Now with FUZZY MATCHING for advanced typo tolerance!
 */

import { findClosestMatch, getSuggestions } from '../utils/fuzzyMatch';

export interface ParsedIntent {
  type: 'question' | 'action' | 'direct_command' | 'fix_request' | 'script_build' | 'query' | 'unknown';
  intent: 'question' | 'action' | 'direct_command' | 'fix_request' | 'script_build' | 'query' | 'unknown';  // Alias for compatibility
  action?: string;          // create, delete, move, etc.
  target?: string;          // file, folder, script
  targetName?: string;      // actual filename/path
  location?: string;        // desktop, home, etc.
  confidence: number;       // 0-1
  normalized: string;       // Cleaned/normalized input
  original: string;         // Original input
  suggestions?: string[];   // Autocorrect suggestions
}

/**
 * Question indicators - user asking for information
 */
const QUESTION_KEYWORDS = {
  starts: ['how', 'what', 'why', 'when', 'where', 'who', 'which', 'can', 'could', 'would', 'should'],
  contains: ['how do i', 'what is', 'explain', 'tell me', 'define', 'describe']
};

/**
 * Action keywords - user wants something done
 */
const ACTION_KEYWORDS = {
  creation: ['create', 'build', 'make', 'new', 'setup', 'initialize', 'generate', 'put', 'add', 'place', 'write'],
  deletion: ['delete', 'remove', 'rm', 'trash', 'uninstall', 'erase', 'destroy'],
  modification: ['move', 'rename', 'copy', 'cp', 'mv', 'edit', 'update', 'relocate', 'transfer'],
  fileOps: ['read', 'show', 'cat', 'view', 'open', 'write', 'append', 'list', 'ls'],
  search: ['find', 'search', 'locate', 'where is', 'show me', 'look for'],
  execution: ['run', 'execute', 'launch', 'start', 'compile', 'build'],
  fixing: ['fix', 'repair', 'debug', 'autofix'],
  watching: ['watch', 'daemon', 'monitor'],
  installation: ['install', 'setup', 'download', 'pull', 'get'],
  github: ['upload', 'push', 'sync', 'link', 'commit'],
  environment: ['activate', 'envs', 'environments', 'venv'],
  system: ['help', 'info', 'memory', 'clear', 'exit', 'quit', 'pwd', 'cd']
};

/**
 * Target keywords - what the action applies to
 */
const TARGET_KEYWORDS = {
  fileTypes: ['file', 'document', 'script', 'code', '.py', '.js', '.ts', '.md', '.txt', '.json', '.yaml', '.sh', '.html', '.css', '.go', '.rs', '.java'],
  directoryTypes: ['folder', 'directory', 'dir', 'path'],
  locations: ['desktop', 'home', 'documents', 'downloads', 'current', '~', './']
};

/**
 * Synonym mapping - normalize different words to canonical forms
 */
const SYNONYM_MAP: Record<string, string> = {
  // Creation
  'generate': 'create',
  'build': 'create',
  'make': 'create',
  'add': 'create',
  'new': 'create',
  'setup': 'create',
  'initialize': 'create',
  'init': 'create',
  
  // Deletion
  'remove': 'delete',
  'rm': 'delete',
  'trash': 'delete',
  'erase': 'delete',
  'destroy': 'delete',
  
  // Movement
  'rename': 'move',
  'mv': 'move',
  'relocate': 'move',
  'transfer': 'move',
  'cp': 'copy',
  'duplicate': 'copy',
  'clone': 'copy',
  
  // View/Read
  'show': 'read',
  'display': 'read',
  'cat': 'read',
  'view': 'read',
  'see': 'read',
  'look at': 'read',
  'print': 'read',
  
  // Search
  'locate': 'find',
  'search': 'find',
  'look for': 'find',
  'where is': 'find',
  'search for': 'find',
  
  // File types
  'document': 'file',
  'doc': 'file',
  'text file': 'file',
  'folder': 'directory',
  'dir': 'directory',
  
  // Actions
  'execute': 'run',
  'launch': 'run',
  'start': 'run',
  'repair': 'fix',
  'debug': 'fix',
  'append': 'write',
  'put in': 'write'
};

/**
 * Typo corrections - common misspellings
 */
const TYPO_CORRECTIONS: Record<string, string> = {
  // Help commands
  'hlep': 'help',
  'hlp': 'help',
  'hepl': 'help',
  'hep': 'help',
  '?': 'help',
  
  // Exit
  'exti': 'exit',
  'eixt': 'exit',
  'q': 'exit',
  'quit': 'exit',
  
  // File operations
  'delte': 'delete',
  'deletee': 'delete',
  'dleete': 'delete',
  'mve': 'move',
  'mov': 'move',
  'mvoe': 'move',
  'cpy': 'copy',
  'cpoy': 'copy',
  'crate': 'create',
  'creat': 'create',
  'craete': 'create',
  'ceate': 'create',
  'wrtie': 'write',
  'wirte': 'write',
  'wriet': 'write',
  
  // LLM commands
  'llm enble': 'llm enable',
  'llm enbale': 'llm enable',
  'llm disbale': 'llm disable',
  'llm disble': 'llm disable',
  'llm lst': 'llm list',
  'llm lsit': 'llm list',
  'instal': 'install',
  'instll': 'install',
  'isntall': 'install',
  
  // Model names
  'mistrl': 'mistral',
  'mistrall': 'mistral',
  'lama': 'llama',
  'tinylama': 'tinyllama',
  'deepseak': 'deepseek',
  'deapseek': 'deepseek',
  'qwan': 'qwen'
};

/**
 * Politeness phrases - strip these for core command
 */
const POLITENESS_PHRASES = [
  'can you',
  'could you',
  'please',
  'would you',
  'i want to',
  'i need to',
  'i would like to',
  'help me',
  'just',
  'can you please',
  'could you please'
];

/**
 * Direct commands - execute immediately without LLM
 */
const DIRECT_COMMANDS = [
  'help', 'exit', 'quit', 'clear', 'pwd', 'cd', 'ls', 'cat',
  'mkdir', 'touch', 'rm', 'cp', 'mv', 'find', 'grep',
  'ps', 'kill', 'run', 'info', 'memory', 'version',
  'llm list', 'llm enable', 'llm disable',
  'install', 'environments', 'activate',
  'github link', 'github status', 'github projects'
];

/**
 * Check if input is a question
 */
export function isQuestion(text: string): boolean {
  const lower = text.toLowerCase().trim();
  
  // Check starting words
  if (QUESTION_KEYWORDS.starts.some(q => lower.startsWith(q))) {
    return true;
  }
  
  // Check contains patterns
  if (QUESTION_KEYWORDS.contains.some(phrase => lower.includes(phrase))) {
    return true;
  }
  
  // Check for question mark
  if (text.includes('?')) {
    return true;
  }
  
  return false;
}

/**
 * Check if input is an action request
 */
export function isAction(text: string): boolean {
  const lower = text.toLowerCase().trim();
  
  // Check all action keywords
  for (const actions of Object.values(ACTION_KEYWORDS)) {
    if (actions.some(action => lower.includes(action))) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if input is a direct command
 */
export function isDirectCommand(text: string): boolean {
  const lower = text.toLowerCase().trim();
  
  return DIRECT_COMMANDS.some(cmd => 
    lower === cmd || lower.startsWith(cmd + ' ')
  );
}

/**
 * Remove politeness phrases
 */
export function removePoliteness(text: string): string {
  let result = text;
  const lower = result.toLowerCase();
  
  for (const phrase of POLITENESS_PHRASES) {
    if (lower.startsWith(phrase)) {
      result = result.substring(phrase.length).trim();
    }
  }
  
  return result;
}

/**
 * Normalize text with synonym mapping
 */
export function normalizeText(text: string): string {
  let normalized = text.toLowerCase();
  
  // Replace multi-word synonyms first (longer first)
  const multiWord = Object.entries(SYNONYM_MAP)
    .filter(([key]) => key.includes(' '))
    .sort((a, b) => b[0].length - a[0].length);
  
  for (const [synonym, canonical] of multiWord) {
    normalized = normalized.replace(new RegExp(synonym, 'g'), canonical);
  }
  
  // Replace single-word synonyms
  const words = normalized.split(/\s+/);
  const normalizedWords = words.map(word => 
    SYNONYM_MAP[word] || word
  );
  
  return normalizedWords.join(' ');
}

/**
 * Auto-correct typos with fuzzy matching
 */
export function autoCorrect(text: string): { corrected: string; hasFix: boolean; suggestions?: string[] } {
  const lower = text.toLowerCase().trim();
  
  // Exact match in hardcoded corrections
  if (TYPO_CORRECTIONS[lower]) {
    return { corrected: TYPO_CORRECTIONS[lower], hasFix: true };
  }
  
  // Partial match at start
  for (const [typo, correction] of Object.entries(TYPO_CORRECTIONS)) {
    if (lower.startsWith(typo + ' ')) {
      const rest = text.substring(typo.length).trim();
      return { corrected: `${correction} ${rest}`, hasFix: true };
    }
  }
  
  // FUZZY MATCHING: Try to find close matches in known commands
  const allCommands = [...DIRECT_COMMANDS, ...Object.values(ACTION_KEYWORDS).flat()];
  const firstWord = lower.split(' ')[0];
  
  const fuzzyMatch = findClosestMatch(firstWord, allCommands, 0.7);
  if (fuzzyMatch) {
    const rest = text.split(' ').slice(1).join(' ');
    const corrected = rest ? `${fuzzyMatch.match} ${rest}` : fuzzyMatch.match;
    const suggestions = getSuggestions(firstWord, allCommands, 3, 0.6);
    return { corrected, hasFix: true, suggestions };
  }
  
  return { corrected: text, hasFix: false };
}

/**
 * Extract action from text
 */
export function extractAction(text: string): string | null {
  const lower = text.toLowerCase();
  
  for (const [category, actions] of Object.entries(ACTION_KEYWORDS)) {
    for (const action of actions) {
      if (lower.includes(action)) {
        // Return canonical form
        return SYNONYM_MAP[action] || action;
      }
    }
  }
  
  return null;
}

/**
 * Extract target type from text
 */
export function extractTarget(text: string): string | null {
  const lower = text.toLowerCase();
  
  // Check file types
  if (TARGET_KEYWORDS.fileTypes.some(type => lower.includes(type))) {
    return 'file';
  }
  
  // Check directory types
  if (TARGET_KEYWORDS.directoryTypes.some(type => lower.includes(type))) {
    return 'directory';
  }
  
  return null;
}

/**
 * Extract target name (filename/path)
 */
export function extractTargetName(text: string): string | null {
  // Pattern: "named X" or "called X"
  const namedMatch = text.match(/(?:named|called)\s+([a-zA-Z0-9._-]+)/);
  if (namedMatch) {
    return namedMatch[1];
  }
  
  // Pattern: "create file X"
  const directMatch = text.match(/(?:create|make|build)\s+(?:a\s+)?(?:file|folder)\s+([a-zA-Z0-9._-]+)/);
  if (directMatch) {
    return directMatch[1];
  }
  
  // Pattern: file extension at end
  const extMatch = text.match(/([a-zA-Z0-9._-]+\.[a-z]{2,4})$/);
  if (extMatch) {
    return extMatch[1];
  }
  
  return null;
}

/**
 * Extract location from text
 */
export function extractLocation(text: string): string | null {
  const lower = text.toLowerCase();
  
  for (const location of TARGET_KEYWORDS.locations) {
    if (lower.includes(location)) {
      // Normalize location
      if (location === '~') return 'home';
      if (location === './') return 'current';
      return location;
    }
  }
  
  return null;
}

/**
 * Main parsing function - extract intent WITHOUT LLM
 */
export function parseIntent(input: string): ParsedIntent {
  const original = input;
  
  // Step 1: Auto-correct typos
  const { corrected, hasFix } = autoCorrect(input);
  let text = corrected;
  
  // Step 2: Remove politeness
  text = removePoliteness(text);
  
  // Step 3: Normalize with synonyms
  const normalized = normalizeText(text);
  const lower = normalized.toLowerCase();
  
  // Step 4: Determine intent type
  let type: ParsedIntent['type'] = 'unknown';
  let confidence = 0;
  
  // Check for fix requests (72% fallback system)
  if (lower.includes('fix') || lower.includes('repair') || lower.includes('debug') || lower.includes('error') || lower.includes('autofix')) {
    type = 'fix_request';
    confidence = 0.95;
  }
  // Check for script building
  else if (lower.includes('build') || lower.includes('create') || lower.includes('generate') || lower.includes('make')) {
    if (lower.includes('script') || lower.includes('code') || lower.includes('file') || lower.includes('program')) {
      type = 'script_build';
      confidence = 0.92;
    } else {
      type = 'action';
      confidence = 0.8;
    }
  }
  // Direct commands
  else if (isDirectCommand(normalized)) {
    type = 'direct_command';
    confidence = 1.0;
  }
  // Questions
  else if (isQuestion(text)) {
    type = 'question';
    confidence = 0.9;
  }
  // General queries
  else if (lower.includes('what') || lower.includes('how') || lower.includes('why') || lower.includes('show')) {
    type = 'query';
    confidence = 0.85;
  }
  // Other actions
  else if (isAction(normalized)) {
    type = 'action';
    confidence = 0.8;
  }
  
  // Step 5: Extract action details (if action)
  let action: string | undefined;
  let target: string | undefined;
  let targetName: string | undefined;
  let location: string | undefined;
  
  if (type === 'action') {
    action = extractAction(normalized) || undefined;
    target = extractTarget(normalized) || undefined;
    targetName = extractTargetName(text) || undefined;
    location = extractLocation(normalized) || undefined;
  }
  
  // Step 6: Build suggestions (if typos fixed)
  const suggestions = hasFix ? [corrected] : undefined;
  
  return {
    type,
    intent: type,  // Alias for compatibility with workflow
    action,
    target,
    targetName,
    location,
    confidence,
    normalized,
    original,
    suggestions
  };
}

/**
 * Convert intent to command string
 */
export function intentToCommand(intent: ParsedIntent): string {
  if (intent.type === 'direct_command') {
    return intent.normalized;
  }
  
  if (intent.type === 'action' && intent.action) {
    const parts = [intent.action];
    
    if (intent.target) {
      parts.push(intent.target);
    }
    
    if (intent.targetName) {
      parts.push(intent.targetName);
    }
    
    if (intent.location) {
      parts.push(`in ${intent.location}`);
    }
    
    return parts.join(' ');
  }
  
  return intent.normalized;
}

/**
 * Check if intent needs LLM
 * - Questions always need LLM for answer
 * - Complex actions may need LLM for confirmation
 * - Direct commands NEVER need LLM
 */
export function needsLLM(intent: ParsedIntent): boolean {
  // Direct commands are 100% deterministic
  if (intent.type === 'direct_command') {
    return false;
  }
  
  // Questions need LLM for answer
  if (intent.type === 'question') {
    return true;
  }
  
  // Simple actions with clear targets don't need LLM
  if (intent.type === 'action' && intent.action && intent.targetName) {
    return false;
  }
  
  // Unknown or ambiguous need LLM
  return intent.confidence < 0.7;
}

/**
 * Format intent for display
 */
export function formatIntent(intent: ParsedIntent): string {
  const parts: string[] = [];
  
  parts.push(`Type: ${intent.type}`);
  parts.push(`Confidence: ${(intent.confidence * 100).toFixed(0)}%`);
  
  if (intent.action) parts.push(`Action: ${intent.action}`);
  if (intent.target) parts.push(`Target: ${intent.target}`);
  if (intent.targetName) parts.push(`Name: ${intent.targetName}`);
  if (intent.location) parts.push(`Location: ${intent.location}`);
  if (intent.suggestions) parts.push(`Suggestions: ${intent.suggestions.join(', ')}`);
  
  return parts.join(' | ');
}

/**
 * IntentParser class wrapper for compatibility
 * Exposes the parser functions as class methods
 */
export class IntentParser {
  /**
   * Parse user input into intent
   */
  async parseIntent(input: string): Promise<ParsedIntent> {
    return parseIntent(input);
  }
  
  /**
   * Convert intent to command string
   */
  toCommand(intent: ParsedIntent): string {
    return intentToCommand(intent);
  }
  
  /**
   * Check if intent requires LLM
   */
  requiresLLM(intent: ParsedIntent): boolean {
    return needsLLM(intent);
  }
  
  /**
   * Format intent for display
   */
  format(intent: ParsedIntent): string {
    return formatIntent(intent);
  }
}
