from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TEMPLATE = ROOT / "templates" / "model_card_template.md"
OUT_DIR = ROOT / "reports" / "model_cards"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-name", required=True)
    parser.add_argument("--adapter", required=True)
    parser.add_argument("--prompt-profile", default="minimal_doctrine")
    parser.add_argument("--scoreboard", default="results/scoreboard.json")
    args = parser.parse_args()

    fallback_template = "# {model_name}\n\nAdapter: {adapter}\nPrompt profile: {prompt_profile}\n"
    template = TEMPLATE.read_text(encoding="utf-8") if TEMPLATE.exists() else fallback_template
    scoreboard = ROOT / args.scoreboard
    metrics = {}
    if scoreboard.exists():
        try:
            payload = json.loads(scoreboard.read_text(encoding="utf-8"))
            if isinstance(payload, dict):
                metrics = payload
        except Exception:
            metrics = {}
    content = template.format(model_name=args.model_name, adapter=args.adapter, prompt_profile=args.prompt_profile, metrics=json.dumps(metrics, indent=2))
    out = OUT_DIR / f"{args.model_name}.md"
    out.write_text(content, encoding="utf-8")
    print(json.dumps({"ok": True, "model_card": str(out.relative_to(ROOT))}, indent=2))


if __name__ == "__main__":
    main()
