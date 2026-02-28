#!/usr/bin/env python3
"""
🔑 Command Keywords Dictionary
Centralized keyword definitions for natural language command detection
"""

# Question indicators - phrases that indicate the user is asking for information
QUESTION_KEYWORDS = {
    'starts': ['how', 'what', 'why', 'when', 'where', 'who'],
    'contains': ['how do i', 'what is', 'explain', 'tell me', 'define']
}

# Action indicators - words that suggest the user wants something done
ACTION_KEYWORDS = {
    'creation': ['create', 'build', 'make', 'new', 'setup', 'initialize', 'generate', 'put', 'add', 'place', 'write'],
    'deletion': ['delete', 'remove', 'rm', 'trash', 'uninstall'],
    'modification': ['move', 'rename', 'copy', 'cp', 'mv', 'edit', 'update', 'relocate', 'transfer'],
    'file_operations': ['read', 'show', 'cat', 'view', 'open', 'write', 'append', 'list', 'ls'],
    'search': ['find', 'search', 'locate', 'where is', 'show me'],
    'execution': ['run', 'execute', 'launch', 'start'],
    'fixing': ['fix', 'repair', 'debug'],
    'watching': ['watch', 'daemon', 'daemon watch'],
    'installation': ['install', 'setup', 'download'],
    'github': ['upload', 'update', 'sync', 'push', 'link'],
    'environment': ['activate', 'envs', 'environments'],
    'system': ['help', 'info', 'memory', 'clear', 'exit', 'quit']
}

# Target types - what the action applies to
TARGET_KEYWORDS = {
    'file_types': ['file', '.py', '.js', '.txt', '.md', '.json', '.yaml', '.sh', '.html', '.css', '.ts', '.jsx', '.tsx', '.go', '.rs', '.java', '.c', '.cpp', '.h'],
    'directory_types': ['folder', 'directory', 'dir'],
    'script_types': ['script', 'python', 'javascript', 'bash', 'typescript'],
    'locations': ['desktop', 'home', 'documents', 'downloads', 'current']
}

# Test commands - should not trigger creation logic
TEST_COMMAND_PATTERNS = [
    'test',
    'tinyllama test',
    'mistral test', 
    'llama3.2 test',
    'deepseek test',
    'run test',
    'short test',
    'quick test'
]

# Direct command prefixes - commands that should execute immediately
DIRECT_COMMANDS = {
    'file_ops': ['create file', 'create folder', 'delete', 'move', 'copy', 'open', 'read', 'list', 'find'],
    'llm': ['llm list', 'llm enable', 'llm disable', 'models info', 'llm list all', 'llm enable all', 'llm disable all', 'llm enable tier', 'llm disable tier'],
    'system': ['help', 'exit', 'quit', 'clear', 'pwd', 'cd', 'info', 'memory', 'mainmenu', 'main menu'],
    'install': ['install', 'uninstall', 'install core models', 'install all models', 'install tier 0', 'install tier 1', 'install tier 2', 'install tier 3', 'install tier 4'],
    'dev': ['run', 'build', 'test', 'fix', 'daemon', 'watch', 'daemon watch', 'short test', 'test suite'],
    'github': ['github link', 'github upload', 'github update', 'github status', 'github projects'],
    'environment': ['environments', 'envs', 'env search', 'activate', 'env activate'],
    'models': ['backup models', 'show backup models'],
    'mode': ['diabolical mode', 'diabolical exit']
}

# Politeness phrases - optional words that should be ignored in parsing
POLITENESS_PHRASES = [
    'can you',
    'could you', 
    'please',
    'would you',
    'i want to',
    'i need to',
    'i would like to',
    'help me',
    'just',
    'we just',
    'that we just'
]

