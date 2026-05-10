import { ZerodhaApiResponse, ZerodhaError } from "./types";

const KITE_BASE_URL = "https://api.kite.trade";

export async function makeKiteRequest<T>(
  token: string,
  method: "GET" | "POST" | "DELETE" | "PUT",
  path: string,
  data?: Record<string, unknown>
): Promise<T> {
  const url = `${KITE_BASE_URL}${path}`;

  const headers: Record<string, string> = {
    Authorization: `enctoken ${token}`,
    "X-Kite-Version": "3",
    "Content-Type": "application/x-www-form-urlencoded",
  };

  let body: string | undefined;
  if (data && (method === "POST" || method === "PUT")) {
    body = new URLSearchParams(
      Object.entries(data).reduce(
        (acc, [k, v]) => {
          acc[k] = String(v);
          return acc;
        },
        {} as Record<string, string>
      )
    ).toString();
  }

  const response = await fetch(url, {
    method,
    headers,
    body,
  });

  const json: ZerodhaApiResponse<T> = await response.json();

  if (!response.ok || json.status !== "success") {
    throw new ZerodhaError(
      json.message || "Zerodha API error",
      response.status,
      json.error_type
    );
  }

  return json.data;
}
