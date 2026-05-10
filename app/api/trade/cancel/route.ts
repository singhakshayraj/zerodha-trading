import { NextRequest, NextResponse } from "next/server";
import { makeKiteRequest } from "@/lib/zerodha";
import { ZerodhaError } from "@/lib/types";

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-enc-token");
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 401 });

  try {
    const { order_id, variety = "regular" } = await req.json();
    if (!order_id) return NextResponse.json({ error: "order_id is required" }, { status: 400 });

    const result = await makeKiteRequest<{ order_id: string }>(
      token,
      "DELETE",
      `/orders/${variety}/${order_id}`
    );
    return NextResponse.json({ order_id: result.order_id });
  } catch (err) {
    if (err instanceof ZerodhaError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
