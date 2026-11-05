from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime.model_factory import build_adapter


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--adapter', choices=['exemplar', 'command'], required=True)
    ap.add_argument('--artifact', default=None)
    ap.add_argument('--command-template', default=None)
    ap.add_argument('--model', default=None)
    ap.add_argument('--timeout-seconds', type=float, default=None)
    ap.add_argument('--first-output-timeout-seconds', type=float, default=None)
    ap.add_argument('--idle-timeout-seconds', type=float, default=None)
    ap.add_argument('--max-output-bytes', type=int, default=None)
    ap.add_argument('--prompt', required=True)
    ap.add_argument('--system-prompt', default='Plan, critique, repair, calibrate.')
    ap.add_argument('--receipt-path', default=None)
    args = ap.parse_args()

    kwargs = {}
    if args.artifact:
        kwargs['artifact'] = args.artifact
    if args.command_template:
        kwargs['command_template'] = args.command_template
    if args.model:
        kwargs['model'] = args.model
    if args.timeout_seconds is not None:
        kwargs['timeout_seconds'] = args.timeout_seconds
    if args.first_output_timeout_seconds is not None:
        kwargs['first_output_timeout_seconds'] = args.first_output_timeout_seconds
    if args.idle_timeout_seconds is not None:
        kwargs['idle_timeout_seconds'] = args.idle_timeout_seconds
    if args.max_output_bytes is not None:
        kwargs['max_output_bytes'] = args.max_output_bytes

    adapter = build_adapter(args.adapter, **kwargs)
    started = utcnow()
    response = adapter.generate(args.prompt, system_prompt=args.system_prompt)
    finished = utcnow()
    payload = {
        'ok': response.ok,
        'adapter': args.adapter,
        'backend_identity': response.backend_identity,
        'text': response.text,
        'error': response.error,
        'latency_ms': response.latency_ms,
        'finish_reason': response.finish_reason,
        'meta': response.meta,
    }
    print(json.dumps(payload, indent=2))

    receipt = {
        'ok': response.ok,
        'adapter': args.adapter,
        'backend_identity': response.backend_identity,
        'artifact': args.artifact,
        'command_template': args.command_template,
        'prompt_hash': sha256_text(args.prompt),
        'system_prompt_hash': sha256_text(args.system_prompt),
        'started_at': started,
        'finished_at': finished,
        'duration_ms': response.latency_ms,
        'finish_reason': response.finish_reason,
        'error': response.error,
        'meta': response.meta,
        'output_preview': response.text[:240],
    }
    receipt_path = Path(args.receipt_path) if args.receipt_path else ROOT / 'reports' / f'runtime_receipt_{args.adapter}_{receipt["prompt_hash"][:10]}.json'
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    receipt_path.write_text(json.dumps(receipt, indent=2), encoding='utf-8')

    if not response.ok:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
