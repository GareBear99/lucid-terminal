#!/usr/bin/env python3
"""
📚 Simple Knowledge Base
Provides instant answers for common queries without LLM processing
"""

# Simple definitions for common terms
DEFINITIONS = {
    # Terminal commands
    "ls": "A Unix/Linux command that lists directory contents. Usage: ls [options] [directory]",
    "cd": "Change Directory - command to navigate between folders in the file system.",
    "pwd": "Print Working Directory - shows your current location in the file system.",
    "mkdir": "Make Directory - creates a new folder.",
    "rm": "Remove - deletes files or directories (use with caution!).",
    "cp": "Copy - duplicates files or directories.",
    "mv": "Move - moves or renames files and directories.",
    "cat": "Concatenate - displays file contents in the terminal.",
    "grep": "A Unix command-line utility for searching text using patterns. It searches files for lines matching a regular expression.",
    "chmod": "Change Mode - modifies file permissions (read, write, execute).",
    "sudo": "SuperUser DO - executes commands with administrative privileges.",
    "touch": "Creates an empty file or updates the timestamp of an existing file.",
    
    # Programming concepts
    "algorithm": "A step-by-step procedure or formula for solving a problem or completing a task.",
    "api": "Application Programming Interface - a set of rules and protocols for building and interacting with software applications.",
    "variable": "A named storage location in programming that holds a value which can change.",
    "function": "A reusable block of code that performs a specific task.",
    "loop": "A programming construct that repeats a set of instructions until a condition is met.",
    "array": "A data structure that stores a collection of elements in sequential order.",
    "string": "A sequence of characters used to represent text in programming.",
    "integer": "A whole number (positive, negative, or zero) without a decimal point.",
    "boolean": "A data type with only two possible values: true or false.",
    "class": "A blueprint for creating objects in object-oriented programming.",
    "object": "An instance of a class containing data and methods.",
    
    # Programming languages
    "python": "A high-level, interpreted programming language known for its simplicity and readability.",
    "javascript": "A programming language primarily used for web development and interactive websites.",
    "java": "A class-based, object-oriented programming language designed for portability.",
    "c++": "A powerful, compiled programming language with low-level memory manipulation.",
    "rust": "A systems programming language focused on safety, speed, and concurrency.",
    "go": "A statically typed, compiled language designed for simplicity and efficiency.",
    "typescript": "A typed superset of JavaScript that compiles to plain JavaScript.",
    
    # Tools and systems
    "git": "A distributed version control system for tracking changes in source code during software development.",
    "docker": "A platform for developing, shipping, and running applications in containers.",
    "kubernetes": "An open-source container orchestration platform for automating deployment and scaling.",
    "npm": "Node Package Manager - the default package manager for JavaScript and Node.js.",
    "bash": "Bourne Again SHell - a Unix shell and command language.",
    "vim": "A highly configurable text editor built for efficient text editing.",
    "vscode": "Visual Studio Code - a popular, lightweight code editor by Microsoft.",
    
    # Data formats
    "json": "JavaScript Object Notation - a lightweight data interchange format that is easy to read and write.",
    "xml": "Extensible Markup Language - a markup language for encoding documents.",
    "yaml": "YAML Ain't Markup Language - a human-readable data serialization language.",
    "csv": "Comma-Separated Values - a simple file format for storing tabular data.",
    
    # Concepts
    "terminal": "A text-based interface for interacting with a computer's operating system through commands.",
    "regex": "Regular Expression - a sequence of characters that define a search pattern, mainly used for string matching.",
    "recursion": "A programming technique where a function calls itself to solve a problem.",
    "debugging": "The process of finding and fixing errors or bugs in code.",
    "compiler": "A program that translates source code into machine code.",
    "interpreter": "A program that executes code directly without compiling it first.",
    
    # Abstract words
    "serendipity": "The occurrence of finding pleasant or valuable things by chance; happy accident or fortunate discovery.",
    "ephemeral": "Lasting for a very short time; temporary or transient.",
    "paradigm": "A typical pattern or model; a framework for understanding.",
    "recursive": "Relating to or involving the repeated application of a process or rule.",
}

# Command usage examples
COMMAND_USAGE = {
    "ls": "List files: ls -la (shows all files with details)",
    "grep": "Search files: grep 'pattern' filename",
    "cd": "Change directory: cd /path/to/directory or cd .. (go up one level)",
    "mkdir": "Make directory: mkdir new_folder or mkdir -p path/to/nested/folder",
    "touch": "Create file: touch filename.txt",
    "cat": "View file: cat filename.txt",
    "pwd": "Print working directory - shows current location",
    "rm": "Remove file: rm filename (use with caution!) or rm -rf folder/ (recursive)",
    "cp": "Copy file: cp source destination or cp -r folder/ new_location/",
    "mv": "Move/rename file: mv source destination",
    "chmod": "Change permissions: chmod 755 script.sh (rwx for owner, rx for others)",
    "sudo": "Run as admin: sudo command (requires password)",
    "find": "Find files: find /path -name 'filename'",
    "ps": "Show processes: ps aux (list all running processes)",
    "kill": "Stop process: kill PID or kill -9 PID (force)",
    "tar": "Archive files: tar -czf archive.tar.gz folder/",
    "wget": "Download file: wget URL",
    "curl": "Transfer data: curl URL or curl -O URL (save file)",
    "ssh": "Secure shell: ssh user@hostname",
    "git": "Version control: git status, git add, git commit, git push",
    "docker": "Container tool: docker run, docker ps, docker stop",
    "npm": "Package manager: npm install package-name",
    "pip": "Python packages: pip install package-name",
}

