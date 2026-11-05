#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
python -m pip install --upgrade pip >/dev/null
pip install -r requirements.txt
if [[ ! -f .env.direct-runtime && -f .env.direct-runtime.example ]]; then
  cp .env.direct-runtime.example .env.direct-runtime
fi
cat <<'MSG'

Cognition Core local runtime setup complete.

Immediate working path:
1. Leave .env.direct-runtime on adapter=exemplar for the bundled local baseline.
2. Run:
   scripts/operator/run_local_prompt.sh "hello"

GGUF/local-binary path:
1. Edit .env.direct-runtime and set adapter=command.
2. Set your GGUF path and local binary or final .llamafile path.
3. Run a direct-runtime doctor check, for example:
   .venv/bin/python scripts/runtime/doctor_direct_runtime.py \
     --adapter command \
     --model /absolute/path/to/model.gguf \
     --command-template '/absolute/path/to/llama-cli -m {model} -f {combined_prompt_file}'

Or with a final llamafile artifact:
   .venv/bin/python scripts/runtime/doctor_direct_runtime.py \
     --adapter command \
     --command-template '/absolute/path/to/model.llamafile -f {combined_prompt_file}'
MSG
