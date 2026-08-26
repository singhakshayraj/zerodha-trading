# Storage: make TOAST compression actually apply — design

**Date:** 2026-08-27 · **Status:** ⛔ **ATTEMPTED AND REVERTED — the mechanism
in this spec does not work as written** · **Relates to:** [P-38]

> ## What happened when it was applied
>
> Applied to production 2026-08-27 ~01:30 IST (brain IDLE, no session, 0 open
> trades). It produced **no compression at all**, was reverted to stock
> PostgreSQL defaults, and the tables were vacuumed back to a clean state.
> Final state verified: 32,145 decision rows, **0 with null `indicators`** —
> no data was lost, because the rewrites used the value-preserving
> `indicators = indicators` and neither table has triggers.
>
> **Net effect kept: 110 MB → 108 MB, purely dead-tuple reclaim from
> `VACUUM FULL`.** None of it was compression.
>
> ### Error 1 — `VACUUM FULL` does not recompress
> Step 4 of this spec assumed a table rewrite would apply the new storage
> settings to existing rows. It does not. `VACUUM FULL` copies existing datums
> **as-is**; TOAST compression is applied on *write*, so only genuinely
> re-writing a value (`UPDATE ... SET col = col`) routes it through the TOAST
> path. The whole "apply to existing rows" section was inoperative.
>
> ### Error 2 — the target was set ABOVE most rows
> `toast_tuple_target = 1400` was chosen so a *compressed* row would still fit
> inline. But TOAST only engages when a row **exceeds** the target, and large
> parts of the table are well under it — rows from 2026-08-10 average
> **1,050 B**. For those, nothing ever triggered. The p50 of 1,632 quoted
> below is a whole-table figure that hides a very heterogeneous distribution.
>
> ### The tension the design missed
> To compress a 1,050 B row the target must be **below** 1,050. But a 1,632 B
> row compresses to roughly 1,180 B, which is still above any target low
> enough to have triggered the smaller rows. **No single `toast_tuple_target`
> both compresses the small rows and keeps the large ones inline.**
> Out-of-lining is unavoidable across a distribution this wide, so the
> "stays inline" property this spec was built around cannot hold.
>
> ### The 42% number is unproven, and probably optimistic
> It came from `zlib-1` used as a "pglz proxy". pglz is a weaker LZ77 variant,
> and it **refuses to store a compressed value unless it saves ≥25%**. Measured
> lz4 on the same sample was only **18.3%**. pglz's true ratio on this data was
> never measured in-database and may well fall under its own threshold — which
> would explain the result independently of Errors 1 and 2.
>
> ### What a correct next attempt needs
> 1. Measure pglz's **actual** in-database ratio before changing any setting.
> 2. Recompress via `UPDATE`, not `VACUUM FULL`, then `VACUUM FULL` to reclaim.
> 3. Accept out-of-lining as the normal outcome and measure its read cost,
>    rather than designing to avoid it.
>
> Everything below is the original design, kept for the record.

## Problem

Supabase is on the FREE tier (500 MB). Measured state: **114 MB used**, growing
**~7.9 MB per session**. That is ~49 sessions of runway — about 5.2 months at
the current 45% token uptime, or ~2.3 months if uptime were fixed.

The cost is concentrated and, crucially, **not compressed**:

| table | total | rows | B/row |
|---|---|---|---|
| brain_decisions | 52.0 MB | 32,145 | 1,619 |
| brain_activity | 24.2 MB | 47,273 | 512 |
| portfolio_advice | 13.8 MB | 6,042 | 2,286 |
| candles | 13.4 MB | 40,647 | 329 |

`brain_decisions.indicators` alone averages **1,100 B of a 1,344 B row** — 82%
of the table, and ~36% of the entire database.

**Root cause:** PostgreSQL only compresses a value when the whole row exceeds
`toast_tuple_target`, which defaults to 2032 bytes. Only **92 of 32,145** rows
cross that line. So the largest column in the database is stored raw, and has
been from day one.

## Measurements that drove the design

Taken on real production data, not estimated.

**Compressibility** (500-row samples, zlib-1 as a pglz proxy):

| table | compressible B/row | saving |
|---|---|---|
| brain_decisions | 1,100 | **42.0%** |
| portfolio_advice | 1,553 | **41.6%** |
| brain_activity | 154 | 14.1% |
| candles | 0 (all numeric) | ~0% |

**Codec choice — pglz, not lz4.** Measured on the same sample: pglz 42.0%,
**lz4 only 18.3%**, zlib-9 ceiling 43.6%. The blobs are small and dominated by
repeated key names, which favours pglz. The usual "switch to lz4" advice is
wrong for this data, so `default_toast_compression` stays as it is.

**Row-size distribution** for `brain_decisions` — bimodal:
p10 **232 B** (skip rows), p50 **1,632**, p90 **1,848**, p99 **2,008**, max 2,144.

## Design

Two settings per table, and the second one is what keeps this safe:

```sql
ALTER TABLE public.brain_decisions ALTER COLUMN indicators SET STORAGE MAIN;
ALTER TABLE public.brain_decisions SET (toast_tuple_target = 1400);
```

