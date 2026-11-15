// Company name -> NSE symbol, shared by the chat hints and the what-if parser.
import NAMES from "./names.json";

/** Company name -> NSE symbol. Full normalised names, plus a two-word
 *  prefix ("adani ports") when it names exactly one company. Longest
 *  match wins, so "tata motors passenger vehicles" beats "tata motors". */
const NAME_INDEX: [string, string][] = (() => {
  const full = Object.entries(NAMES as Record<string, string>);
  const prefixes = new Map<string, string | null>();
  for (const [n, sym] of full) {
    const p = n.split(" ").slice(0, 2).join(" ");
    if (p !== n && p.length >= 6) prefixes.set(p, prefixes.has(p) ? null : sym);
  }
  const out = [...full, ...Array.from(prefixes).filter(([, v]) => v).map(([k, v]) => [k, v!] as [string, string])];
  return out.sort((a, b) => b[0].length - a[0].length);
})();

export function symbolFromName(q: string): string | undefined {
  const t = " " + q.toLowerCase().replace(/\b(ltd\.?|limited|india|the)\b/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim() + " ";
  return NAME_INDEX.find(([n]) => t.includes(" " + n + " "))?.[1];
}

