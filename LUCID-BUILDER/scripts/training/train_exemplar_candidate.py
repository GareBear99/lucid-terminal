from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime.task_loader import load_jsonl
from scripts.training._artifacts import write_stage_manifest

DATASET_DIRS = [
    ROOT / 'datasets' / 'distillation_sft',
    ROOT / 'datasets' / 'runtime_mindshape',
    ROOT / 'datasets' / 'system_of_record',
    ROOT / 'datasets' / 'execution_lane_reasoning',
    ROOT / 'datasets' / 'receipt_archive',
    ROOT / 'datasets' / 'language_reasoning',
    ROOT / 'datasets' / 'workflow_pressure',
]


def normalize_text(value) -> str:
    import json
    if value is None:
        return ''
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return json.dumps(value, sort_keys=True)
    if isinstance(value, list):
        return ' '.join(normalize_text(v) for v in value)
    return str(value)


def tokenize(text: str) -> list[str]:
    import re
    return re.findall(r"[a-zA-Z0-9_']+", normalize_text(text).lower())


def iter_records() -> list[dict]:
    records: list[dict] = []
    for ds in DATASET_DIRS:
        if not ds.exists():
            continue
        for path in sorted(ds.rglob('*.jsonl')):
            for row in load_jsonl(path):
                prompt = normalize_text(row.get('prompt') or row.get('instruction') or row.get('input') or '')
                target = normalize_text(row.get('target') or row.get('response') or row.get('output') or '')
                if not prompt or not target:
                    continue
                records.append({
                    'source_repo': row.get('source_repo', 'cognition-core'),
                    'source_file': str(path.relative_to(ROOT)),
                    'capability': row.get('capability', 'generic'),
                    'domain': row.get('domain', 'engineering'),
                    'prompt': prompt,
                    'prompt_tokens': tokenize(prompt),
                    'target': target,
                })
    return records


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--candidate', required=True)
    args = ap.parse_args()

    records = iter_records()
    artifact_dir = ROOT / 'exports' / 'candidates' / args.candidate / 'exemplar_train'
    artifact_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = artifact_dir / 'exemplar_model.json'
    payload = {
        'model_type': 'local_exemplar',
        'candidate_id': args.candidate,
        'record_count': len(records),
        'records': records,
    }
    artifact_path.write_text(json.dumps(payload, indent=2), encoding='utf-8')
    manifest_path, manifest = write_stage_manifest(args.candidate, 'exemplar_train', {
        'status': 'completed',
        'execution_mode': 'native',
        'notes': 'Built a functioning exemplar retrieval model artifact from curated repo datasets.',
        'paths': {'artifact': str(artifact_path)},
        'metrics': {'record_count': len(records)},
    })
    report = ROOT / 'reports' / f'exemplar_train_{args.candidate}.json'
    report.write_text(json.dumps({'ok': True, 'manifest': str(manifest_path.relative_to(ROOT)), **manifest}, indent=2), encoding='utf-8')
    print(json.dumps({'ok': True, 'artifact': str(artifact_path), 'records': len(records)}, indent=2))


if __name__ == '__main__':
    main()
