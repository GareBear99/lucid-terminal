#!/usr/bin/env python3
"""
🗺️ Model Files Mapping - Centralized model metadata
Maps all 85+ supported models to their GGUF files and download URLs
"""

# Model file mapping: model_name → GGUF filename
MODEL_FILES = {
    # ═══════════════════════════════════════════════════════════════
    # TIER 0: Basic Models (1-2B parameters)
    # ═══════════════════════════════════════════════════════════════
    'tinyllama': 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
    'tiny': 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
    'phi-2': 'phi-2-2.7b-Q4_K_M.gguf',
    'phi2': 'phi-2-2.7b-Q4_K_M.gguf',
    'stablelm': 'stablelm-2-1.6b-chat-Q4_K_M.gguf',
    'stablelm-2': 'stablelm-2-1.6b-chat-Q4_K_M.gguf',
    'orca-mini': 'orca-mini-3b-Q4_K_M.gguf',
    'orca-mini-3b': 'orca-mini-3b-Q4_K_M.gguf',
    
    # ═══════════════════════════════════════════════════════════════
    # TIER 1: General Purpose (3-8B parameters)
    # ═══════════════════════════════════════════════════════════════
    'llama3.2': 'llama-3.2-3b-instruct-Q4_K_M.gguf',
    'llama-3.2': 'llama-3.2-3b-instruct-Q4_K_M.gguf',
    'llama3.2-3b': 'llama-3.2-3b-instruct-Q4_K_M.gguf',
    'llama2': 'llama-2-7b-chat-Q4_K_M.gguf',
    'llama-2': 'llama-2-7b-chat-Q4_K_M.gguf',
    'llama2-7b': 'llama-2-7b-chat-Q4_K_M.gguf',
    'phi-3': 'phi-3-mini-4k-instruct-Q4_K_M.gguf',
    'phi3': 'phi-3-mini-4k-instruct-Q4_K_M.gguf',
    'phi-3-mini': 'phi-3-mini-4k-instruct-Q4_K_M.gguf',
    'gemma': 'gemma-7b-it-Q4_K_M.gguf',
    'gemma-7b': 'gemma-7b-it-Q4_K_M.gguf',
    'gemma2': 'gemma-2-9b-it-Q4_K_M.gguf',
    'gemma-2-9b': 'gemma-2-9b-it-Q4_K_M.gguf',
    'vicuna': 'vicuna-7b-v1.5-Q4_K_M.gguf',
    'vicuna-7b': 'vicuna-7b-v1.5-Q4_K_M.gguf',
    'orca-2': 'orca-2-7b-Q4_K_M.gguf',
    'orca-2-7b': 'orca-2-7b-Q4_K_M.gguf',
    'openchat': 'openchat-3.5-0106-Q4_K_M.gguf',
    'openchat-3.5': 'openchat-3.5-0106-Q4_K_M.gguf',
    'starling': 'starling-lm-7b-alpha-Q4_K_M.gguf',
    'starling-7b': 'starling-lm-7b-alpha-Q4_K_M.gguf',
    
    # ═══════════════════════════════════════════════════════════════
    # TIER 2: Advanced (7-13B parameters)
    # ═══════════════════════════════════════════════════════════════
    'mistral-7b': 'mistral-7b-instruct-v0.2.Q4_K_M.gguf',
    'mistral-7b-instruct': 'mistral-7b-instruct-v0.2.Q4_K_M.gguf',
    'mixtral': 'mixtral-8x7b-instruct-v0.1.Q4_K_M.gguf',
    'mixtral-8x7b': 'mixtral-8x7b-instruct-v0.1.Q4_K_M.gguf',
    'llama3': 'llama-3-8b-instruct-Q4_K_M.gguf',
    'llama-3': 'llama-3-8b-instruct-Q4_K_M.gguf',
    'llama3-8b': 'llama-3-8b-instruct-Q4_K_M.gguf',
    'llama3.1': 'llama-3.1-8b-instruct-Q4_K_M.gguf',
    'llama-3.1': 'llama-3.1-8b-instruct-Q4_K_M.gguf',
    'llama3.1-8b': 'llama-3.1-8b-instruct-Q4_K_M.gguf',
    'codellama': 'codellama-7b-instruct-Q4_K_M.gguf',
    'code-llama': 'codellama-7b-instruct-Q4_K_M.gguf',
    'codellama-7b': 'codellama-7b-instruct-Q4_K_M.gguf',
    'neural-chat': 'neural-chat-7b-v3-1-Q4_K_M.gguf',
    'neural-chat-7b': 'neural-chat-7b-v3-1-Q4_K_M.gguf',
    'solar': 'solar-10.7b-instruct-v1.0-Q4_K_M.gguf',
    'solar-10.7b': 'solar-10.7b-instruct-v1.0-Q4_K_M.gguf',
    'yi': 'yi-6b-chat-Q4_K_M.gguf',
    'yi-6b': 'yi-6b-chat-Q4_K_M.gguf',
    'qwen': 'qwen-7b-chat-Q4_K_M.gguf',
    'qwen-7b': 'qwen-7b-chat-Q4_K_M.gguf',
    'qwen2': 'qwen2-7b-instruct-Q4_K_M.gguf',
    'qwen2-7b': 'qwen2-7b-instruct-Q4_K_M.gguf',
    
    # ═══════════════════════════════════════════════════════════════
    # TIER 3: Expert (13B+ parameters)
    # ═══════════════════════════════════════════════════════════════
    'deepseek-coder': 'deepseek-coder-6.7b-instruct-Q4_K_M.gguf',
    'deepseek': 'deepseek-coder-6.7b-instruct-Q4_K_M.gguf',
    'deepseek-coder-6.7b': 'deepseek-coder-6.7b-instruct-Q4_K_M.gguf',
    'deepseek-coder-33b': 'deepseek-coder-33b-instruct-Q4_K_M.gguf',
    'llama3-70b': 'llama-3-70b-instruct-Q4_K_M.gguf',
    'llama3.1-70b': 'llama-3.1-70b-instruct-Q4_K_M.gguf',
    'mixtral-8x22b': 'mixtral-8x22b-instruct-v0.1-Q4_K_M.gguf',
    'codellama-13b': 'codellama-13b-instruct-Q4_K_M.gguf',
    'codellama-34b': 'codellama-34b-instruct-Q4_K_M.gguf',
    'wizardcoder': 'wizardcoder-15b-v1.0-Q4_K_M.gguf',
    'wizardcoder-15b': 'wizardcoder-15b-v1.0-Q4_K_M.gguf',
    'wizardcoder-33b': 'wizardcoder-python-33b-v1.0-Q4_K_M.gguf',
    'wizardlm': 'wizardlm-13b-v1.2-Q4_K_M.gguf',
    'wizardlm-13b': 'wizardlm-13b-v1.2-Q4_K_M.gguf',
    'yi-34b': 'yi-34b-chat-Q4_K_M.gguf',
    'qwen-14b': 'qwen-14b-chat-Q4_K_M.gguf',
    'qwen-72b': 'qwen-72b-chat-Q4_K_M.gguf',
    'qwen2-72b': 'qwen2-72b-instruct-Q4_K_M.gguf',
    'dolphin': 'dolphin-2.6-mixtral-8x7b-Q4_K_M.gguf',
    'dolphin-mixtral': 'dolphin-2.6-mixtral-8x7b-Q4_K_M.gguf',
    'nous-hermes': 'nous-hermes-2-mixtral-8x7b-Q4_K_M.gguf',
    'nous-hermes-2': 'nous-hermes-2-mixtral-8x7b-Q4_K_M.gguf',
    'phind-codellama': 'phind-codellama-34b-v2-Q4_K_M.gguf',
    'phind-codellama-34b': 'phind-codellama-34b-v2-Q4_K_M.gguf',
}

