from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = Path(__file__).resolve().parents[2]
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
from _artifacts import ROOT, stage_dir, write_stage_manifest
from _external import ExternalCommandError, resolve_stage_mode, run_external_stage


def count_jsonl(path: Path) -> int:
    if not path.exists():
        return 0
    count = 0
    with path.open('r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                json.loads(line)
                count += 1
    return count


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--candidate', required=True)
    ap.add_argument('--config', default=str(ROOT / 'configs' / 'training' / 'preference_dpo.yaml'))
    ap.add_argument('--dataset', default=str(ROOT / 'datasets' / 'distillation_preference' / 'seed_pairs.jsonl'))
    ap.add_argument('--mode', choices=['auto', 'scaffold', 'external'], default='auto')
    args = ap.parse_args()

    dataset_path = Path(args.dataset)
    output_dir = stage_dir(args.candidate, 'preference_train') / 'adapter'
    output_dir.mkdir(parents=True, exist_ok=True)
    mapping = {
        'candidate': args.candidate,
        'preference_dataset': str(dataset_path),
        'dataset': str(dataset_path),
        'output_dir': str(output_dir),
        'artifacts_dir': str((ROOT / 'exports' / 'candidates' / args.candidate).resolve()),
    }
    mode = resolve_stage_mode('preference_train', args.mode)
    external = None
    status = 'scaffold_ready'
    note = 'Preference stage remains scaffold by default, but now supports an external trainer command with deterministic manifests.'
    if mode == 'external':
        try:
            external = run_external_stage('preference_train', mapping)
            status = 'external_completed'
            note = 'External preference-training command completed successfully.'
        except ExternalCommandError as exc:
            payload = {
                'status': 'external_failed',
                'config': args.config,
                'notes': f'External preference_train failed: {exc}',
                'paths': {'dataset': str(dataset_path), 'expected_adapter_dir': str(output_dir.resolve())},
                'metrics': {'dataset_records': count_jsonl(dataset_path)},
            }
            manifest_path, manifest = write_stage_manifest(args.candidate, 'preference_train', payload)
            print(json.dumps({'ok': False, 'manifest': str(manifest_path), 'candidate': args.candidate, 'status': manifest['status']}, indent=2))
            raise SystemExit(1)

    payload = {
        'status': status,
        'config': args.config,
        'execution_mode': mode,
        'notes': note,
        'paths': {
            'dataset': str(dataset_path),
            'expected_adapter_dir': str(output_dir.resolve()),
        },
        'metrics': {
            'dataset_records': count_jsonl(dataset_path),
        },
    }
    if external:
        payload['external'] = external
    manifest_path, manifest = write_stage_manifest(args.candidate, 'preference_train', payload)
    report = ROOT / 'reports' / f'preference_train_{args.candidate}.json'
    report.write_text(json.dumps({'ok': True, 'manifest': str(manifest_path.relative_to(ROOT)), **manifest}, indent=2), encoding='utf-8')
    print(json.dumps({'ok': True, 'manifest': str(manifest_path), 'candidate': args.candidate, 'status': manifest['status']}, indent=2))


if __name__ == '__main__':
    main()
