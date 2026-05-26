import { NextRequest, NextResponse } from "next/server";
import { archiveWorkHistory, getWorkHistoryItem, setWorkHistorySaved } from "@/lib/work-history";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const result = await getWorkHistoryItem(id);
  if (!result.configured) return NextResponse.json({ record: null, configured: false }, { status: 503 });
  if (result.error) return NextResponse.json({ record: null, configured: true, error: result.error }, { status: 404 });
  return NextResponse.json({ record: result.record, configured: true });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { saved?: boolean; archived?: boolean } | null;
  if (!body) return NextResponse.json({ error: "Update payload is required." }, { status: 400 });

  const result = body.archived ? await archiveWorkHistory(id) : await setWorkHistorySaved(id, Boolean(body.saved));
  if (!result.configured) return NextResponse.json({ record: null, configured: false }, { status: 503 });
  if (result.error) return NextResponse.json({ record: null, configured: true, error: result.error }, { status: 400 });
  return NextResponse.json({ record: result.record, configured: true });
}
