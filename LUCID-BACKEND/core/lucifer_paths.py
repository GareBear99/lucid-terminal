#!/usr/bin/env python3
"""
📍 LuciferAI canonical paths — single source of truth for model layout.

Fixed 2026-11-03: four components used to look for the llamafile binary and
the model GGUFs in four different directories, so a fresh clone + setup left
the main agent with no model. There is now ONE layout and every component
(lucifer.py, core/llamafile_agent.py, core/llm_backend.py,
core/enhanced_agent.py, core/model_download.py, setup_bundled_models.sh,
bin/assemble_llamafile.sh) resolves its paths through this module:

    <project>/.luciferai/bin/llamafile   — llamafile binary
    <project>/models/*.gguf              — model files

NOTE: ~/.luciferai/ (user HOME) is still used for *state* only — history,
llm_state.json, session logs. State is not part of the model layout and was
deliberately left alone.
"""
from pathlib import Path


def project_root() -> Path:
    """Absolute path of the LuciferAI_Local repo root."""
    return Path(__file__).resolve().parent.parent


def llamafile_path() -> Path:
    """Canonical path of the llamafile binary."""
    return project_root() / ".luciferai" / "bin" / "llamafile"


def models_dir() -> Path:
    """Canonical directory holding model GGUF files."""
    return project_root() / "models"


def model_path(filename: str) -> Path:
    """Canonical path of one model file inside models/."""
    return models_dir() / filename


def ensure_layout() -> None:
    """Create the canonical directories if they do not exist yet."""
    llamafile_path().parent.mkdir(parents=True, exist_ok=True)
    models_dir().mkdir(parents=True, exist_ok=True)
