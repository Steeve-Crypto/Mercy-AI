from __future__ import annotations

import argparse
import json
from typing import Any

from monitoring import monitoring_status


def _print_status(report: dict[str, Any]) -> None:
    metrics = report["metrics"]
    cost = report["cost_breakdown"]
    alerts = report["alerts"]
    usage = metrics["usage"]
    quota = metrics["quota"]
    print("Mercy monitoring status")
    print(f"Window: {metrics['window_days']} days")
    print(f"Active beta users: {metrics['active_beta_users']}")
    print(f"Tenants: {metrics['tenant_count']}")
    print(f"Messages: {usage['messages']}")
    print(f"Tokens: {usage['prompt_tokens'] + usage['completion_tokens']}")
    print(f"Estimated cost: ${cost['total_estimated_cost_usd']:.6f}")
    print(f"Guardrails: {metrics['guardrail_triggers']}")
    print(f"Error rate: {metrics['error_rates']['error_rate']}")
    print(f"Near quota users: {len(quota['near_limit_users'])}")
    print(f"Alerts: {len(alerts)}")
    for alert in alerts:
        print(f"- {alert['severity']}: {alert['kind']} - {alert['message']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Mercy production monitoring CLI.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    status_parser = subparsers.add_parser("status", help="Show monitoring status for the recent window.")
    status_parser.add_argument("--days", type=int, default=7)
    status_parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    if args.command == "status":
        report = monitoring_status(days=max(1, min(args.days, 90)))
        if args.json:
            print(json.dumps(report, indent=2, sort_keys=True))
        else:
            _print_status(report)


if __name__ == "__main__":
    main()
