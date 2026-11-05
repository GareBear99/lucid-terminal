# Final External Boundary — 2026-04-14

## Complete inside this repo
- Local no-server runtime
- Bundled baseline model
- Direct GGUF / `.llamafile` switchover
- Timeout and runtime receipt system
- Benchmark / scoring / promotion shell
- User setup, validation, and operator scripts
- GGUF production contract and release-event path

## External by nature
- Upstream flagship model-family base weights
- Upstream merge implementation for that family
- Upstream GGUF conversion toolchain for that family
- Upstream quantization tooling for that family

Once those are supplied, this repo can build, register, validate, and use the real flagship GGUF end to end.
