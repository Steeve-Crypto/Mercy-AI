from __future__ import annotations

import argparse
import json
import sys
from urllib import error, request


DEFAULT_API_URL = "http://127.0.0.1:8000"


def _request(api_url: str, method: str, path: str, payload: dict | None = None) -> dict | list:
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = request.Request(f"{api_url}{path}", data=data, headers=headers, method=method)
    try:
        with request.urlopen(req, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8")
        raise SystemExit(f"HTTP {exc.code}: {body}") from exc
    except error.URLError as exc:
        raise SystemExit(f"Connection failed: {exc.reason}") from exc


def _print(value: dict | list, output: str) -> None:
    if output == "json":
        print(json.dumps(value, indent=2, ensure_ascii=True))
        return
    if isinstance(value, list):
        for item in value:
            print(json.dumps(item, ensure_ascii=True))
        return
    for key, item in value.items():
        print(f"{key}: {item}")


def main(argv: list[str] | None = None) -> int:
    raw_args = list(sys.argv[1:] if argv is None else argv)
    defaults = {"api_url": DEFAULT_API_URL, "output": "table"}
    for option, key in (("--api-url", "api_url"), ("--output", "output")):
        if option in raw_args:
            index = raw_args.index(option)
            try:
                defaults[key] = raw_args[index + 1]
            except IndexError as exc:
                raise SystemExit(f"{option} requires a value") from exc
            del raw_args[index : index + 2]

    parser = argparse.ArgumentParser(prog="mercy", description="Mercy AI local CLI.")
    parser.add_argument("--api-url", default=defaults["api_url"])
    parser.add_argument("--output", choices=["table", "json"], default=defaults["output"])
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("health")
    sub.add_parser("capabilities")
    sub.add_parser("matters")

    create = sub.add_parser("create-matter")
    create.add_argument("name")
    create.add_argument("--tier", choices=["free", "premium"], default="free")

    draft = sub.add_parser("draft")
    draft.add_argument("--facts-json", required=True)
    draft.add_argument("--draft-type", default="statement_of_case")
    draft.add_argument("--requested-relief", default=None)
    draft.add_argument("--matter-id", default=None)

    billing = sub.add_parser("billing-report")
    billing.add_argument("matter_id")

    args = parser.parse_args(raw_args)

    if args.command == "health":
        result = _request(args.api_url, "GET", "/health")
    elif args.command == "capabilities":
        result = _request(args.api_url, "GET", "/v1/product/capabilities")
    elif args.command == "matters":
        result = _request(args.api_url, "GET", "/v1/matters")
    elif args.command == "create-matter":
        result = _request(
            args.api_url,
            "POST",
            "/v1/matters",
            {"name": args.name, "tier": args.tier},
        )
    elif args.command == "draft":
        try:
            facts = json.loads(args.facts_json)
        except json.JSONDecodeError as exc:
            raise SystemExit(f"Invalid --facts-json: {exc}") from exc
        result = _request(
            args.api_url,
            "POST",
            "/v1/workspace/draft",
            {
                "facts": facts,
                "draft_type": args.draft_type,
                "requested_relief": args.requested_relief,
                "matter_id": args.matter_id,
            },
        )
    else:
        result = _request(args.api_url, "GET", f"/v1/matters/{args.matter_id}/billing-report")

    _print(result, args.output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
