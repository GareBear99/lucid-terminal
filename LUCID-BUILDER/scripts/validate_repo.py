from __future__ import annotations

import json
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]

REQUIRED_FILES = [
    ROOT / "README.md",
    ROOT / "LICENSE",
    ROOT / "CONTRIBUTING.md",
    ROOT / "SECURITY.md",
    ROOT / "CODE_OF_CONDUCT.md",
    ROOT / "SUPPORT.md",
    ROOT / ".env.direct-runtime.example",
    ROOT / "specs" / "cognition_doctrine_v1.md",
    ROOT / "specs" / "cognition_contract_v1.yaml",
    ROOT / "specs" / "promotion_gates_v1.yaml",
    ROOT / "specs" / "benchmark_schema_v1.yaml",
    ROOT / "specs" / "repo_state_capsule_schema_v1.json",
    ROOT / "configs" / "dataset_policy_matrix.yaml",
    ROOT / "configs" / "model_registry.yaml",
    ROOT / "results" / "scoreboard.json",
    ROOT / "schemas" / "artifact_manifest_schema_v1.json",
    ROOT / "schemas" / "source_ingestion_manifest_schema_v1.json",
    ROOT / "schemas" / "runtime_receipt_schema_v1.json",
    ROOT / "schemas" / "upstream_event_manifest_schema_v1.json",
    ROOT / "docs" / "CURRENT_STATE_AND_NEXT_ACTIONS_2026-04-14.md",
    ROOT / "docs" / "ECOSYSTEM_INTEGRATION_MATRIX_2026-04-14.md",
    ROOT / "docs" / "PHASE3_EXTERNAL_RUNTIME_WIRING_2026-04-14.md",
    ROOT / "docs" / "PHASE3_STATUS_2026-04-14.md",
    ROOT / "docs" / "LLAMAFILE_BINARY_RUNTIME_2026-04-14.md",
    ROOT / "docs" / "FINAL_PRODUCTION_HANDOFF_2026-04-14.md",
    ROOT / "docs" / "RUNTIME_RECEIPTS_AND_TIMEOUTS_2026-04-14.md",
    ROOT / "docs" / "USER_END_RUNTIME_FLOW_2026-04-14.md",
    ROOT / "docs" / "BROWSER_UI_BOUNDARY_2026-04-14.md",
    ROOT / "scripts" / "runtime" / "doctor_direct_runtime.py",
    ROOT / "scripts" / "runtime" / "compile_llamafile_from_binary.py",
    ROOT / "scripts" / "operator" / "setup_local_user_runtime.sh",
    ROOT / "scripts" / "operator" / "run_local_prompt.sh",
    ROOT / "scripts" / "operator" / "benchmark_local_model.sh",
    ROOT / "docs" / "PRODUCTION_GGUF_BUILD_CONTRACT_2026-04-14.md",
    ROOT / "docs" / "UPSTREAM_EVENT_RELEASE_FLOW_2026-04-14.md",
    ROOT / "docs" / "FINAL_EXTERNAL_BOUNDARY_2026-04-14.md",
    ROOT / "configs" / "production" / "real_gguf_build.env.example",
    ROOT / "scripts" / "production" / "validate_real_gguf_build.sh",
    ROOT / "scripts" / "production" / "release_flagship_event.sh",
    ROOT / "scripts" / "production" / "write_upstream_event_manifest.py",
    ROOT / "configs" / "direct_runtime.yaml",
    ROOT / "configs" / "runtime" / "llamafile_build.yaml",
    ROOT / "configs" / "training" / "external_runtime.yaml",
    ROOT / ".github" / "workflows" / "ci.yml",
]

REQUIRED_BENCHMARK_FIELDS = {"id", "capability", "domain", "difficulty", "prompt", "reference", "scoring", "tags"}
SUPPORTED_SCORING_MODES = {"rubric", "retention", "pairwise"}
REQUIRED_MANIFEST_STEPS = {"validate_repo", "check_local_backend", "run_model_benchmarks", "score_benchmark_outputs", "promote_candidate", "run_quantization_retention"}
EXPECTED_SCRIPT_PATHS = {
    "validate_repo": ROOT / "scripts" / "validate_repo.py",
    "check_local_backend": ROOT / "scripts" / "execution" / "check_local_backend.py",
    "run_model_benchmarks": ROOT / "scripts" / "execution" / "run_model_benchmarks.py",
    "score_benchmark_outputs": ROOT / "scripts" / "execution" / "score_benchmark_outputs.py",
    "promote_candidate": ROOT / "scripts" / "execution" / "promote_candidate.py",
    "run_quantization_retention": ROOT / "scripts" / "execution" / "run_quantization_retention.py",
}


