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

VARIANTS = ['f16', 'q8_0', 'q6_k', 'q5_k_m']


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--candidate', required=True)
    ap.add_argument('--variants', nargs='*', default=VARIANTS)
    ap.add_argument('--mode', choices=['auto', 'scaffold', 'external'], default='auto')
    args = ap.parse_args()

    merge_manifest = ROOT / 'exports' / 'candidates' / args.candidate / 'merge' / 'artifact_manifest.json'
    gguf_dir = stage_dir(args.candidate, 'gguf_export')
    expected = []
    for variant in args.variants:
        path = gguf_dir / f'{args.candidate}.{variant}.gguf'
        expected.append(str(path.relative_to(ROOT)))
    mapping = {
        'candidate': args.candidate,
        'gguf_dir': str(gguf_dir),
        'artifacts_dir': str((ROOT / 'exports' / 'candidates' / args.candidate).resolve()),
    }
    mode = resolve_stage_mode('gguf_export', args.mode)
    external = None
    status = 'scaffold_ready'
    note = 'Real GGUF conversion still needs the selected exporter/runtime, but the artifact contract is explicit and versionable.'
    if mode == 'external':
        try:
            external = run_external_stage('gguf_export', mapping)
            status = 'external_completed'
            note = 'External GGUF export command completed successfully.'
        except ExternalCommandError as exc:
            payload = {
                'status': 'external_failed',
                'notes': f'External gguf_export failed: {exc}',
                'paths': {
                    'merge_manifest': str(merge_manifest.relative_to(ROOT)) if merge_manifest.exists() else None,
                    'expected_variants': expected,
                },
                'source_manifest': {'merge_present': merge_manifest.exists(), 'variants': args.variants},
            }
            manifest_path, manifest = write_stage_manifest(args.candidate, 'gguf_export', payload)
            print(json.dumps({'ok': False, 'manifest': str(manifest_path), 'candidate': args.candidate, 'status': manifest['status']}, indent=2))
            raise SystemExit(1)

    payload = {
        'status': status,
        'execution_mode': mode,
        'notes': note,
        'paths': {
            'merge_manifest': str(merge_manifest.relative_to(ROOT)) if merge_manifest.exists() else None,
            'expected_variants': expected,
        },
        'source_manifest': {
            'merge_present': merge_manifest.exists(),
            'variants': args.variants,
        },
    }
    if external:
        payload['external'] = external
    manifest_path, manifest = write_stage_manifest(args.candidate, 'gguf_export', payload)
    report = ROOT / 'reports' / f'gguf_export_{args.candidate}.json'
    report.write_text(json.dumps({'ok': True, 'manifest': str(manifest_path.relative_to(ROOT)), **manifest}, indent=2), encoding='utf-8')
    print(json.dumps({'ok': True, 'manifest': str(manifest_path), 'candidate': args.candidate, 'variants': args.variants, 'status': manifest['status']}, indent=2))


if __name__ == '__main__':
    main()
