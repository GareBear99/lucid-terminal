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


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--candidate', required=True)
    ap.add_argument('--base-model', default='unset')
    ap.add_argument('--mode', choices=['auto', 'scaffold', 'external'], default='auto')
    args = ap.parse_args()

    lora_manifest = ROOT / 'exports' / 'candidates' / args.candidate / 'lora_train' / 'artifact_manifest.json'
    pref_manifest = ROOT / 'exports' / 'candidates' / args.candidate / 'preference_train' / 'artifact_manifest.json'
    merge_dir = stage_dir(args.candidate, 'merge') / 'merged-checkpoint'
    merge_dir.mkdir(parents=True, exist_ok=True)
    mapping = {
        'candidate': args.candidate,
        'base_model': args.base_model,
        'merge_dir': str(merge_dir),
        'artifacts_dir': str((ROOT / 'exports' / 'candidates' / args.candidate).resolve()),
    }
    mode = resolve_stage_mode('merge', args.mode)
    external = None
    status = 'scaffold_ready'
    note = 'Real merge is still optional, but the repo now supports driving an external merge stage and records exact upstream artifacts.'
    if mode == 'external':
        try:
            external = run_external_stage('merge', mapping)
            status = 'external_completed'
            note = 'External merge command completed successfully.'
        except ExternalCommandError as exc:
            payload = {
                'status': 'external_failed',
                'base_model': args.base_model,
                'notes': f'External merge failed: {exc}',
                'paths': {
                    'lora_manifest': str(lora_manifest.relative_to(ROOT)) if lora_manifest.exists() else None,
                    'preference_manifest': str(pref_manifest.relative_to(ROOT)) if pref_manifest.exists() else None,
                    'expected_merged_checkpoint': str(merge_dir.resolve()),
                },
                'source_manifest': {
                    'lora_present': lora_manifest.exists(),
                    'preference_present': pref_manifest.exists(),
                },
            }
            manifest_path, manifest = write_stage_manifest(args.candidate, 'merge', payload)
            print(json.dumps({'ok': False, 'manifest': str(manifest_path), 'candidate': args.candidate, 'status': manifest['status']}, indent=2))
            raise SystemExit(1)

    payload = {
        'status': status,
        'base_model': args.base_model,
        'execution_mode': mode,
        'notes': note,
        'paths': {
            'lora_manifest': str(lora_manifest.relative_to(ROOT)) if lora_manifest.exists() else None,
            'preference_manifest': str(pref_manifest.relative_to(ROOT)) if pref_manifest.exists() else None,
            'expected_merged_checkpoint': str(merge_dir.resolve()),
        },
        'source_manifest': {
            'lora_present': lora_manifest.exists(),
            'preference_present': pref_manifest.exists(),
        },
    }
    if external:
        payload['external'] = external
    manifest_path, manifest = write_stage_manifest(args.candidate, 'merge', payload)
    report = ROOT / 'reports' / f'merge_{args.candidate}.json'
    report.write_text(json.dumps({'ok': True, 'manifest': str(manifest_path.relative_to(ROOT)), **manifest}, indent=2), encoding='utf-8')
    print(json.dumps({'ok': True, 'manifest': str(manifest_path), 'candidate': args.candidate, 'status': manifest['status']}, indent=2))


if __name__ == '__main__':
    main()
