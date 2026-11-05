from __future__ import annotations

import argparse
import json
import socket
import time
from pathlib import Path


def load_json_or_empty(value: str) -> dict:
    if not value:
        return {}
    parsed = json.loads(value)
    if not isinstance(parsed, dict):
        raise ValueError('expected object json')
    return parsed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--event-type', required=True, choices=['build', 'register', 'validate', 'release'])
    parser.add_argument('--flagship-model-name', required=True)
    parser.add_argument('--flagship-version', required=True)
    parser.add_argument('--model-family', required=True)
    parser.add_argument('--status', required=True, choices=['started', 'passed', 'failed'])
    parser.add_argument('--inputs-json', default='{}')
    parser.add_argument('--outputs-json', default='{}')
    parser.add_argument('--notes-json', default='[]')
    parser.add_argument('--release-candidate', action='store_true')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()

    inputs = load_json_or_empty(args.inputs_json)
    outputs = load_json_or_empty(args.outputs_json)
    notes = json.loads(args.notes_json)
    if not isinstance(notes, list):
        raise ValueError('notes-json must decode to a list')

    payload = {
        'event_type': args.event_type,
        'flagship_model_name': args.flagship_model_name,
        'flagship_version': args.flagship_version,
        'model_family': args.model_family,
        'created_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'status': args.status,
        'host': socket.gethostname(),
        'inputs': inputs,
        'outputs': outputs,
        'notes': [str(x) for x in notes],
        'release_candidate': bool(args.release_candidate),
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2), encoding='utf-8')
    print(output)


if __name__ == '__main__':
    main()