# Location specifications
LOCATION_PATTERNS = {
    'desktop': r'(?:on|in|to)\s+(?:my\s+)?(?:the\s+)?desktop',
    'home': r'(?:on|in|to)\s+(?:my\s+)?(?:the\s+)?home',
    'documents': r'(?:on|in|to)\s+(?:my\s+)?(?:the\s+)?documents',
    'downloads': r'(?:on|in|to)\s+(?:my\s+)?(?:the\s+)?downloads'
}

# Filename extraction patterns
FILENAME_PATTERNS = {
    'named': r'(?:named|called)\s+([\\w.-]+)',
    'create_direct': r'(?:create|make|build)\s+(?:a\s+)?(?:file|folder)\s+([\\w.-]+)',
    'with_location': r'(?:create|make|build)\s+(?:a\s+)?(?:file|folder)\s+(?:on|in)\s+.*?\s+(?:named|called)\s+([\\w.-]+)'
}

# Synonym mappings - different words that mean the same thing
SYNONYM_MAP = {
    # Creation synonyms
    'generate': 'create',
    'make': 'create',
    'build': 'create',
    'add': 'create',
    'new': 'create',
    'setup': 'create',
    'initialize': 'create',
    'init': 'create',
    'start': 'create',
    
    # Deletion synonyms
    'remove': 'delete',
    'rm': 'delete',
    'trash': 'delete',
    'erase': 'delete',
    'destroy': 'delete',
    'discard': 'delete',
    
    # Movement/copy synonyms
    'rename': 'move',
    'mv': 'move',
    'relocate': 'move',
    'transfer': 'move',
    'mve': 'move',
    'mov': 'move',
    'cp': 'copy',
    'duplicate': 'copy',
    'clone': 'copy',
    
    # View/read synonyms
    'show': 'read',
    'display': 'read',
    'cat': 'read',
    'view': 'read',
    'see': 'read',
    'look at': 'read',
    'print': 'read',
    
    # Search synonyms
    'locate': 'find',
    'search': 'find',
    'look for': 'find',
    'where is': 'find',
    'search for': 'find',
    
    # File type synonyms
    'document': 'file',
    'doc': 'file',
    'script': 'file',
    'code': 'file',
    'text file': 'file',
    'python file': 'file',
    'js file': 'file',
    
    # Directory synonyms
    'folder': 'directory',
    'dir': 'directory',
    'path': 'directory',
    
    # Location synonyms
    'desktop': 'desktop',
    'home': 'home',
    'docs': 'documents',
    'downloads': 'downloads',
    'my desktop': 'desktop',
    'my home': 'home',
    
    # Action synonyms
    'execute': 'run',
    'launch': 'run',
    'start': 'run',
    'compile': 'build',
    'fix': 'repair',
    'repair': 'fix',
    'debug': 'fix',
    'append': 'write',
    'add to': 'write',
    'put in': 'write',
    'setup': 'install',
    'download': 'install',
    'get': 'install',
    'activate': 'activate',
    'enable': 'enable',
    'disable': 'disable',
    'upload': 'upload',
    'push': 'upload',
    'sync': 'update',
    'link': 'link',
    
    # Question synonyms
    'explain': 'what is',
    'describe': 'what is',
    'tell me about': 'what is',
    'inform me': 'what is'
}

# Model installation commands - comprehensive list from all tiers
MODEL_INSTALL_COMMANDS = [
    # Tier 0 - Basic (1-2B)
    'tinyllama', 'phi-2', 'stablelm', 'orca-mini',
    
    # Tier 1 - General (3-8B)
    'llama3.2', 'llama2', 'phi-3', 'gemma', 'gemma2', 'vicuna', 'orca-2', 'openchat', 'starling',
    
    # Tier 2 - Advanced (7-13B)
    'mistral', 'mixtral', 'llama3', 'llama3.1', 'codellama', 'qwen', 'qwen2', 'yi', 'solar', 'neural-chat',
    
    # Tier 3 - Expert (13-34B)
    'deepseek', 'deepseek-coder-33b', 'codellama-13b', 'codellama-34b', 'wizardcoder', 'wizardcoder-33b',
    'wizardlm', 'yi-34b', 'qwen-14b', 'dolphin', 'nous-hermes', 'phind-codellama',
    
    # Tier 4 - Ultra-Expert (70B+)
    'llama3-70b', 'llama3.1-70b', 'mixtral-8x22b', 'qwen-72b', 'qwen2-72b'
]

