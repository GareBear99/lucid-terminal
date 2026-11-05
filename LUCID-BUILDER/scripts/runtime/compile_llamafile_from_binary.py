from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    ap = argparse.ArgumentParser(description='Compose a self-contained llamafile by concatenating a runtime binary and GGUF payload.')
    ap.add_argument('--runtime-binary', required=True)
    ap.add_argument('--gguf', required=True)
    ap.add_argument('--output', required=True)
    ap.add_argument('--force', action='store_true')
    args = ap.parse_args()

    runtime_binary = Path(args.runtime_binary)
    gguf = Path(args.gguf)
    output = Path(args.output)

    if not runtime_binary.exists():
        raise SystemExit(f'runtime binary not found: {runtime_binary}')
    if not gguf.exists():
        raise SystemExit(f'gguf model not found: {gguf}')
    if output.exists() and not args.force:
        raise SystemExit(f'output already exists: {output} (use --force to overwrite)')

    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open('wb') as out:
        out.write(runtime_binary.read_bytes())
        out.write(gguf.read_bytes())
    os.chmod(output, 0o755)

    payload = {
        'ok': True,
        'runtime_binary': str(runtime_binary),
        'gguf': str(gguf),
        'output': str(output),
        'runtime_binary_sha256': sha256_file(runtime_binary),
        'gguf_sha256': sha256_file(gguf),
        'output_sha256': sha256_file(output),
        'mode': 'llamafile_binary_concat',
        'note': 'This creates a native local direct-runtime artifact. Browser UI remains optional and non-authoritative.',
    }
    print(json.dumps(payload, indent=2))


if __name__ == '__main__':
    main()