# HuggingFace download URLs mapping
# Format: https://huggingface.co/{org}/{repo}/resolve/main/{filename}
MODEL_URLS = {
    # ═══════════════════════════════════════════════════════════════
    # TIER 0: Basic Models
    # ═══════════════════════════════════════════════════════════════
    'tinyllama': 'https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
    'phi-2': 'https://huggingface.co/TheBloke/phi-2-GGUF/resolve/main/phi-2.Q4_K_M.gguf',
    'stablelm': 'https://huggingface.co/TheBloke/stablelm-2-zephyr-1_6b-GGUF/resolve/main/stablelm-2-zephyr-1_6b.Q4_K_M.gguf',
    'orca-mini': 'https://huggingface.co/TheBloke/orca_mini_3B-GGUF/resolve/main/orca_mini_3b.Q4_K_M.gguf',
    
    # ═══════════════════════════════════════════════════════════════
    # TIER 1: General Purpose
    # ═══════════════════════════════════════════════════════════════
    'llama3.2': 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    'llama2': 'https://huggingface.co/TheBloke/Llama-2-7B-Chat-GGUF/resolve/main/llama-2-7b-chat.Q4_K_M.gguf',
    'phi-3': 'https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf',
    'gemma': 'https://huggingface.co/google/gemma-7b-it-GGUF/resolve/main/gemma-7b-it.Q4_K_M.gguf',
    'gemma2': 'https://huggingface.co/bartowski/gemma-2-9b-it-GGUF/resolve/main/gemma-2-9b-it-Q4_K_M.gguf',
    'vicuna': 'https://huggingface.co/TheBloke/vicuna-7B-v1.5-GGUF/resolve/main/vicuna-7b-v1.5.Q4_K_M.gguf',
    'orca-2': 'https://huggingface.co/TheBloke/Orca-2-7B-GGUF/resolve/main/orca-2-7b.Q4_K_M.gguf',
    'openchat': 'https://huggingface.co/TheBloke/openchat-3.5-0106-GGUF/resolve/main/openchat-3.5-0106.Q4_K_M.gguf',
    'starling': 'https://huggingface.co/TheBloke/Starling-LM-7B-alpha-GGUF/resolve/main/starling-lm-7b-alpha.Q4_K_M.gguf',
    
    # ═══════════════════════════════════════════════════════════════
    # TIER 2: Advanced
    # ═══════════════════════════════════════════════════════════════
    'mistral-7b': 'https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf',
    'mixtral': 'https://huggingface.co/TheBloke/Mixtral-8x7B-Instruct-v0.1-GGUF/resolve/main/mixtral-8x7b-instruct-v0.1.Q4_K_M.gguf',
    'llama3': 'https://huggingface.co/QuantFactory/Meta-Llama-3-8B-Instruct-GGUF/resolve/main/Meta-Llama-3-8B-Instruct.Q4_K_M.gguf',
    'llama3.1': 'https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
    'codellama': 'https://huggingface.co/TheBloke/CodeLlama-7B-Instruct-GGUF/resolve/main/codellama-7b-instruct.Q4_K_M.gguf',
    'neural-chat': 'https://huggingface.co/TheBloke/neural-chat-7B-v3-1-GGUF/resolve/main/neural-chat-7b-v3-1.Q4_K_M.gguf',
    'solar': 'https://huggingface.co/TheBloke/SOLAR-10.7B-Instruct-v1.0-GGUF/resolve/main/solar-10.7b-instruct-v1.0.Q4_K_M.gguf',
    'yi': 'https://huggingface.co/TheBloke/Yi-6B-Chat-GGUF/resolve/main/yi-6b-chat.Q4_K_M.gguf',
    'qwen': 'https://huggingface.co/Qwen/Qwen-7B-Chat-GGUF/resolve/main/qwen-7b-chat.Q4_K_M.gguf',
    'qwen2': 'https://huggingface.co/Qwen/Qwen2-7B-Instruct-GGUF/resolve/main/qwen2-7b-instruct-q4_k_m.gguf',
    
    # ═══════════════════════════════════════════════════════════════
    # TIER 3: Expert
    # ═══════════════════════════════════════════════════════════════
    'deepseek-coder': 'https://huggingface.co/TheBloke/deepseek-coder-6.7B-instruct-GGUF/resolve/main/deepseek-coder-6.7b-instruct.Q4_K_M.gguf',
    'deepseek-coder-33b': 'https://huggingface.co/TheBloke/deepseek-coder-33B-instruct-GGUF/resolve/main/deepseek-coder-33b-instruct.Q4_K_M.gguf',
    'llama3-70b': 'https://huggingface.co/QuantFactory/Meta-Llama-3-70B-Instruct-GGUF/resolve/main/Meta-Llama-3-70B-Instruct.Q4_K_M.gguf',
    'llama3.1-70b': 'https://huggingface.co/bartowski/Meta-Llama-3.1-70B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-70B-Instruct-Q4_K_M.gguf',
    'mixtral-8x22b': 'https://huggingface.co/MaziyarPanahi/Mixtral-8x22B-Instruct-v0.1-GGUF/resolve/main/Mixtral-8x22B-Instruct-v0.1.Q4_K_M.gguf',
    'codellama-13b': 'https://huggingface.co/TheBloke/CodeLlama-13B-Instruct-GGUF/resolve/main/codellama-13b-instruct.Q4_K_M.gguf',
    'codellama-34b': 'https://huggingface.co/TheBloke/CodeLlama-34B-Instruct-GGUF/resolve/main/codellama-34b-instruct.Q4_K_M.gguf',
    'wizardcoder': 'https://huggingface.co/TheBloke/WizardCoder-15B-V1.0-GGUF/resolve/main/wizardcoder-15b-v1.0.Q4_K_M.gguf',
    'wizardcoder-33b': 'https://huggingface.co/TheBloke/WizardCoder-Python-33B-V1.0-GGUF/resolve/main/wizardcoder-python-33b-v1.0.Q4_K_M.gguf',
    'wizardlm': 'https://huggingface.co/TheBloke/WizardLM-13B-V1.2-GGUF/resolve/main/wizardlm-13b-v1.2.Q4_K_M.gguf',
    'yi-34b': 'https://huggingface.co/TheBloke/Yi-34B-Chat-GGUF/resolve/main/yi-34b-chat.Q4_K_M.gguf',
    'qwen-14b': 'https://huggingface.co/Qwen/Qwen-14B-Chat-GGUF/resolve/main/qwen-14b-chat.Q4_K_M.gguf',
    'qwen-72b': 'https://huggingface.co/Qwen/Qwen-72B-Chat-GGUF/resolve/main/qwen-72b-chat.Q4_K_M.gguf',
    'qwen2-72b': 'https://huggingface.co/Qwen/Qwen2-72B-Instruct-GGUF/resolve/main/qwen2-72b-instruct-q4_k_m.gguf',
    'dolphin': 'https://huggingface.co/TheBloke/dolphin-2.6-mixtral-8x7b-GGUF/resolve/main/dolphin-2.6-mixtral-8x7b.Q4_K_M.gguf',
    'nous-hermes': 'https://huggingface.co/TheBloke/Nous-Hermes-2-Mixtral-8x7B-DPO-GGUF/resolve/main/nous-hermes-2-mixtral-8x7b-dpo.Q4_K_M.gguf',
    'phind-codellama': 'https://huggingface.co/TheBloke/Phind-CodeLlama-34B-v2-GGUF/resolve/main/phind-codellama-34b-v2.Q4_K_M.gguf',
}

