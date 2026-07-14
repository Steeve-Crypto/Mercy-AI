"""CLI entrypoint for the out-of-process Mercy LARS worker.

Examples:

    $env:MERCY_ENV='local'
    $env:MERCY_AUTH_MODE='dev'
    python -m scripts.lars_worker --tenant-id local-dev --once

    python -m scripts.lars_worker --tenant-id TENANT --poll-seconds 5
"""

from __future__ import annotations

import argparse
import json
import os
import sys


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Mercy LARS out-of-process assignment worker")
    parser.add_argument("--tenant-id", required=True, help="Tenant to claim jobs for")
    parser.add_argument("--once", action="store_true", help="Process one claim batch and exit")
    parser.add_argument("--poll-seconds", type=float, default=5.0)
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--max-ticks", type=int, default=8)
    parser.add_argument("--max-iterations", type=int, default=None, help="Stop after N loops (tests)")
    args = parser.parse_args(argv)

    os.environ.setdefault("MERCY_ENV", os.environ.get("MERCY_ENV") or "local")

    from lars.worker import run_once, run_worker_loop

    if args.once:
        payload = run_once(tenant_id=args.tenant_id, limit=args.limit, max_ticks=args.max_ticks)
    else:
        payload = run_worker_loop(
            tenant_id=args.tenant_id,
            poll_seconds=args.poll_seconds,
            limit=args.limit,
            max_ticks=args.max_ticks,
            max_iterations=args.max_iterations,
        )
    print(json.dumps(payload, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
