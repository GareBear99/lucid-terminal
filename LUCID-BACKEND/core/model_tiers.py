#!/usr/bin/env python3
"""
Model Tier Mapping System
Maps all commonly known LLM models to their capability tiers
"""

# Comprehensive model tier mapping
# Tier 0: Basic chat, simple responses (1-2B parameters)
# Tier 1: Good general purpose (3-8B parameters)
# Tier 2: Advanced reasoning and coding (7-13B parameters)
# Tier 3: Expert level, complex tasks (13-34B parameters)
# Tier 4: Ultra-Expert, research-grade (70B+ parameters)

MODEL_TIERS = {
    # Tier 0 - Basic Models (1-2B params)
    'tinyllama': 0,
    'tiny': 0,
    'tinyllama-1.1b': 0,
    'phi-2': 0,
    'phi2': 0,
    'stablelm': 0,
    'stablelm-2': 0,
    'orca-mini': 0,
    'orca-mini-3b': 0,
    
    # Tier 1 - General Purpose (3-8B params)
    'llama2': 1,
    'llama-2': 1,
    'llama2-7b': 1,
    'phi-3': 1,
    'phi3': 1,
    'phi-3-mini': 1,
    'gemma': 1,
    'gemma-7b': 1,
    'gemma2': 1,
    'gemma-2-9b': 1,
    'vicuna': 1,
    'vicuna-7b': 1,
    'orca-2': 1,
    'orca-2-7b': 1,
    'openchat': 1,
    'openchat-3.5': 1,
    'starling': 1,
    'starling-7b': 1,
    
    # Tier 2 - Advanced (7-13B params)
    'mistral-7b': 2,
    'mistral-7b-instruct': 2,
    'mixtral': 2,
    'mixtral-8x7b': 2,
    'llama3': 2,
    'llama-3': 2,
    'llama3-8b': 2,
    'llama3.1': 2,
    'llama-3.1': 2,
    'llama3.1-8b': 2,
    'codellama': 2,
    'code-llama': 2,
    'codellama-7b': 2,
    'neural-chat': 2,
    'neural-chat-7b': 2,
    'solar': 2,
    'solar-10.7b': 2,
    'yi': 2,
    'yi-6b': 2,
    'qwen': 2,
    'qwen-7b': 2,
    'qwen2': 2,
    'qwen2-7b': 2,
    
    # Tier 3 - Expert (13-34B params)
    'deepseek-coder': 3,
    'deepseek': 3,
    'deepseek-coder-6.7b': 3,
    'deepseek-coder-33b': 3,
    'codellama-13b': 3,
    'codellama-34b': 3,
    'wizardcoder': 3,
    'wizardcoder-15b': 3,
    'wizardcoder-33b': 3,
    'wizardlm': 3,
    'wizardlm-13b': 3,
    'yi-34b': 3,
    'qwen-14b': 3,
    'dolphin': 3,
    'dolphin-mixtral': 3,
    'nous-hermes': 3,
    'nous-hermes-2': 3,
    'phind-codellama': 3,
    'phind-codellama-34b': 3,
    
    # Tier 4 - Ultra-Expert (70B+ params)
    'llama3-70b': 4,
    'llama3.1-70b': 4,
    'mixtral-8x22b': 4,
    'qwen-72b': 4,
    'qwen2-72b': 4,
}

def get_model_tier(model_name: str) -> int:
    """
    Get the tier for a given model name.
    
    Args:
        model_name: The name of the model (case-insensitive)
        
    Returns:
        int: Tier level (0-3), defaults to 0 if unknown
    """
    if not model_name:
        return 0
    
    # Normalize model name
    normalized = model_name.lower().strip()
    
    # Remove common suffixes/prefixes
    normalized = normalized.replace('_', '-')
    normalized = normalized.replace(' ', '-')
    
    # Direct lookup
    if normalized in MODEL_TIERS:
        return MODEL_TIERS[normalized]
    
    # Fuzzy matching for variants
    for known_model, tier in MODEL_TIERS.items():
        if known_model in normalized or normalized in known_model:
            return tier
    
    # Check for size indicators in name
    if any(x in normalized for x in ['70b', '72b', '8x22b']):
        return 4
    elif any(x in normalized for x in ['34b', '33b', '13b', '14b', '15b']):
        return 3
    elif any(x in normalized for x in ['7b', '8b', '9b', '10b', '8x7b']):
        return 2
    elif any(x in normalized for x in ['3b', '4b', '6b']):
        return 1
    elif any(x in normalized for x in ['1b', '2b']):
        return 0
    
    # Default to tier 0 for unknown models
    return 0

def get_tier_capabilities(tier: int) -> dict:
    """
    Get the capabilities description for a tier.
    
    Args:
        tier: Tier level (0-3)
        
    Returns:
        dict: Capabilities description
    """
    capabilities = {
        0: {
            'name': 'Basic',
            'params': '1-2B',
            'description': 'Simple chat and basic responses',
            'good_for': ['Greetings', 'Simple queries', 'Basic commands'],
            'limitations': ['Complex reasoning', 'Multi-step tasks', 'Code generation']
        },
        1: {
            'name': 'General Purpose',
            'params': '3-8B',
            'description': 'Good general purpose understanding',
            'good_for': ['Conversations', 'Explanations', 'Simple coding', 'File operations'],
            'limitations': ['Advanced reasoning', 'Large code projects', 'Deep analysis']
        },
        2: {
            'name': 'Advanced',
            'params': '7-13B',
            'description': 'Advanced reasoning and coding',
            'good_for': ['Code generation', 'Debugging', 'Multi-step tasks', 'Problem solving'],
            'limitations': ['Very complex architectures', 'Large-scale refactoring']
        },
        3: {
            'name': 'Expert',
            'params': '13-34B',
            'description': 'Expert level, complex tasks',
            'good_for': ['Full applications', 'Architecture design', 'Complex algorithms', 'Code review'],
            'limitations': ['Very large models', 'Extreme memory usage']
        },
        4: {
            'name': 'Ultra-Expert',
            'params': '70B+',
            'description': 'Research-grade, maximum capability',
            'good_for': ['Enterprise systems', 'Research projects', 'Production applications', 'Advanced reasoning'],
            'limitations': ['Requires 64GB+ RAM', 'Slower inference', 'Massive disk space']
        }
    }
    
    return capabilities.get(tier, capabilities[0])

def get_all_tiers() -> dict:
    """Get all tier information."""
    return {tier: get_tier_capabilities(tier) for tier in range(5)}

def list_models_by_tier(tier: int = None) -> dict:
    """
    List all models, optionally filtered by tier.
    
    Args:
        tier: Optional tier to filter by
        
    Returns:
        dict: Models grouped by tier
    """
    if tier is not None:
        return {
            tier: [model for model, t in MODEL_TIERS.items() if t == tier]
        }
    
    result = {0: [], 1: [], 2: [], 3: [], 4: []}
    for model, t in MODEL_TIERS.items():
        result[t].append(model)
    
    return result