# Expected file sizes in MB (for integrity checking)
# Sizes are approximate Q4_K_M quantized sizes
MODEL_SIZES = {
    # TIER 0
    'tinyllama': 669,  # ~669MB
    'phi-2': 1700,  # ~1.7GB
    'stablelm': 1000,  # ~1GB
    'orca-mini': 1900,  # ~1.9GB
    
    # TIER 1
    'llama3.2': 2000,  # ~2GB
    'llama2': 3800,  # ~3.8GB
    'phi-3': 2300,  # ~2.3GB
    'gemma': 4800,  # ~4.8GB
    'gemma2': 5400,  # ~5.4GB
    'vicuna': 3800,  # ~3.8GB
    'orca-2': 3800,  # ~3.8GB
    'openchat': 3800,  # ~3.8GB
    'starling': 4100,  # ~4.1GB
    
    # TIER 2
    'mistral-7b': 4100,  # ~4.1GB
    'mixtral': 26000,  # ~26GB
    'llama3': 4700,  # ~4.7GB
    'llama3.1': 4700,  # ~4.7GB
    'codellama': 3800,  # ~3.8GB
    'neural-chat': 4100,  # ~4.1GB
    'solar': 6200,  # ~6.2GB
    'yi': 3500,  # ~3.5GB
    'qwen': 4300,  # ~4.3GB
    'qwen2': 4500,  # ~4.5GB
    
    # TIER 3
    'deepseek-coder': 3900,  # ~3.9GB
    'deepseek-coder-33b': 19000,  # ~19GB
    'llama3-70b': 39000,  # ~39GB
    'llama3.1-70b': 39000,  # ~39GB
    'mixtral-8x22b': 78000,  # ~78GB
    'codellama-13b': 7400,  # ~7.4GB
    'codellama-34b': 19000,  # ~19GB
    'wizardcoder': 8700,  # ~8.7GB
    'wizardcoder-33b': 19000,  # ~19GB
    'wizardlm': 7400,  # ~7.4GB
    'yi-34b': 19000,  # ~19GB
    'qwen-14b': 8100,  # ~8.1GB
    'qwen-72b': 41000,  # ~41GB
    'qwen2-72b': 41000,  # ~41GB
    'dolphin': 26000,  # ~26GB
    'nous-hermes': 26000,  # ~26GB
    'phind-codellama': 19000,  # ~19GB
}

