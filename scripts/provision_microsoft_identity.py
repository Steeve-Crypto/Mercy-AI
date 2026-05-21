from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from mercy_storage import (  # noqa: E402
    list_microsoft_identity_mappings,
    set_microsoft_identity_mapping_status,
    upsert_microsoft_identity_mapping,
)


def _print_json(payload: Any) -> None:
    print(json.dumps(payload, indent=2, sort_keys=True))


def _add_scope_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--firm-id", default=None, help="Mercy firm boundary for firm users. Takes priority over tenant-id.")
    parser.add_argument("--tenant-id", default=None, help="Mercy solo tenant boundary. Required for solo users.")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Manually provision Microsoft Entra identities for Mercy Office NAA beta access.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    create = subparsers.add_parser("create", help="Create or update a Microsoft identity mapping.")
    create.add_argument("--microsoft-tenant-id", required=True)
    create.add_argument("--microsoft-object-id", required=True)
    create.add_argument("--email", default=None)
    create.add_argument("--mercy-user-id", required=True)
    _add_scope_args(create)
    create.add_argument("--roles", default="attorney", help="Comma-separated Mercy roles.")
    create.add_argument("--status", default="pending", choices=("active", "disabled", "pending"))

    update = subparsers.add_parser("update", help="Update roles, scope, email, or status for a mapping.")
    update.add_argument("--microsoft-tenant-id", required=True)
    update.add_argument("--microsoft-object-id", required=True)
    update.add_argument("--email", default=None)
    update.add_argument("--mercy-user-id", required=True)
    _add_scope_args(update)
    update.add_argument("--roles", default="attorney")
    update.add_argument("--status", default="active", choices=("active", "disabled", "pending"))

    list_cmd = subparsers.add_parser("list", help="List provisioned Microsoft identity mappings.")
    list_cmd.add_argument("--json", action="store_true", help="Print JSON instead of a compact table.")

    disable = subparsers.add_parser("disable", help="Disable a Microsoft identity mapping.")
    disable.add_argument("--microsoft-tenant-id", required=True)
    disable.add_argument("--microsoft-object-id", required=True)

    args = parser.parse_args(argv)

    try:
        if args.command in {"create", "update"}:
            mapping = upsert_microsoft_identity_mapping(
                microsoft_tenant_id=args.microsoft_tenant_id,
                microsoft_object_id=args.microsoft_object_id,
                email=args.email,
                mercy_user_id=args.mercy_user_id,
                firm_id=args.firm_id,
                tenant_id=args.tenant_id,
                roles=args.roles,
                status=args.status,
            )
            _print_json(mapping)
            return 0
        if args.command == "disable":
            _print_json(set_microsoft_identity_mapping_status(args.microsoft_tenant_id, args.microsoft_object_id, "disabled"))
            return 0
        if args.command == "list":
            mappings = list_microsoft_identity_mappings()
            if args.json:
                _print_json(mappings)
            else:
                for item in mappings:
                    print(
                        "\t".join(
                            [
                                item["status"],
                                item["microsoft_tenant_id"],
                                item["microsoft_object_id"],
                                item["mercy_user_id"],
                                item["effective_scope_type"],
                                item["effective_scope_id"],
                                ",".join(item["roles"]),
                                item.get("email") or "",
                            ]
                        )
                    )
            return 0
    except Exception as exc:
        print(f"Provisioning failed: {exc}", file=sys.stderr)
        return 1

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
