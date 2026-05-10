import { NextRequest, NextResponse } from "next/server";
import { makeKiteRequest } from "@/lib/zerodha";
import { PlaceOrderParams, ZerodhaError } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { token, ...orderParams }: { token: string } & PlaceOrderParams =
      await req.json();

    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    const result = await makeKiteRequest<{ order_id: string }>(
      token,
      "POST",
      "/orders/regular",
      orderParams as unknown as Record<string, unknown>
    );

    return NextResponse.json({ order_id: result.order_id });
  } catch (err) {
    if (err instanceof ZerodhaError) {
      return NextResponse.json(
        { error: err.message, error_type: err.errorType },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