# Alias mapping for convenience (maps aliases to canonical names)
MODEL_ALIASES = {
    'tiny': 'tinyllama',
    'phi2': 'phi-2',
    'stablelm-2': 'stablelm',
    'orca-mini-3b': 'orca-mini',
    'llama-3.2': 'llama3.2',
    'llama3.2-3b': 'llama3.2',
    'llama-2': 'llama2',
    'llama2-7b': 'llama2',
    'phi3': 'phi-3',
    'phi-3-mini': 'phi-3',
    'gemma-7b': 'gemma',
    'gemma-2-9b': 'gemma2',
    'vicuna-7b': 'vicuna',
    'orca-2-7b': 'orca-2',
    'openchat-3.5': 'openchat',
    'starling-7b': 'starling',
    'mistral': 'mistral-7b',
    'mistral-7b-instruct': 'mistral-7b',
    'mixtral-8x7b': 'mixtral',
    'llama-3': 'llama3',
    'llama3-8b': 'llama3',
    'llama-3.1': 'llama3.1',
    'llama3.1-8b': 'llama3.1',
    'code-llama': 'codellama',
    'codellama-7b': 'codellama',
    'neural-chat-7b': 'neural-chat',
    'solar-10.7b': 'solar',
    'yi-6b': 'yi',
    'qwen-7b': 'qwen',
    'qwen2-7b': 'qwen2',
    'deepseek': 'deepseek-coder',
    'deepseek-coder-6.7b': 'deepseek-coder',
    'wizardcoder-15b': 'wizardcoder',
    'wizardlm-13b': 'wizardlm',
    'dolphin-mixtral': 'dolphin',
    'nous-hermes-2': 'nous-hermes',
    'phind-codellama-34b': 'phind-codellama',
}