def validate_jsonl(path: Path) -> list[str]:
    errors = []
    with path.open("r", encoding="utf-8") as f:
        for lineno, line in enumerate(f, start=1):
            if not line.strip():
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as exc:
                errors.append(f"{path.relative_to(ROOT)}:{lineno}: invalid json: {exc}")
                continue
            if not isinstance(obj, dict):
                errors.append(f"{path.relative_to(ROOT)}:{lineno}: record is not an object")
                continue
            if "benchmarks" in path.parts:
                missing = sorted(REQUIRED_BENCHMARK_FIELDS - set(obj.keys()))
                if missing:
                    errors.append(f"{path.relative_to(ROOT)}:{lineno}: missing benchmark fields: {', '.join(missing)}")
                scoring = obj.get("scoring")
                if scoring not in SUPPORTED_SCORING_MODES:
                    errors.append(f"{path.relative_to(ROOT)}:{lineno}: unsupported scoring mode: {scoring}")
    return errors


def validate_yaml_file(path: Path) -> list[str]:
    try:
        with path.open("r", encoding="utf-8") as f:
            yaml.safe_load(f)
        return []
    except yaml.YAMLError as exc:
        return [f"{path.relative_to(ROOT)}: invalid yaml: {exc}"]


def validate_json_file(path: Path) -> list[str]:
    try:
        json.loads(path.read_text(encoding="utf-8"))
        return []
    except json.JSONDecodeError as exc:
        return [f"{path.relative_to(ROOT)}: invalid json: {exc}"]


def validate_attachment_examples(schema_path: Path) -> list[str]:
    errors: list[str] = []
    try:
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        validator = Draft202012Validator(schema)
    except Exception as exc:
        return [f"{schema_path.relative_to(ROOT)}: schema load failed: {exc}"]
    example = ROOT / "examples" / "attachments" / "sample_attachment_record.json"
    if example.exists():
        payload = json.loads(example.read_text(encoding="utf-8"))
        for err in validator.iter_errors(payload):
            errors.append(f"{example.relative_to(ROOT)}: schema violation: {err.message}")
    return errors


def validate_run_manifest(path: Path) -> list[str]:
    errors: list[str] = []
    manifest = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(manifest, dict):
        return [f"{path.relative_to(ROOT)}: manifest is not a mapping"]
    if "candidate_gate_sequence" in manifest:
        seen = set(manifest.get("candidate_gate_sequence", []))
    else:
        steps = manifest.get("steps", [])
        seen = {step.get("name") for step in steps if isinstance(step, dict)}
    missing = sorted(REQUIRED_MANIFEST_STEPS - seen)
    if missing:
        errors.append(f"{path.relative_to(ROOT)}: missing required manifest steps: {', '.join(missing)}")
    for name, script_path in EXPECTED_SCRIPT_PATHS.items():
        if not script_path.exists():
            errors.append(f"missing script for manifest step {name}: {script_path.relative_to(ROOT)}")
    return errors


def count_nonempty_lines(path: Path) -> int:
    return sum(1 for line in path.read_text(encoding="utf-8").splitlines() if line.strip())


def main() -> None:
    errors: list[str] = []
    jsonl_files = list(ROOT.rglob("*.jsonl"))
    yaml_files = list(ROOT.rglob("*.yaml")) + list(ROOT.rglob("*.yml"))
    json_files = [p for p in ROOT.rglob("*.json") if p.name != "sample_attachment_record.json"]

    for path in REQUIRED_FILES:
        if not path.exists():
            errors.append(f"missing required file: {path.relative_to(ROOT)}")

    for path in jsonl_files:
        errors.extend(validate_jsonl(path))
    for path in yaml_files:
        errors.extend(validate_yaml_file(path))
    for path in json_files:
        errors.extend(validate_json_file(path))
    errors.extend(validate_attachment_examples(ROOT / "schemas" / "attachment_record_schema_v1.json"))
    errors.extend(validate_run_manifest(ROOT / "configs" / "run_manifest.yaml"))

    dataset_counts = {str(path.relative_to(ROOT)): count_nonempty_lines(path) for path in (ROOT / "data").rglob("*.jsonl")}
    benchmark_counts = {str(path.relative_to(ROOT)): count_nonempty_lines(path) for path in (ROOT / "benchmarks").rglob("*.jsonl")}

    report = {
        "ok": not errors,
        "jsonl_files_checked": len(jsonl_files),
        "yaml_files_checked": len(yaml_files),
        "json_files_checked": len(json_files),
        "dataset_files": len(dataset_counts),
        "benchmark_files": len(benchmark_counts),
        "dataset_total_records": sum(dataset_counts.values()),
        "benchmark_total_tasks": sum(benchmark_counts.values()),
        "errors": errors,
    }
    print(json.dumps(report, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
