# Follow-up prompt for Fable — round 2

Paste below the line. It assumes Fable still has round 1 in context; if not,
attach `SYSTEM_BIBLE.md` and the round-1 response first.

---

I ran the tests you specified. Three results, then what I want from round two.

## 1. Your regulatory observation: independently verified

I did not take it on trust. Confirmed against SEBI and NSE sources: circular
**SEBI/HO/MIRSD/MIRSD-PoD/P/CIR/2025/0000013** (4 Feb 2025) plus the September
2025 extension; from **1 April 2026** algo orders must carry an
exchange-assigned **Algo-ID**, and API access must come through a
**vendor-client-specific key on a broker-whitelisted static IP**. Unregistered
API-based strategies are explicitly in scope. A scraped `enc_token` against
`kite.zerodha.com/oms` is outside that framework. Your framing holds.

## 2. Your §1a test — the cell is CLOSED, and your conclusion gets stronger

You predicted the 09:30–10:30 open window was systematically under-sampled and
might hide the ORB thesis, with a decision rule of "n ≳ 150 and mean R ≤ −0.2 →
closed; n < ~60 → my documentation overstates its own result."

| segment | n | mean R | t |
|---|---|---|---|
| all trades | 832 | −0.425 | −12.86 |
| entry 09:30–10:30 IST | **159** | **−0.410** | −4.70 |
| …and session started on time | 86 | **−0.411** | −4.31 |

n = 159, mean −0.410R. **Closed by your own rule.** The open window is neither
under-sampled nor better — it is statistically indistinguishable from the whole
book, and it stays that way when restricted to sessions that started on time.

So the only live weakness you identified is gone, the 4–8 week TOTP experiment
has no rationale, and "no edge exists in this approach" needs no narrowing.

## 3. Your §5 benchmark — measured for the first time

You were right that it went unmeasured because it was always going to be brutal.

| 2026-05-19 → 2026-08-26 | |
|---|---|
| Nifty 50 buy-and-hold | **+3.03%** |
| The system (paper) | **−50.85%** |
| **Alpha vs doing nothing** | **−53.88 pp (−₹53,883)** |
| Rupees per operator-hour | **−₹565/h** (~90 sessions, excluding build time) |

## 4. Already actioned from your list

- **Your #2** — the live order path is now hard-disabled in code. All three
  placement entry points raise unless two separate flags are set; a single
  stale env var cannot arm it. Two tests pin the refusal. Paper is unaffected.
- Not yet run: your charge-model validation against the 215 real `tradebook`
  trades.

---

# What I want from round two

You have made the case that I should stop. I accept it. **Do not re-argue it.**
Round two is execution design, and one adversarial pass on yourself.

**1. Design the decommission.** You said "decommission, with the same
discipline you shipped everything else." Specify it as a checklist I can
execute in a single session: what to freeze, what to snapshot, what to leave
running, what to disable and in what order, what the post-mortem must contain
to still be readable in two years, and what I should deliberately *not* keep.
Include the stopping criteria for anything left accruing, so "passive" does not
quietly become "ongoing."

**2. Specify R2 properly — it is your best idea and you gave it a paragraph.**
"Behavioral edge over your own discretion, measured on the real book" is the
one asset here that no market participant competes for. But `user_executions`
is at n=35 and the review does not say what the instrument actually *is*.
Design it: what is logged at decision time versus at execution time, what the
counterfactual is (advice followed vs my actual action vs do-nothing), what the
unit of observation is, what confounds it (I see the advice before I act, so it
is not blind), what n is needed for the first real read, and what it would look
like as a product I use daily rather than a dataset I accrue. If the honest
answer is that this cannot be measured cleanly because I am both the subject and
the operator, say so and say what it is worth anyway.

**3. Attack your own review.** Where is round one weakest? Specifically:
- You put career capital (R3) at "possibly the highest in rupees" and gave it
  no mechanism. What is the actual artifact, who is the audience, and what
  makes a documented null result legible to someone who did not watch it happen?
- Your holding-period argument (§2) is the one live strategic claim you make,
  and it rests on `mom_12_1`'s sign consistency — which you then undercut
  yourself with the survivorship-bias finding in §1c. Is §2 still standing after
  §1c, or did you leave a contradiction in?
- What did you get wrong, or overweight, given results 1–3 above?

**4. The question you did not ask.** Round one assumed the goal is a return on
capital or on career. There is a third possibility I have not tested: that this
project's real output is the *measurement discipline* itself — pre-registration,
Holm correction, counterfactual labelling, invariants, recorded reversals — and
that its highest use is on a problem where the feedback loop is not adversarial
and nearly-efficient. If you think that is right, name two or three concrete
problem domains where this exact machinery transfers with the strategy layer
swapped out, and say which one you would pick and why. If you think it is
self-flattering rationalisation for not stopping cleanly, say that instead.

**5. One number.** If I do exactly what you recommend, what should be true in
six months that is not true now — stated as a single measurable claim I can
check, not a description of a better state of affairs?

Same rules as round one: blunt, falsifiable, name the test and the deciding
number, and tell me when my sample cannot detect what I am asking about.
