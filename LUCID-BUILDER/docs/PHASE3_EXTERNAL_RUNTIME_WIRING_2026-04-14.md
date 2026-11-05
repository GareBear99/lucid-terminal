# Phase 3 External Runtime Wiring — 2026-04-14

This repo is now able to drive **real external** training / merge / export commands without pretending those tools exist inside the repository.

## Goal

Keep cognition-core honest:
- **scaffold mode** for reproducible dry runs and manifests
- **external mode** for real trainer/exporter integration

## Wiring methods

You can configure stage commands in either:
- `configs/training/external_runtime.yaml`
- or environment variables like `COGNITION_LORA_TRAIN_COMMAND`

## Supported format keys

- `{candidate}`
- `{base_model}`
- `{dataset}`
- `{preference_dataset}`
- `{output_dir}`
- `{artifacts_dir}`
- `{merge_dir}`
- `{gguf_dir}`

## Example

```yaml
stages:
  lora_train:
    mode: external
    command:
      - python
      - tools/run_sft.py
      - --base-model
      - "{base_model}"
      - --dataset
      - "{dataset}"
      - --output-dir
      - "{output_dir}"
```

## Honest boundary

This does **not** make cognition-core a built-in trainer. It makes it a reproducible control plane that can drive a real training/export toolchain.
