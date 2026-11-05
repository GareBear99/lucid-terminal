from __future__ import annotations

from pathlib import Path
import json
import yaml


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    manifest = yaml.safe_load((root / 'configs' / 'run_manifest.yaml').read_text(encoding='utf-8'))
    missing = []
    for rel in manifest.get('required_reports', []) + manifest.get('required_results', []):
        if not (root / rel).exists():
            missing.append(rel)
    print(json.dumps({'missing': missing, 'ok': not missing}, indent=2))


if __name__ == '__main__':
    main()
