from __future__ import annotations
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
INPUTS = [
    ROOT / 'datasets' / 'distillation_sft' / 'seed_records.jsonl',
    ROOT / 'data' / 'observe_infer' / 'seed_examples.jsonl',
    ROOT / 'data' / 'plan' / 'seed_examples.jsonl',
    ROOT / 'data' / 'critique' / 'seed_examples.jsonl',
    ROOT / 'data' / 'repair' / 'seed_examples.jsonl',
    ROOT / 'data' / 'compress' / 'seed_examples.jsonl',
    ROOT / 'data' / 'calibrate' / 'seed_examples.jsonl',
]
OUT = ROOT / 'reports' / 'prepared_corpus_manifest.json'
def main() -> None:
    manifest = {'files': [], 'total_records': 0}
    for path in INPUTS:
        if not path.exists():
            continue
        count = 0
        with path.open('r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    json.loads(line)
                    count += 1
        manifest['files'].append({'path': str(path.relative_to(ROOT)), 'records': count})
        manifest['total_records'] += count
    OUT.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(json.dumps(manifest, indent=2))
if __name__ == '__main__':
    main()
