from __future__ import annotations

import json
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    report = {
        "repo_exists": root.exists(),
        "has_env_example": (root / ".env.example").exists(),
        "has_changelog": (root / "CHANGELOG.md").exists(),
        "has_handoff_doc": (root / "ops/PRODUCTION_HANDOFF.md").exists(),
        "has_incident_doc": (root / "ops/INCIDENT_RESPONSE.md").exists(),
        "has_readiness_matrix": (root / "docs/PRODUCTION_READINESS_MATRIX.md").exists(),
        "has_docker_compose": (root / "docker-compose.local-backends.yml").exists(),
    }
    out = root / "reports/readiness_report.json"
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