def get_model_file(model_name: str) -> str:
    """
    Get GGUF filename for a model.
    
    Args:
        model_name: Model name (e.g., 'llama3.2', 'mistral')
    
    Returns:
        GGUF filename or None if not found
    """
    # Normalize name
    normalized = model_name.lower().strip()
    
    # Check aliases first
    if normalized in MODEL_ALIASES:
        normalized = MODEL_ALIASES[normalized]
    
    return MODEL_FILES.get(normalized)


def get_model_url(model_name: str) -> str:
    """
    Get HuggingFace download URL for a model.
    
    Args:
        model_name: Model name (e.g., 'llama3.2', 'mistral')
    
    Returns:
        HuggingFace URL or None if not found
    """
    # Normalize name
    normalized = model_name.lower().strip()
    
    # Check aliases first
    if normalized in MODEL_ALIASES:
        normalized = MODEL_ALIASES[normalized]
    
    return MODEL_URLS.get(normalized)


def get_canonical_name(model_name: str) -> str:
    """
    Get canonical model name from alias.
    
    Args:
        model_name: Model name or alias
    
    Returns:
        Canonical model name
    """
    normalized = model_name.lower().strip()
    return MODEL_ALIASES.get(normalized, normalized)


def is_model_supported(model_name: str) -> bool:
    """
    Check if a model is supported.
    
    Args:
        model_name: Model name to check
    
    Returns:
        True if model is supported
    """
    normalized = model_name.lower().strip()
    if normalized in MODEL_ALIASES:
        normalized = MODEL_ALIASES[normalized]
    return normalized in MODEL_FILES