# Common typos and autocorrections
TYPO_CORRECTIONS = {
    # LLM commands
    'llm enble': 'llm enable',
    'llm enbale': 'llm enable',
    'llm enabel': 'llm enable',
    'llm disbale': 'llm disable',
    'llm disble': 'llm disable',
    'llm diable': 'llm disable',
    'llm disabel': 'llm disable',
    'llm lst': 'llm list',
    'llm lsit': 'llm list',
    'llm lits': 'llm list',
    'instal': 'install',
    'instll': 'install',
    'isntall': 'install',
    
    # Common commands
    'hlep': 'help',
    'hlp': 'help',
    'hepl': 'help',
    'hep': 'help',
    'exti': 'exit',
    'quit': 'exit',
    'q': 'exit',
    
    # File operations
    'delte': 'delete',
    'deletee': 'delete',
    'dleete': 'delete',
    'mve': 'move',
    'mov': 'move',
    'mvoe': 'move',
    'moev': 'move',
    'cpy': 'copy',
    'cpoy': 'copy',
    'crate': 'create',
    'creat': 'create',
    'craete': 'create',
    'ceate': 'create',
    'wrtie': 'write',
    'wirte': 'write',
    'wriet': 'write',
    
    # Model names
    'mistrl': 'mistral',
    'mistrall': 'mistral',
    'lama': 'llama',
    'tinylama': 'tinyllama',
    'deepseak': 'deepseek',
    'deapseek': 'deepseek',
    'qwan': 'qwen',
    'gemma2': 'gemma2',
    'stablellm': 'stablelm'
}


def is_question(text: str) -> bool:
    """Check if input appears to be a question."""
    text_lower = text.lower().strip()
    
    # Check starting words
    if any(text_lower.startswith(q) for q in QUESTION_KEYWORDS['starts']):
        return True
    
    # Check contains patterns
    if any(phrase in text_lower for phrase in QUESTION_KEYWORDS['contains']):
        return True
    
    # Check for question mark (but not if it has action words)
    if '?' in text and not any(action in text_lower for action in ACTION_KEYWORDS['creation']):
        return True
    
    return False


def is_action_request(text: str) -> bool:
    """Check if input is requesting an action."""
    text_lower = text.lower().strip()
    
    # Check for any action keywords
    all_actions = []
    for action_list in ACTION_KEYWORDS.values():
        all_actions.extend(action_list)
    
    return any(action in text_lower for action in all_actions)


def is_test_command(text: str) -> bool:
    """Check if input is a test command (not a file named 'test')."""
    text_lower = text.lower().strip()
    
    # Match test command patterns
    return any(text_lower.startswith(pattern) for pattern in TEST_COMMAND_PATTERNS)


def extract_politeness(text: str) -> str:
    """Remove politeness phrases to get core command."""
    text_lower = text.lower()
    
    for phrase in POLITENESS_PHRASES:
        if text_lower.startswith(phrase):
            # Remove the phrase and clean up spacing
            text = text[len(phrase):].strip()
            text_lower = text.lower()
    
    return text


def normalize_text(text: str) -> str:
    """Normalize text by replacing synonyms with canonical forms."""
    text_lower = text.lower()
    
    # Replace multi-word synonyms first (longer phrases first)
    multi_word_synonyms = {k: v for k, v in SYNONYM_MAP.items() if ' ' in k}
    for synonym, canonical in sorted(multi_word_synonyms.items(), key=lambda x: len(x[0]), reverse=True):
        if synonym in text_lower:
            text_lower = text_lower.replace(synonym, canonical)
    
    # Replace single-word synonyms
    words = text_lower.split()
    normalized_words = []
    for word in words:
        if word in SYNONYM_MAP:
            normalized_words.append(SYNONYM_MAP[word])
        else:
            normalized_words.append(word)
    
    return ' '.join(normalized_words)


