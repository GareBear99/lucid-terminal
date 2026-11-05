# Llamafile Binary Runtime Doctrine — 2026-04-14

Cognition Core's intended final local runtime is **GGUF-backed, CPU-capable, local-direct, and no-server**.

## Canonical execution shape

- The authoritative runtime is a **native local binary**.
- The preferred portable artifact is a **llamafile-style executable** composed from:
  - a compiled local runtime binary
  - a GGUF model payload
- The browser may host the UI, but **execution remains native and local**.
- No always-on daemon or server is required.

## Required runtime guards

The direct runtime lane must fail loudly when a local binary appears alive but is not actually generating.

Cognition Core therefore tracks these states:

- `BOOTING`
- `MODEL_RESOLVING`
- `MODEL_LOADING`
- `TOKENIZING`
- `GENERATING`
- `STREAM_IDLE`
- `COMPLETED`
- `TIMED_OUT`
- `FAILED`
- `KILLED`

And these guardrails:

- overall runtime timeout
- first-output / no-generation timeout
- mid-generation idle timeout
- max output byte ceiling

## Build path

The repo now includes `scripts/runtime/compile_llamafile_from_binary.py`.

That script does the final native packaging step:

1. take a compiled runtime binary
2. take a GGUF payload
3. concatenate them into a self-contained local executable
4. mark the result executable
5. emit a deterministic manifest summary

This keeps the production doctrine honest:

**browser UI optional, native local GGUF execution authoritative**.
