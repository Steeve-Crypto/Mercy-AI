import { NextRequest, NextResponse } from "next/server";
import {
  createWorkHistory,
  listWorkHistory,
  type CreateWorkHistoryInput,
  type WorkHistoryWorkflowType,
} from "@/lib/work-history";

const workflowTypes = new Set([
  "general",
  "drafting",
  "review",
  "research",
  "citation_check",
  "document_review",
  "intake",
  "template",
  "other",
]);

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const workflowType = stringValue(params.get("workflow_type"));
  const result = await listWorkHistory({
    matterId: stringValue(params.get("matter_id")),
    documentId: stringValue(params.get("document_id")),
    workflowType: workflowType && workflowTypes.has(workflowType) ? (workflowType as WorkHistoryWorkflowType) : null,
    savedOnly: params.get("saved") === "true",
    limit: Number(params.get("limit") || 50),
  });

  if (result.error && result.configured) {
    return NextResponse.json({ records: [], configured: true, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ records: result.records, configured: result.configured });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as CreateWorkHistoryInput | null;
  if (!body || !stringValue(body.title)) {
    return NextResponse.json({ error: "History title is required." }, { status: 400 });
  }

  const result = await createWorkHistory(body);
  if (!result.configured) {
    return NextResponse.json({ record: null, configured: false, saved: false });
  }
  if (result.error) {
    return NextResponse.json({ record: null, configured: true, saved: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ record: result.record, configured: true, saved: Boolean(result.record) });
}
