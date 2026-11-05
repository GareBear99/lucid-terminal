from __future__ import annotations

from pathlib import Path
import json
from datetime import datetime, timezone
import os


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    out = root / 'results' / 'experiments.jsonl'
    record = {
        'timestamp_utc': datetime.now(timezone.utc).isoformat(),
        'event': 'bootstrap_experiment',
        'model_name': os.environ.get('COGNITION_MODEL_NAME', 'unset'),
        'backend': os.environ.get('COGNITION_GGUF_BASE_URL', 'unset'),
        'notes': 'Experiment bootstrap record created before full candidate gate.'
    }
    with out.open('a', encoding='utf-8') as f:
        f.write(json.dumps(record) + '\n')
    print(json.dumps(record, indent=2))


if __name__ == '__main__':
    main()
