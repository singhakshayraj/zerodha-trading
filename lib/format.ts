/** One ₹ formatter for every page, so the same kind of number reads the same
 *  everywhere: true minus sign (−), Indian digit grouping, "—" for missing.
 *  dp = max decimals; fixed = always show dp decimals; signed = "+" on gains. */
export function inr(
  n: number | null | undefined,
  { dp = 0, fixed = false, signed = false }: { dp?: number; fixed?: boolean; signed?: boolean } = {},
): string {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: fixed ? dp : 0, maximumFractionDigits: dp });
  const sign = n < 0 && abs.replace(/[0.,]/g, "") !== "" ? "−" : signed && n > 0 ? "+" : "";
  return sign + "₹" + abs;
}
