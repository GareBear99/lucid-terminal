from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime.model_factory import build_adapter


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def main() -> None:
    ap = argparse.ArgumentParser(description="Validate a direct local runtime path with no server.")
    ap.add_argument("--adapter", choices=["command", "exemplar"], default=os.environ.get("COGNITION_RUNTIME_ADAPTER", "exemplar"))
    ap.add_argument("--artifact", default=None)
    ap.add_argument("--command-template", default=None)
    ap.add_argument("--model", default=None)
    ap.add_argument("--timeout-seconds", type=float, default=120)
    ap.add_argument("--first-output-timeout-seconds", type=float, default=30)
    ap.add_argument("--idle-timeout-seconds", type=float, default=20)
    ap.add_argument("--max-output-bytes", type=int, default=262144)
    ap.add_argument("--smoke-prompt", default="Reply with READY.")
    args = ap.parse_args()
    load_env_file(ROOT / ".env.direct-runtime")
    load_env_file(ROOT / ".env")

    kwargs = {
        "model": args.model,
        "timeout_seconds": args.timeout_seconds,
        "first_output_timeout_seconds": args.first_output_timeout_seconds,
        "idle_timeout_seconds": args.idle_timeout_seconds,
        "max_output_bytes": args.max_output_bytes,
    }
    if args.command_template:
        kwargs["command_template"] = args.command_template
    if args.artifact:
        kwargs["artifact"] = args.artifact
    adapter = build_adapter(args.adapter, **{k:v for k,v in kwargs.items() if v is not None})
    health = adapter.healthcheck()
    if hasattr(adapter, "smokecheck"):
        smoke = adapter.smokecheck(prompt=args.smoke_prompt)
    else:
        response = adapter.generate(args.smoke_prompt, system_prompt="doctor smokecheck")
        smoke = {
            "ok": response.ok and bool(response.text.strip()),
            "text": response.text[:120],
            "error": response.error,
            "finish_reason": response.finish_reason,
            "latency_ms": response.latency_ms,
            "meta": response.meta,
        }
    payload = {
        "ok": bool(health.get("ok")) and bool(smoke.get("ok")),
        "adapter": args.adapter,
        "healthcheck": health,
        "smokecheck": smoke,
        "user_end_summary": {
            "server_required": False,
            "browser_ui_optional": True,
            "native_execution_authoritative": True,
        },
    }
    print(json.dumps(payload, indent=2))
    if not payload["ok"]:
        raise SystemExit(1)

if __name__ == "__main__":
    main()
