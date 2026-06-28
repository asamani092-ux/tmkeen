import { NextResponse } from "next/server";
import { getFollowUpSubmission } from "@/lib/follow-up-service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const beneficiaryId = searchParams.get("beneficiaryId");
  const month = Number(searchParams.get("month"));

  if (!beneficiaryId || !month || month < 1 || month > 6) {
    return NextResponse.json({ error: "معاملات غير صالحة" }, { status: 400 });
  }

  const data = await getFollowUpSubmission(beneficiaryId, month);
  if (!data) {
    return NextResponse.json({ error: "غير مصرح أو لا يوجد سجل" }, { status: 404 });
  }

  return NextResponse.json(data);
}