def list_all_models() -> dict:
    """
    List all supported models grouped by tier.
    
    Returns:
        Dict with tier → list of models
    """
    from collections import defaultdict
    from core.model_tiers import get_model_tier
    
    models_by_tier = defaultdict(list)
    
    # Get unique canonical names
    canonical_names = set(MODEL_FILES.keys())
    
    for model_name in sorted(canonical_names):
        tier = get_model_tier(model_name)
        models_by_tier[tier].append(model_name)
    
    return models_by_tier


def get_model_size(model_name: str) -> int:
    """
    Get expected file size in MB for a model.
    
    Args:
        model_name: Model name
    
    Returns:
        Expected size in MB, or 0 if unknown
    """
    canonical = get_canonical_name(model_name)
    return MODEL_SIZES.get(canonical, 0)


def get_model_info(model_name: str) -> dict:
    """
    Get complete info about a model.
    
    Args:
        model_name: Model name
    
    Returns:
        Dict with model info (file, url, tier, etc.)
    """
    from core.model_tiers import get_model_tier, get_tier_capabilities
    
    canonical = get_canonical_name(model_name)
    model_file = get_model_file(canonical)
    model_url = get_model_url(canonical)
    tier = get_model_tier(canonical)
    tier_info = get_tier_capabilities(tier)
    expected_size = get_model_size(canonical)
    
    return {
        'name': canonical,
        'canonical_name': canonical,
        'file': model_file,
        'url': model_url,
        'tier': tier,
        'tier_name': tier_info['name'],
        'tier_params': tier_info['params'],
        'expected_size_mb': expected_size,
        'supported': model_file is not None and model_url is not None,
    }


def get_all_models() -> list:
    """
    Get info for all supported models.
    
    Returns:
        List of model info dicts (one per canonical model)
    """
    from core.model_tiers import get_model_tier, get_tier_capabilities
    
    all_models = []
    
    # Get unique canonical names from MODEL_URLS (since every supported model should have a URL)
    canonical_names = set()
    for model_name in MODEL_URLS.keys():
        canonical_names.add(get_canonical_name(model_name))
    
    # Build info for each canonical model
    for canonical in sorted(canonical_names):
        model_file = get_model_file(canonical)
        model_url = get_model_url(canonical)
        tier = get_model_tier(canonical)
        tier_info = get_tier_capabilities(tier)
        expected_size = get_model_size(canonical)
        
        all_models.append({
            'name': canonical,
            'canonical_name': canonical,
            'file': model_file,
            'url': model_url,
            'tier': tier,
            'tier_name': tier_info['name'],
            'tier_params': tier_info['params'],
            'expected_size_mb': expected_size,
            'supported': model_file is not None and model_url is not None,
        })
    
    return all_models
