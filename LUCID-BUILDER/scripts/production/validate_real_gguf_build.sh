#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${1:-$ROOT_DIR/configs/production/real_gguf_build.env}"
[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE" >&2; exit 2; }
source "$ENV_FILE"
need(){ local n="$1"; [[ -n "${!n:-}" ]] || { echo "Missing required env: $n" >&2; exit 3; }; }
need FLAGSHIP_MODEL_NAME; need FLAGSHIP_VERSION; need MODEL_FAMILY; need COGNITION_CANDIDATE_ID; need COGNITION_BASE_MODEL_DIR; need COGNITION_MERGED_MODEL_DIR; need COGNITION_FP16_MODEL_FILE; need COGNITION_QUANTIZED_MODEL_FILE; need COGNITION_CONVERT_SCRIPT; need COGNITION_QUANTIZE_BIN; need COGNITION_RUNTIME_BINARY; need COGNITION_PYTHON_BIN; need COGNITION_QUANT_TYPE
[[ -d "$COGNITION_BASE_MODEL_DIR" ]] || { echo "Base model dir missing: $COGNITION_BASE_MODEL_DIR" >&2; exit 4; }
[[ -d "$COGNITION_MERGED_MODEL_DIR" ]] || { echo "Merged model dir missing: $COGNITION_MERGED_MODEL_DIR" >&2; exit 4; }
[[ -f "$COGNITION_CONVERT_SCRIPT" ]] || { echo "Convert script missing: $COGNITION_CONVERT_SCRIPT" >&2; exit 4; }
[[ -x "$COGNITION_QUANTIZE_BIN" || -f "$COGNITION_QUANTIZE_BIN" ]] || { echo "Quantizer missing: $COGNITION_QUANTIZE_BIN" >&2; exit 4; }
[[ -x "$COGNITION_RUNTIME_BINARY" || -f "$COGNITION_RUNTIME_BINARY" ]] || { echo "Runtime binary missing: $COGNITION_RUNTIME_BINARY" >&2; exit 4; }
command -v "$COGNITION_PYTHON_BIN" >/dev/null 2>&1 || { echo "Python binary not runnable: $COGNITION_PYTHON_BIN" >&2; exit 4; }
mkdir -p "$(dirname "$COGNITION_FP16_MODEL_FILE")" "$(dirname "$COGNITION_QUANTIZED_MODEL_FILE")"
[[ "$COGNITION_FP16_MODEL_FILE" == *.gguf ]] || { echo "FP16 output must end with .gguf" >&2; exit 5; }
[[ "$COGNITION_QUANTIZED_MODEL_FILE" == *.gguf ]] || { echo "Quantized output must end with .gguf" >&2; exit 5; }
[[ "$COGNITION_FP16_MODEL_FILE" != "$COGNITION_QUANTIZED_MODEL_FILE" ]] || { echo "FP16 and quantized GGUF outputs must differ" >&2; exit 5; }
if [[ -n "${COGNITION_MERGE_COMMAND:-}" ]]; then
  command -v bash >/dev/null 2>&1 || { echo "bash not available for merge command" >&2; exit 5; }
fi
if [[ "${BUILD_LLAMAFILE:-1}" == "1" ]]; then
  need COGNITION_LLAMAFILE_FILE; need COGNITION_LLAMAFILE_BINARY
  [[ -x "$COGNITION_LLAMAFILE_BINARY" || -f "$COGNITION_LLAMAFILE_BINARY" ]] || { echo "Llamafile binary missing: $COGNITION_LLAMAFILE_BINARY" >&2; exit 4; }
  [[ "$COGNITION_LLAMAFILE_FILE" != "$COGNITION_QUANTIZED_MODEL_FILE" ]] || { echo "Llamafile output must differ from GGUF output" >&2; exit 5; }
fi
echo "GGUF build preflight passed for $FLAGSHIP_MODEL_NAME v$FLAGSHIP_VERSION ($MODEL_FAMILY)"
