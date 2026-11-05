
from __future__ import annotations
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
REQUIRED = [
    ROOT / 'configs' / 'base_model_candidates.yaml',
    ROOT / 'configs' / 'training' / 'sft_lora.yaml',
    ROOT / 'configs' / 'training' / 'preference_dpo.yaml',
    ROOT / 'configs' / 'training' / 'gguf_export.yaml',
    ROOT / 'scripts' / 'training' / 'prepare_distillation_corpus.py',
    ROOT / 'scripts' / 'training' / 'train_lora_candidate.py',
    ROOT / 'scripts' / 'training' / 'train_preference_candidate.py',
    ROOT / 'scripts' / 'training' / 'merge_adapters_stub.py',
    ROOT / 'scripts' / 'training' / 'export_gguf_candidate.py',
]
def main() -> None:
    missing = [str(p.relative_to(ROOT)) for p in REQUIRED if not p.exists()]
    payload = {'status': 'pass' if not missing else 'fail', 'missing': missing}
    out = ROOT / 'reports' / 'training_readiness_gate.json'
    out.write_text(json.dumps(payload, indent=2), encoding='utf-8')
    print(json.dumps(payload, indent=2))
    if missing:
        raise SystemExit(1)
if __name__ == '__main__':
    main()
