# Upstream Event Release Flow — 2026-04-14

This repo is now complete as the local runtime and GGUF control plane. The last external dependency remains the upstream model-family weights and conversion toolchain.

## Release event flow

1. Copy `configs/production/real_gguf_build.env.example` to `configs/production/real_gguf_build.env`.
2. Fill in real absolute paths for base weights, merged weights, converter, quantizer, runtime binary, and outputs.
3. Run:
   ```bash
   scripts/production/release_flagship_event.sh
   ```
4. The release event will:
   - run strict GGUF preflight
   - build the GGUF handoff artifacts
   - register the produced GGUF or `.llamafile`
   - validate the active runtime
   - write upstream event manifests under `reports/upstream_events/`

## Why this matters

The runtime side is already complete. This release flow isolates the only remaining external dependency to the actual upstream model-family weights and tools.
