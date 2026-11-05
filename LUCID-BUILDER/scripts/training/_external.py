from __future__ import annotations

import json
import os
import shlex
import subprocess
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[2]
RUNTIME_CONFIG = ROOT / 'configs' / 'training' / 'external_runtime.yaml'


class ExternalCommandError(RuntimeError):
    pass


def load_runtime_config() -> dict[str, Any]:
    if not RUNTIME_CONFIG.exists():
        return {"version": 1, "stages": {}}
    return yaml.safe_load(RUNTIME_CONFIG.read_text(encoding='utf-8')) or {"version": 1, "stages": {}}


def stage_config(stage: str) -> dict[str, Any]:
    cfg = load_runtime_config()
    return (cfg.get('stages') or {}).get(stage, {}) or {}


def resolve_stage_mode(stage: str, explicit_mode: str | None = None) -> str:
    if explicit_mode and explicit_mode != 'auto':
        return explicit_mode
    env_mode = os.environ.get(f'COGNITION_{stage.upper()}_MODE')
    if env_mode in {'scaffold', 'external'}:
        return env_mode
    cfg_mode = stage_config(stage).get('mode')
    if cfg_mode in {'scaffold', 'external'}:
        return cfg_mode
    return 'scaffold'


def _render(value: Any, mapping: dict[str, Any]) -> Any:
    if isinstance(value, str):
        return value.format(**mapping)
    if isinstance(value, list):
        return [_render(v, mapping) for v in value]
    if isinstance(value, dict):
        return {k: _render(v, mapping) for k, v in value.items()}
    return value


def resolve_stage_command(stage: str, mapping: dict[str, Any]) -> list[str] | None:
    env_key = f'COGNITION_{stage.upper()}_COMMAND'
    if env_key in os.environ and os.environ[env_key].strip():
        return shlex.split(os.environ[env_key].format(**mapping))
    cfg = stage_config(stage)
    command = cfg.get('command')
    if not command:
        return None
    rendered = _render(command, mapping)
    if isinstance(rendered, str):
        return shlex.split(rendered)
    if isinstance(rendered, list):
        return [str(part) for part in rendered]
    raise ExternalCommandError(f'Invalid command shape for stage {stage}: {type(rendered)!r}')


def run_external_stage(stage: str, mapping: dict[str, Any]) -> dict[str, Any]:
    cmd = resolve_stage_command(stage, mapping)
    if not cmd:
        raise ExternalCommandError(f'No external command configured for stage {stage}')
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    payload = {
        'mode': 'external',
        'command': cmd,
        'returncode': proc.returncode,
        'stdout': proc.stdout,
        'stderr': proc.stderr,
    }
    if proc.returncode != 0:
        raise ExternalCommandError(json.dumps(payload, indent=2))
    return payload