**`SET STORAGE MAIN`** means *compress, but keep the value inline unless there
is no alternative*. It states the intent directly rather than relying on the
threshold alone.

**`toast_tuple_target = 1400`** is chosen from the distribution above, not
picked round. A full row of 1,600–2,100 B compresses to roughly 1,050–1,380 B
(the row shrinks by ~0.42 × the 1,100 B `indicators`), landing **just under
1400 and staying inline**. Skip rows at ~232 B never cross the threshold and
are left alone.

**Why not a lower target.** 256 or 1024 would also trigger compression, but a
compressed p50 row is still ~1,070 B — above either — so PostgreSQL would move
`indicators` **out-of-line** into the TOAST table. That adds an 18-byte
pointer, per-chunk row overhead, a TOAST index, and **a second fetch on every
read**. The labelling pass and the edge study both read these rows in bulk, so
that is a real regression for slightly worse space. Out-of-line is the failure
mode this design is tuned to avoid.

`portfolio_advice` gets the same treatment on `indicators` and `reasons` at
`toast_tuple_target = 1200`. Its rows already exceed 2032, but TOAST stops as
soon as the row fits — it shrinks something small and leaves `indicators` raw
at 1,030 B.

**`brain_activity` is deliberately out of scope.** Its values average 154 B,
much of it under pglz's ~32-byte floor, so it compresses only 14.1% — a ~4%
table-level gain. Forcing TOAST on rows that small risks pushing them
out-of-line for almost nothing. `prune_activity()` already exists and is the
cheaper lever there.

**`candles` is out of scope** — all numeric, incompressible. It is market-wide
data; retention or downsampling is its lever, not encoding.

## Applying to existing rows

DDL governs future writes only. Existing rows need a rewrite:

```sql
VACUUM FULL public.brain_decisions;
ANALYZE public.brain_decisions;
```

`VACUUM FULL` also reclaims dead-tuple bloat, and takes an **ACCESS EXCLUSIVE
lock** — so it runs **post-close, never while a session is live**. At 52 MB it
takes seconds. It needs free disk equal to the table size, which is trivially
available.

**It cannot run inside a transaction block.** The migration file therefore
must not be wrapped in `BEGIN`/`COMMIT`, and the `VACUUM FULL` statements must
be executed individually rather than pasted as one batch.

## Expected result

| | before | after | change |
|---|---|---|---|
| brain_decisions | 52.0 MB | ~37.2 MB | −28.5% |
| portfolio_advice | 13.8 MB | ~9.9 MB | −28.3% |
| **whole database** | **114 MB** | **~95.3 MB** | **−16.4%** |
| **growth/session** | **7.88 MB** | **~6.51 MB** | **−17.4%** |
| runway | 49 sessions | 62 sessions | **+27%** |
| runway at 45% uptime | ~5.2 months | ~6.5 months | +1.3 months |

The 42% figure is **column-level**; the database-level gain is ~16% because
compression cannot touch tuple headers, indexes, or fixed-width columns.

This moves the [P-38] tier decision from roughly **February to roughly April**.
It does not remove it. Reaching a full year (~114 sessions at current uptime) would need
≤3.55 MB/session; this design lands at 6.51, closing roughly a third of the
distance.

## Verification

Registered as **V-15**. Capture before, run, capture after:

```sql
select c.relname,
       pg_size_pretty(pg_total_relation_size(c.oid))        total,
       pg_size_pretty(coalesce(pg_total_relation_size(c.reltoastrelid),0)) toast,
       (select round(avg(pg_column_size(indicators))) from brain_decisions)  avg_ind_decisions,
       (select round(avg(pg_column_size(indicators))) from portfolio_advice) avg_ind_advice
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('brain_decisions','portfolio_advice');
```

**PASS** = `avg_ind_decisions` drops from **1,100 to ≤ 700**, and
`brain_decisions` total falls from 52 MB to **≤ 40 MB**.

**The out-of-line guard:** the `toast` column for `brain_decisions` must stay
**< 5 MB**. If it grows to tens of MB the target is too low, values went
out-of-line, and reads now cost an extra fetch — roll back and raise the
target.

## Rollback

Fully reversible; nothing is lost, since this only changes how bytes are
stored:

```sql
ALTER TABLE public.brain_decisions RESET (toast_tuple_target);
ALTER TABLE public.brain_decisions ALTER COLUMN indicators SET STORAGE EXTENDED;
VACUUM FULL public.brain_decisions;
```

## Risks

| risk | mitigation |
|---|---|
| Values go out-of-line, slowing bulk reads | target picked from the measured distribution; V-15 guards TOAST size explicitly |
| `VACUUM FULL` locks the table | run post-close only, never during a session; seconds at this size |
| Statement batching breaks `VACUUM FULL` | documented: no transaction wrapper, run those statements individually |
| Compression ratio underperforms in production | V-15 states the pass number; rollback is three statements |

No application code changes. No schema changes. No data is added, removed, or
rewritten in meaning — full fidelity is preserved by construction, which is
the constraint that ruled out rollups and cold archiving.

## Delivery

Per the standing rule, production DDL ships as a reviewable `.sql` file to be
run by hand. It will not be applied by an agent.
