# Production GGUF Build Contract

This document locks the authoritative flagship path:
merged model weights -> fp16 GGUF -> quantized GGUF -> optional `.llamafile` -> register -> validate -> ship.

Operator flow:
1. Copy `configs/production/real_gguf_build.env.example` to `configs/production/real_gguf_build.env`
2. Fill real upstream model-family toolchain paths.
3. Run `scripts/production/validate_real_gguf_build.sh`
4. Run `scripts/production/build_real_gguf_handoff.sh`
5. Register the artifact with `scripts/operator/register_real_gguf_artifact.sh`
6. Prove runtime readiness with `scripts/operator/validate_flagship_runtime.sh`
