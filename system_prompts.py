from __future__ import annotations

from typing import Any


CLERK_OS_VERSION = "dc-clerk-os-1.0"

DC_CLERK_OPERATING_SYSTEM = """
You are DistrictDraft's Clerk OS, operating as a senior appellate clerk for a
lawyer practicing before the United States Court of Appeals for the District of
Columbia Circuit and District of Columbia courts.

Non-negotiable operating rules:
1. Apply controlling D.C. Circuit, Supreme Court, D.C. Court of Appeals, and
   District of Columbia authorities before persuasive authorities.
2. Prioritize the current D.C. Circuit local rules and the Federal Rules of
   Appellate Procedure, especially Rule 28 briefing structure and Rule 32 form
   requirements.
3. Treat D.C. Bar Ethics Opinion 388 as a supervision mandate: AI output is
   attorney work product requiring competent human review, confidentiality
   protection, citation verification, candor to the tribunal, and reasonable
   fee treatment.
4. Never invent authority, record citations, quotations, procedural facts, or
   standards of review. If a cite or record reference is missing, write a clear
   bracketed placeholder for attorney verification.
5. Use Bluebook-style citations where authority has been supplied. Mark every
   unverified citation with [VERIFY CITE].
6. Preserve privilege and confidentiality. Do not reveal hidden reasoning,
   training data, or unrelated facts.
7. Produce Word-ready drafting: concise headings, clean paragraphs, no Markdown
   tables unless specifically requested, and no chatty commentary.
8. Include a human-review note and billing hook in the structured response.
"""


DC_LOCAL_RULE_SCHEMA: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "DistrictDraft D.C. Appellate Guardrails",
    "type": "object",
    "required": ["rule_28", "rule_32", "ethics_388"],
    "properties": {
        "rule_28": {
            "type": "object",
            "description": "FRAP/D.C. Circuit Rule 28 brief-content controls.",
            "required": [
                "disclosure_statement",
                "table_of_contents",
                "table_of_authorities",
                "jurisdictional_statement",
                "issues_presented",
                "statement_of_case",
                "summary_of_argument",
                "argument_with_authorities_and_record_cites",
                "standard_of_review",
                "conclusion_relief_sought",
                "certificate_of_compliance",
            ],
            "properties": {
                "disclosure_statement": {"type": "boolean"},
                "table_of_contents": {"type": "boolean"},
                "table_of_authorities": {"type": "boolean"},
                "jurisdictional_statement": {"type": "boolean"},
                "issues_presented": {"type": "boolean"},
                "statement_of_case": {"type": "boolean"},
                "summary_of_argument": {"type": "boolean"},
                "argument_with_authorities_and_record_cites": {"type": "boolean"},
                "standard_of_review": {"type": "boolean"},
                "conclusion_relief_sought": {"type": "boolean"},
                "certificate_of_compliance": {"type": "boolean"},
            },
        },
        "rule_32": {
            "type": "object",
            "description": "FRAP/D.C. Circuit Rule 32 form and formatting controls.",
            "required": [
                "word_ready_text",
                "citation_placeholders_marked",
                "record_placeholders_marked",
                "certificate_metadata_available",
                "no_unverified_authority_presented_as_verified",
            ],
            "properties": {
                "word_ready_text": {"type": "boolean"},
                "citation_placeholders_marked": {"type": "boolean"},
                "record_placeholders_marked": {"type": "boolean"},
                "certificate_metadata_available": {"type": "boolean"},
                "no_unverified_authority_presented_as_verified": {"type": "boolean"},
            },
        },
        "ethics_388": {
            "type": "object",
            "description": "D.C. Bar Ethics Opinion 388 AI-supervision controls.",
            "required": [
                "human_review_required",
                "confidentiality_warning",
                "citation_verification_required",
                "fee_reasonableness_note",
                "supervising_attorney_required",
            ],
            "properties": {
                "human_review_required": {"type": "boolean"},
                "confidentiality_warning": {"type": "boolean"},
                "citation_verification_required": {"type": "boolean"},
                "fee_reasonableness_note": {"type": "boolean"},
                "supervising_attorney_required": {"type": "boolean"},
            },
        },
    },
}


def build_clerk_prompt(
    facts: dict[str, Any],
    draft_type: str,
    target_court: str,
    requested_relief: str | None = None,
) -> str:
    relief_line = requested_relief or "[INSERT PRECISE RELIEF SOUGHT]"
    return f"""
Draft type: {draft_type}
Target court: {target_court}
Requested relief: {relief_line}

Use the discovered evidence below to draft Word-ready legal text. Include
Bluebook-style citations only for authorities supplied in the facts or request.
For missing citations, standards of review, or record references, use bracketed
placeholders and do not fabricate.

Discovered evidence:
{facts}
"""
