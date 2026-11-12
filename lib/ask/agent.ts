// [P-54 spike] Two-step agent for a small in-browser model:
//   1. route: question -> {"tool": name, "args": {...}} (JSON mode)
//   2. answer: question + tool result -> 1-4 plain sentences.
// The model never sees the database, only the tool's small JSON result.

import { TOOLS, toolByName, ACCOUNT_LABEL, type Account, type Fetcher } from "./tools";

export type ChatFn = (messages: { role: "system" | "user"; content: string }[], json: boolean) => Promise<string>;
export type Trace = { tool: string | null; args: Record<string, string>; result: unknown; answer: string; ms: { route: number; answer: number } };

const toolList = TOOLS.map((t) =>
  `- ${t.name}: ${t.description}${Object.keys(t.args).length ? ` Args: ${Object.entries(t.args).map(([k, v]) => `${k} (${v})`).join("; ")}.` : ""}`).join("\n");

export function routePrompt(question: string, ctx: { account: Account; symbol?: string | null }) {
  return [
    { role: "system" as const, content:
`You route a question about a stock portfolio to exactly one tool. Reply with JSON only:
{"tool": "<tool name>", "args": {"<arg>": "<value>"}}
Tools:
${toolList}
Rules: stock names become NSE symbols in capitals (Adani Total Gas -> ATGL, ITC -> ITC). Use "account" only if the user names Natwar or Kanaklata. Months are YYYY-MM.
Examples:
"should I buy more X?" / "why is X a sell?" / "what about X?" -> explain_call {"symbol": "X"}
"how many sell calls?" / "biggest position?" -> holdings_summary
"what should I sell today?" / "where should the money go?" -> moves_today
"how did I do in March 2026?" -> pnl {"month": "2026-03"}
"did following the calls help?" -> decisions
If nothing fits, reply {"tool": "none", "args": {}}.` },
    { role: "user" as const, content:
`Screen: ${ACCOUNT_LABEL[ctx.account]}'s account${ctx.symbol ? `, looking at ${ctx.symbol}` : ""}. Today is ${new Date().toISOString().slice(0, 10)}.
Question: ${question}` },
  ];
}

const CALL_TOOLS = new Set(["explain_call", "moves_today", "holdings_summary"]);

export function answerPrompt(question: string, tool: string, result: unknown) {
  // Small models copy quoted examples into every answer, so the attribution
  // rule is added only where calls are actually being described.
  const callRule = CALL_TOOLS.has(tool)
    ? "\nThe calls in the data are the advisor's: say what the advisor's call is. Do not tell the user what to do in your own words."
    : "";
  return [
    { role: "system" as const, content:
`Answer the user's question using ONLY the data below. 1-4 short sentences, plain English, rupees as ₹ with Indian commas.
If the data has a "summary", base the answer on it and keep its numbers exactly.
Quote exact numbers and symbols from the data. If the data has an "error", say so plainly. Never invent numbers.${callRule}` },
    { role: "user" as const, content: `Question: ${question}\nData from ${tool}: ${JSON.stringify(result)}` },
  ];
}

export function parseRoute(raw: string): { tool: string | null; args: Record<string, string> } {
  const s = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const m = s.match(/\{[\s\S]*\}/);
  try {
    const j = JSON.parse(m ? m[0] : s);
    const tool = typeof j.tool === "string" && toolByName(j.tool) ? j.tool : null;
    const args: Record<string, string> = {};
    for (const [k, v] of Object.entries(j.args ?? {})) if (v != null && String(v).trim()) args[k] = String(v);
    return { tool, args };
  } catch {
    return { tool: null, args: {} };
  }
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Facts we can read straight off the question instead of trusting a small
 *  model with them: which account, which month, which known symbol. */
export function questionHints(q: string, knownSymbols: string[] = [], today = new Date()): Record<string, string> {
  const h: Record<string, string> = {};
  if (/\bnatwar\b/i.test(q)) h.account = "natwar";
  else if (/\bkanak(lata)?\b/i.test(q)) h.account = "primary";
  // Full month names or exact 3-letter abbreviations ("market" is not March);
  // "may" only with a year ("may I…" is not May).
  const m = q.toLowerCase().match(/\b(january|february|march|april|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|may(?=\s+\d{4}))\b\.?(?:\s+(\d{4}))?/);
  if (m) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3));
    const y = m[2] ? Number(m[2]) : (mi > today.getMonth() ? today.getFullYear() - 1 : today.getFullYear());
    h.month = `${y}-${String(mi + 1).padStart(2, "0")}`;
  }
  const iso = q.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
  if (iso) h.month = `${iso[1]}-${iso[2]}`;
  const sym = q.toUpperCase().match(/\b[A-Z][A-Z0-9&-]{1,14}\b/g)?.find((t) => knownSymbols.includes(t));
  if (sym) h.symbol = sym;
  return h;
}

export async function ask(question: string, ctx: { account: Account; symbol?: string | null; fetch: Fetcher; knownSymbols?: string[] }, chat: ChatFn): Promise<Trace> {
  const t0 = performance.now();
  const route = parseRoute(await chat(routePrompt(question, ctx), true));
  const t1 = performance.now();
  // Deterministic facts from the question override the model's guesses.
  const hints = questionHints(question, ctx.knownSymbols ?? []);
  if (route.tool && route.tool !== "none") {
    const accepts = toolByName(route.tool)?.args ?? {};
    for (const [k, v] of Object.entries(hints)) if (k in accepts) route.args[k] = v;
    if (!("month" in hints)) delete route.args.month;          // never invent a period
  }
  if (!route.tool && hints.symbol) { route.tool = "explain_call"; route.args = { symbol: hints.symbol, ...(hints.account ? { account: hints.account } : {}) }; }
  if (!route.tool) {
    return { tool: null, args: route.args, result: null, ms: { route: t1 - t0, answer: 0 },
      answer: "I can answer questions about calls, why a stock has its call, sectors, P&L, decisions, Zerodha statements and contrarian picks — try rephrasing." };
  }
  if (!route.args.symbol && ctx.symbol && route.tool === "explain_call") route.args.symbol = ctx.symbol;
  let result: unknown;
  try { result = await toolByName(route.tool)!.run(route.args, ctx); }
  catch (e) { result = { error: e instanceof Error ? e.message : "data unavailable" }; }
  const answer = (await chat(answerPrompt(question, route.tool, result), false)).replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  return { tool: route.tool, args: route.args, result, answer, ms: { route: t1 - t0, answer: performance.now() - t1 } };
}