def get_autocorrection(text: str) -> str:
    """Get autocorrected version of text if typo detected."""
    text_lower = text.lower().strip()
    
    # Check for exact matches
    if text_lower in TYPO_CORRECTIONS:
        return TYPO_CORRECTIONS[text_lower]
    
    # Check for partial matches at start
    for typo, correction in TYPO_CORRECTIONS.items():
        if text_lower.startswith(typo + ' '):
            rest = text[len(typo):].strip()
            return f"{correction} {rest}"
    
    return text


def is_model_install_command(text: str) -> bool:
    """Check if command is a model installation request."""
    text_lower = text.lower().strip()
    
    # Check for 'install' keyword
    if not text_lower.startswith('install '):
        return False
    
    # Extract the model name after 'install '
    model_name = text_lower[8:].strip()  # Skip 'install '
    
    # Check if it's a known model
    return model_name in MODEL_INSTALL_COMMANDS


def get_model_tier(model_name: str) -> int:
    """Get the tier number for a model name."""
    model_lower = model_name.lower().strip()
    
    # Tier 0 - Basic (1-2B)
    if model_lower in ['tinyllama', 'phi-2', 'stablelm', 'orca-mini']:
        return 0
    
    # Tier 1 - General (3-8B)
    elif model_lower in ['llama3.2', 'llama2', 'phi-3', 'gemma', 'gemma2', 'vicuna', 'orca-2', 'openchat', 'starling']:
        return 1
    
    # Tier 2 - Advanced (7-13B)
    elif model_lower in ['mistral', 'mixtral', 'llama3', 'llama3.1', 'codellama', 'qwen', 'qwen2', 'yi', 'solar', 'neural-chat']:
        return 2
    
    # Tier 3 - Expert (13-34B)
    elif model_lower in ['deepseek', 'deepseek-coder-33b', 'codellama-13b', 'codellama-34b', 'wizardcoder', 'wizardcoder-33b', 'wizardlm', 'yi-34b', 'qwen-14b', 'dolphin', 'nous-hermes', 'phind-codellama']:
        return 3
    
    # Tier 4 - Ultra-Expert (70B+)
    elif model_lower in ['llama3-70b', 'llama3.1-70b', 'mixtral-8x22b', 'qwen-72b', 'qwen2-72b']:
        return 4
    
    # Unknown model
    return -1


if __name__ == "__main__":
    # Test the keyword system
    print("🔑 Testing Command Keywords System\n")
    
    print("=" * 70)
    print("Synonym Normalization Tests")
    print("=" * 70)
    
    synonym_tests = [
        "generate a file named test.py",
        "make a document called readme.txt",
        "erase the old folder",
        "show me the config file",
        "locate my desktop folder",
    ]
    
    for text in synonym_tests:
        normalized = normalize_text(text)
        print(f"Original:   '{text}'")
        print(f"Normalized: '{normalized}'")
        print()
    
    print("=" * 70)
    print("Command Classification Tests")
    print("=" * 70)
    
    test_cases = [
        ("how do I create a file?", "question"),
        ("can you make a file named test.py", "action"),
        ("create file test.py", "action"),
        ("mistral test", "test_command"),
        ("generate a document", "action"),
        ("explain what python is", "question"),
    ]
    
    for text, expected in test_cases:
        is_q = is_question(text)
        is_a = is_action_request(text)
        is_t = is_test_command(text)
        
        result = "question" if is_q else ("action" if is_a else ("test" if is_t else "unknown"))
        status = "✅" if result == expected else "❌"
        
        print(f"{status} '{text}'")
        print(f"   Expected: {expected}, Got: {result}")
        print()
