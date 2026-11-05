from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = Path(__file__).resolve().parents[2]
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
from _artifacts import ROOT, stage_dir, write_stage_manifest
from _external import ExternalCommandError, resolve_stage_mode, run_external_stage

# Base-model names that map to the ARC-native training path.
# Anything in this set bypasses the scaffold/external chain and runs
# train_arc_native_candidate.py directly, producing real weights.
_ARC_NATIVE_BASES: dict[str, str] = {
    "arc_tiny":         "tiny",
    "arc-tiny":         "tiny",
    "arc_neuron_tiny":  "tiny",
    "arc_neuron_small": "small",
    "arc-small":        "small",
    "arc_small":        "small",
    "arc_neuron_base":  "base",
    "arc-base":         "base",
    "arc_base":         "base",
}


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


def run_arc_native(candidate: str, tier: str, extra_args: list[str]) -> dict:
    """Delegate to train_arc_native_candidate.py and return its JSON output."""
    native_script = SCRIPT_DIR / "train_arc_native_candidate.py"
    cmd = [
        sys.executable, str(native_script),
        "--candidate", candidate,
        "--tier", tier,
        *extra_args,
    ]
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            f"arc-native training failed (exit {proc.returncode}):\n"
            f"stdout: {proc.stdout}\nstderr: {proc.stderr}"
        )
    # The native script prints a final JSON summary line
    for line in reversed(proc.stdout.splitlines()):
        line = line.strip()
        if line.startswith("{"):
            try:
                return json.loads(line)
            except Exception:
                pass
    return {"ok": True, "stdout": proc.stdout[-2000:]}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--candidate', required=True)
    ap.add_argument('--config', default=str(ROOT / 'configs' / 'training' / 'sft_lora.yaml'))
    ap.add_argument('--base-model', default='unset')
    ap.add_argument('--dataset', default=str(ROOT / 'datasets' / 'distillation_sft' / 'seed_records.jsonl'))
    ap.add_argument('--mode', choices=['auto', 'scaffold', 'external'], default='auto')
    # Native-training pass-through args
    ap.add_argument('--steps',      type=int,   default=None, help="Training steps (arc-native only)")
    ap.add_argument('--batch-size', type=int,   default=None, help="Batch size (arc-native only)")
    ap.add_argument('--lr',         type=float, default=None, help="Learning rate (arc-native only)")
    args = ap.parse_args()

    dataset_path = Path(args.dataset)
    output_dir = stage_dir(args.candidate, 'lora_train') / 'checkpoint'
    output_dir.mkdir(parents=True, exist_ok=True)

    # ── ARC-native routing ────────────────────────────────────────────────────
    tier = _ARC_NATIVE_BASES.get(args.base_model.lower().replace("-", "_"))
    if tier is not None:
        print(f"[lora_train] base_model={args.base_model!r} → ARC-native path (tier={tier})")
        native_extra: list[str] = []
        if args.steps      is not None: native_extra += ["--steps",      str(args.steps)]
        if args.batch_size is not None: native_extra += ["--batch-size", str(args.batch_size)]
        if args.lr         is not None: native_extra += ["--lr",         str(args.lr)]
        try:
            result = run_arc_native(args.candidate, tier, native_extra)
        except RuntimeError as exc:
            payload = {
                "status": "arc_native_failed",
                "base_model": args.base_model,
                "tier": tier,
                "notes": str(exc)[:1000],
            }
            manifest_path, manifest = write_stage_manifest(args.candidate, "lora_train", payload)
            print(json.dumps({"ok": False, "candidate": args.candidate, "error": str(exc)[:400]}))
            raise SystemExit(1)

        report = ROOT / "reports" / f"lora_train_{args.candidate}.json"
        report.write_text(json.dumps({"ok": True, "arc_native": True, **result}, indent=2), encoding="utf-8")
        # Single-line for subprocess parsers
        print(json.dumps({"ok": True, "arc_native": True, "candidate": args.candidate, **result}))
        return

    # ── External / scaffold path (unchanged for non-ARC-native bases) ─────────
    mapping = {
        'candidate':    args.candidate,
        'base_model':   args.base_model,
        'dataset':      str(dataset_path),
        'output_dir':   str(output_dir),
        'artifacts_dir': str((ROOT / 'exports' / 'candidates' / args.candidate).resolve()),
    }
    mode = resolve_stage_mode('lora_train', args.mode)
    external = None
    status = 'scaffold_ready'
    note = (
        'Training runner still requires real backend/trainer wiring for external bases. '
        'For ARC-native bases (arc_tiny, arc_neuron_small), pass --base-model arc_neuron_small '
        'to engage the native training path.'
    )
    if mode == 'external':
        try:
            external = run_external_stage('lora_train', mapping)
            status = 'external_completed'
            note = 'External SFT/LoRA command completed successfully.'
        except ExternalCommandError as exc:
            payload = {
                'status': 'external_failed',
                'config': args.config,
                'base_model': args.base_model,
                'notes': f'External lora_train failed: {exc}',
                'paths': {'dataset': str(dataset_path), 'expected_checkpoint_dir': str(output_dir.resolve())},
                'metrics': {'dataset_records': count_jsonl(dataset_path)},
            }
            manifest_path, manifest = write_stage_manifest(args.candidate, 'lora_train', payload)
            print(json.dumps({'ok': False, 'manifest': str(manifest_path), 'candidate': args.candidate, 'status': manifest['status']}))
            raise SystemExit(1)

    payload = {
        'status': status,
        'config': args.config,
        'base_model': args.base_model,
        'execution_mode': mode,
        'notes': note,
        'paths': {
            'dataset': str(dataset_path),
            'expected_checkpoint_dir': str(output_dir.resolve()),
        },
        'metrics': {
            'dataset_records': count_jsonl(dataset_path),
        },
    }
    if external:
        payload['external'] = external
    manifest_path, manifest = write_stage_manifest(args.candidate, 'lora_train', payload)
    report = ROOT / 'reports' / f'lora_train_{args.candidate}.json'
    report.write_text(json.dumps({'ok': True, 'manifest': str(manifest_path.relative_to(ROOT)), **manifest}, indent=2), encoding='utf-8')
    print(json.dumps({'ok': True, 'manifest': str(manifest_path), 'candidate': args.candidate, 'status': manifest['status']}))


if __name__ == '__main__':
    main()
