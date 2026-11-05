# Phase 3 Status — 2026-04-14

Cognition-core now has an **honest external-runtime wiring layer** for the training / merge / GGUF export chain.

## What became more real

- Training stages now support `--mode scaffold|external|auto`.
- External commands can be supplied by config or environment variables.
- Stage manifests now record whether a stage was scaffolded, externally completed, or externally failed.
- Quantization retention can now run in two modes:
  - scoreboard fallback
  - direct full-precision vs quantized scored-output comparison

## What this still does not mean

This repo is **still not shipping a built-in trainer or GGUF exporter**. It now acts as a reproducible control plane that can drive those tools honestly when they are provided.

## Remaining hard blockers

- real trainer integration for at least one concrete base model path
- real merge implementation
- real GGUF conversion command
- real backend-loaded benchmark run for the exported artifact
- promotion gates tied to produced artifact families rather than only scaffold records