def _fuzzy_match_term(query_term: str, known_terms: dict) -> tuple:
    """
    Find the best fuzzy match for a term.
    Returns (matched_term, confidence_score)
    """
    from difflib import SequenceMatcher
    
    best_match = None
    best_score = 0.0
    
    for term in known_terms.keys():
        # Calculate similarity
        score = SequenceMatcher(None, query_term, term).ratio()
        
        # Also check if query is a substring or vice versa
        if query_term in term or term in query_term:
            score = max(score, 0.8)
        
        if score > best_score:
            best_score = score
            best_match = term
    
    # Only return if confidence is high enough
    if best_score >= 0.7:
        return (best_match, best_score)
    
    return (None, 0.0)

def handle_simple_query(query: str) -> str:
    """
    Handle simple knowledge queries with keyword matching and fuzzy matching.
    Returns response string or empty string if not matched.
    """
    query_lower = query.lower().strip()
    
    # "What is X?" patterns
    if query_lower.startswith("what is ") or query_lower.startswith("what's "):
        term = query_lower.replace("what is ", "").replace("what's ", "").strip("?").strip()
        
        # Check exact match in definitions
        if term in DEFINITIONS:
            return DEFINITIONS[term]
        
        # Check exact match in commands
        if term in COMMAND_USAGE:
            definition = COMMAND_USAGE.get(term, f"{term.upper()} is a command-line utility.")
            return definition
        
        # Try fuzzy matching
        matched_def, score_def = _fuzzy_match_term(term, DEFINITIONS)
        matched_cmd, score_cmd = _fuzzy_match_term(term, COMMAND_USAGE)
        
        # Use the best match
        if score_def > score_cmd and matched_def:
            return f"(Did you mean '{matched_def}'?) {DEFINITIONS[matched_def]}"
        elif matched_cmd:
            return f"(Did you mean '{matched_cmd}'?) {COMMAND_USAGE[matched_cmd]}"
    
    # "Define X" patterns
    if query_lower.startswith("define "):
        term = query_lower.replace("define the word ", "").replace("define ", "").strip("'\"?").strip()
        
        # Exact match
        if term in DEFINITIONS:
            return DEFINITIONS[term]
        
        # Fuzzy match
        matched, score = _fuzzy_match_term(term, DEFINITIONS)
        if matched:
            return f"(Did you mean '{matched}'?) {DEFINITIONS[matched]}"
    
    # "Explain X" patterns
    if "explain " in query_lower:
        # Extract term after "explain"
        parts = query_lower.split("explain ")
        if len(parts) > 1:
            term = parts[1].split()[0].strip("'\"?,")
            
            # Exact match
            if term in DEFINITIONS:
                response = DEFINITIONS[term]
                # If they want "in one sentence", keep it brief
                if "one sentence" in query_lower or "briefly" in query_lower:
                    # Take first sentence
                    response = response.split('.')[0] + '.'
                return response
            
            if term in COMMAND_USAGE:
                return COMMAND_USAGE[term]
            
            # Fuzzy match
            matched_def, score_def = _fuzzy_match_term(term, DEFINITIONS)
            matched_cmd, score_cmd = _fuzzy_match_term(term, COMMAND_USAGE)
            
            if score_def > score_cmd and matched_def:
                response = DEFINITIONS[matched_def]
                if "one sentence" in query_lower:
                    response = response.split('.')[0] + '.'
                return f"(Did you mean '{matched_def}'?) {response}"
            elif matched_cmd:
                return f"(Did you mean '{matched_cmd}'?) {COMMAND_USAGE[matched_cmd]}"
    
    # "What does X mean?" patterns
    if "mean" in query_lower or "meaning of" in query_lower:
        for term, definition in DEFINITIONS.items():
            if term in query_lower:
                return definition
    
    # "How do I X?" patterns
    if query_lower.startswith("how do i ") or query_lower.startswith("how to "):
        if "create a file" in query_lower or "make a file" in query_lower:
            return "To create a file, you can use: touch filename.txt (creates empty file) or echo 'content' > filename.txt (creates with content)"
        
        if "create a folder" in query_lower or "make a folder" in query_lower or "create a directory" in query_lower:
            return "To create a folder/directory, use: mkdir folder_name"
        
        if "list files" in query_lower:
            return "To list files, use: ls (basic) or ls -la (detailed with hidden files)"
        
        if "delete" in query_lower or "remove" in query_lower:
            return "To delete a file: rm filename. To delete a directory: rm -r foldername (use with caution!)"
    
    # "Compare X and Y" patterns
    if "compare" in query_lower:
        if "ls" in query_lower and "dir" in query_lower:
            return "ls (Unix/Linux/macOS) and dir (Windows) both list directory contents. ls is more common on Unix systems, dir on Windows. They serve the same basic purpose but have different options and syntax."
    
    # Greetings - only match if it's JUST a greeting
    greetings = ["hello", "hi", "hey", "greetings", "good morning", "good afternoon", "good evening"]
    # Check if query is basically just a greeting (not part of a longer phrase)
    if len(query_lower.split()) <= 3:
        if any(query_lower.startswith(g) or query_lower == g for g in greetings):
            return "Hello! I'm LuciferAI. How can I help you today?"
    
    return ""  # Not matched

