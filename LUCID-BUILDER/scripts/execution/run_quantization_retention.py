from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def load_json(path: str | Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding='utf-8'))


def mean_for_results(results: list[dict[str, Any]]) -> float:
    values = [float(r.get('normalized_score', 0.0)) for r in results]
    return round(sum(values) / max(1, len(values)), 4)


def compare_scored_outputs(full_precision: dict[str, Any], quantized: dict[str, Any], threshold: float) -> dict[str, Any]:
    fp_results = full_precision.get('results', [])
    q_results = quantized.get('results', [])
    fp_by_task = {r.get('task_id'): r for r in fp_results if r.get('task_id')}
    q_by_task = {r.get('task_id'): r for r in q_results if r.get('task_id')}
    shared = sorted(set(fp_by_task) & set(q_by_task))
    regressions = []
    for task_id in shared:
        fp_score = float(fp_by_task[task_id].get('normalized_score', 0.0))
        q_score = float(q_by_task[task_id].get('normalized_score', 0.0))
        regressions.append({'task_id': task_id, 'full_precision': fp_score, 'quantized': q_score, 'delta': round(q_score - fp_score, 4)})
    regressions.sort(key=lambda row: row['delta'])
    fp_overall = full_precision.get('overall_weighted_score', mean_for_results(fp_results))
    q_overall = quantized.get('overall_weighted_score', mean_for_results(q_results))
    retention = round((q_overall / fp_overall), 4) if fp_overall else 0.0
    return {
        'ok': retention >= threshold,
        'mode': 'direct_compare',
        'shared_tasks': len(shared),
        'full_precision_score': fp_overall,
        'quantized_score': q_overall,
        'retention_ratio': retention,
        'threshold': threshold,
        'largest_regressions': regressions[:10],
    }


def scoreboard_fallback(scoreboard: dict[str, Any]) -> dict[str, Any]:
    models = sorted(scoreboard.get('models', []), key=lambda m: m.get('overall_weighted_score', 0.0), reverse=True)
    best = models[0] if models else None
    return {
        'ok': True,
        'mode': 'scoreboard_fallback',
        'models_seen': len(models),
        'best_current_model': best,
        'note': 'Starter retention fallback. Supply --full-precision and --quantized scored outputs for a real retention comparison.',
        'models': models,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--scoreboard', default='results/scoreboard.json')
    parser.add_argument('--output', default='reports/quantization_retention_report.json')
    parser.add_argument('--full-precision', dest='full_precision', default=None)
    parser.add_argument('--quantized', default=None)
    parser.add_argument('--threshold', type=float, default=0.95)
    args = parser.parse_args()

    if args.full_precision and args.quantized:
        report = compare_scored_outputs(load_json(args.full_precision), load_json(args.quantized), args.threshold)
    else:
        report = scoreboard_fallback(load_json(args.scoreboard))

    Path(args.output).write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({'ok': report['ok'], 'output': args.output, 'mode': report['mode']}, indent=2))
    if not report['ok']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
