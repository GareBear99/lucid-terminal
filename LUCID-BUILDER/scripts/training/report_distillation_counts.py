from __future__ import annotations
import json
from pathlib import Path

def count(path: Path) -> int:
    c = 0
    with path.open('r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                c += 1
    return c

def main() -> None:
    root = Path('datasets')
    data = {
        'distillation_sft': count(root / 'distillation_sft' / 'seed_records.jsonl'),
        'distillation_preference': count(root / 'distillation_preference' / 'seed_pairs.jsonl'),
        'distillation_eval': count(root / 'distillation_eval' / 'seed_tasks.jsonl'),
    }
    print(json.dumps(data, indent=2))

if __name__ == '__main__':
    main()
