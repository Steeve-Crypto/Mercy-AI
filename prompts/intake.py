from __future__ import annotations

from typing import Any


INTAKE_PROMPT_VERSION = "intake-prompts-1.0"
DC_ETHICS_NOTE = (
    "Apply D.C. Bar Ethics Opinion 388, RPC 1.1 competence, RPC 1.6 confidentiality, "
    "human attorney supervision, conflict screening, and citation/source verification."
)


def _matter_label(context: dict[str, Any]) -> str:
    return str(context.get("name") or context.get("matter_name") or "new D.C. matter")


def initial_client_intake_prompt(context: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": "initial_client_intake",
        "version": INTAKE_PROMPT_VERSION,
        "system": (
            "You are Mercy's D.C. legal client-intake assistant. Gather only information needed "
            "to open or update a matter, preserve confidentiality, avoid legal conclusions, and "
            "flag anything requiring attorney review before advice is given."
        ),
        "user": (
            f"Open or update intake for {_matter_label(context)}. Confirm client identity, contact details, "
            "client role, opposing parties, jurisdiction, urgent deadlines, documents received, and the "
            "client's requested outcome. Do not promise representation or a result."
        ),
        "required_fields": [
            "client_name",
            "client_role",
            "opposing_parties",
            "jurisdiction",
            "requested_relief",
            "deadlines",
            "documents",
        ],
        "ethics_note": DC_ETHICS_NOTE,
    }


def matter_fact_gathering_prompt(context: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": "matter_fact_gathering",
        "version": INTAKE_PROMPT_VERSION,
        "system": (
            "You gather matter facts for D.C. counsel. Separate facts from assumptions, preserve source "
            "provenance, identify missing documents, and mark disputed or unverified facts."
        ),
        "user": (
            f"For {_matter_label(context)}, collect a concise chronology, key actors, documents, communications, "
            "deadlines, requested relief, damages or exposure, and facts that affect D.C. venue, rule, "
            "agency, court, or statutory analysis."
        ),
        "required_fields": [
            "chronology",
            "key_facts",
            "documents",
            "deadlines",
            "requested_relief",
            "missing_information",
        ],
        "ethics_note": DC_ETHICS_NOTE,
    }


def conflict_check_prompt(context: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": "conflict_check",
        "version": INTAKE_PROMPT_VERSION,
        "system": (
            "You prepare conflict-check data for a D.C. attorney. Do not clear conflicts yourself. "
            "Normalize party names, affiliates, witnesses, agencies, courts, and related entities for review."
        ),
        "user": (
            f"Prepare conflict-check inputs for {_matter_label(context)}. List client, prospective client, "
            "opposing parties, affiliates, insurers, witnesses, agencies, adjudicators, prior counsel, "
            "and related matters. Flag incomplete identities and any adverse-party overlap."
        ),
        "required_fields": [
            "client_id",
            "client_name",
            "opposing_parties",
            "related_parties",
            "prior_representation",
            "conflict_notes",
        ],
        "ethics_note": DC_ETHICS_NOTE,
    }


def scope_confirmation_prompt(context: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": "scope_confirmation",
        "version": INTAKE_PROMPT_VERSION,
        "system": (
            "You help D.C. counsel confirm engagement scope. State proposed scope, exclusions, assumptions, "
            "client responsibilities, confidentiality limits, and attorney-review requirements without "
            "creating an engagement agreement by implication."
        ),
        "user": (
            f"Draft scope-confirmation notes for {_matter_label(context)} based on requested relief, matter type, "
            "known deadlines, documents, and missing information. Flag any item that must be resolved before "
            "work proceeds."
        ),
        "required_fields": [
            "requested_relief",
            "scope_of_work",
            "excluded_work",
            "client_responsibilities",
            "deadlines",
            "attorney_approval",
        ],
        "ethics_note": DC_ETHICS_NOTE,
    }


def build_intake_prompt_library(context: dict[str, Any]) -> dict[str, Any]:
    return {
        "version": INTAKE_PROMPT_VERSION,
        "jurisdiction": "District of Columbia",
        "prompts": [
            initial_client_intake_prompt(context),
            matter_fact_gathering_prompt(context),
            conflict_check_prompt(context),
            scope_confirmation_prompt(context),
        ],
    }


__all__ = [
    "INTAKE_PROMPT_VERSION",
    "build_intake_prompt_library",
    "initial_client_intake_prompt",
    "matter_fact_gathering_prompt",
    "conflict_check_prompt",
    "scope_confirmation_prompt",
]