def handle_memory_query(query: str, conversation_history: list) -> str:
    """
    Handle memory-related queries by searching conversation history.
    Returns response or empty string if not a memory query.
    """
    query_lower = query.lower().strip()
    
    # Memory recall patterns (questions only, not statements)
    memory_recall_patterns = [
        "what's my name",
        "what is my name", 
        "what do i like",
        "what do you know about me",
        "tell me about my",
        "what are my",
        "when is my birthday",
        "what's my sign",
    ]
    
    # Don't trigger on statements (setting facts)
    statement_patterns = [
        "my name is",
        "i like",
        "i have",
        "i work",
        "i prefer",
        "i wake up",
        "my birthday is",
        "i'm a",
        "i am",
    ]
    
    # Check if it's a statement (setting a fact) - don't handle those
    if any(pattern in query_lower for pattern in statement_patterns):
        return ""
    
    is_memory_query = any(pattern in query_lower for pattern in memory_recall_patterns)
    
    if not is_memory_query:
        return ""
    
    # Search through conversation history for relevant facts
    facts = []
    
    for msg in conversation_history:
        if msg.get('role') == 'user':
            content = msg.get('content', '').lower()
            
            # Extract facts from user statements
            if "my name is " in content:
                name = content.split("my name is ")[1].split()[0].strip(".,!?").capitalize()
                facts.append(f"Your name is {name}")
            
            if "i like " in content:
                interest = content.split("i like ")[1].strip(".,!?")
                facts.append(f"You like {interest}")
            
            if "i work as " in content or "i'm a " in content:
                if "i work as " in content:
                    job = content.split("i work as ")[1].split("and")[0].strip(".,!?")
                    facts.append(f"You work as {job}")
                if "i'm " in content and " years old" in content:
                    parts = content.split("i'm ")[1]
                    if " years old" in parts:
                        age = parts.split(" years old")[0].strip().split()[-1]
                        facts.append(f"You are {age} years old")
            
            if "i have a " in content:
                # Extract pet info
                if "cat named " in content:
                    cat_name = content.split("cat named ")[1].split()[0].strip(".,!?")
                    facts.append(f"You have a cat named {cat_name}")
                if "dog named " in content:
                    dog_name = content.split("dog named ")[1].split()[0].strip(".,!?and")
                    facts.append(f"You have a dog named {dog_name}")
            
            if "i prefer " in content:
                preference = content.split("i prefer ")[1].split("over")[0].strip()
                if "over" in content:
                    alternative = content.split("over ")[1].split("and")[0].strip(".,!?")
                    facts.append(f"You prefer {preference} over {alternative}")
                else:
                    facts.append(f"You prefer {preference}")
            
            if "i wake up at " in content:
                time = content.split("i wake up at ")[1].split()[0].strip(".,!?")
                facts.append(f"You wake up at {time}")
            
            if "birthday" in content and ("is " in content or "on " in content):
                if " is " in content:
                    date = content.split(" is ")[1].split("and")[0].strip(".,!?")
                    facts.append(f"Your birthday is {date}")
                
                if "i'm a " in content.split("and")[-1]:
                    sign = content.split("i'm a ")[-1].strip(".,!?")
                    facts.append(f"Your zodiac sign is {sign}")
    
    if not facts:
        return "I don't have any information stored about that yet. Tell me something and I'll remember it!"
    
    # Format response based on query type
    if "name" in query_lower:
        name_facts = [f for f in facts if "name is" in f.lower()]
        return name_facts[0] if name_facts else "I don't know your name yet."
    
    elif "like" in query_lower:
        like_facts = [f for f in facts if "like" in f.lower()]
        return like_facts[0] if like_facts else "I don't know what you like yet."
    
    elif "pets" in query_lower or "pet" in query_lower:
        pet_facts = [f for f in facts if "cat" in f.lower() or "dog" in f.lower()]
        if pet_facts:
            return " ".join(pet_facts)
        return "I don't have information about your pets."
    
    elif "morning" in query_lower:
        morning_facts = [f for f in facts if "prefer" in f.lower() or "wake up" in f.lower()]
        if morning_facts:
            return " ".join(morning_facts)
        return "I don't have information about your morning routine."
    
    elif "birthday" in query_lower:
        birthday_facts = [f for f in facts if "birthday" in f.lower() or "sign" in f.lower()]
        if birthday_facts:
            return " ".join(birthday_facts)
        return "I don't know your birthday yet."
    
    else:
        # General "what do you know about me"
        return "\n".join(facts)
