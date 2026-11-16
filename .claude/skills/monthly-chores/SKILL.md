---
name: monthly-chores
description: "[P-58] Run the recurring data chores with the user's own Chrome (Claude in Chrome): Screener fundamentals export, Zerodha Console tradebook + P&L statements for both accounts, and the FII/DII job health check. Use when the user says 'monthly chores', 'refresh fundamentals', 'pull the Console files', or the morning brief shows 'fundamentals > 30d' / a stale FII row."
---

# Monthly chores (P-58)

Three chores, each a browser step the user used to do by hand, then an
existing brain import script. **Never** type passwords, OTPs or TOTP codes:
the user signs in; Claude only navigates, clicks export, and runs scripts.
Never place an order. Never paste tokens anywhere.

Preflight: `mcp__claude-in-chrome__list_connected_browsers` must list a
browser. If it is empty, stop and tell the user to open Chrome with the
Claude extension; nothing below works without it.

## 1. Fundamentals (Screener) — when `fundamentals_latest.asof` is > 30 days

1. The user is logged in at https://www.screener.in. Open their saved
   screen for the **holdings + universe** list (ask which if more than one;
   remember the answer in the project memory).
2. Two exports are needed, same rows, different columns (Screener caps the
   columns per export):
   - **base**: Name, Market cap, P/E, Cash equivalents, Debt, CF operations,
     ROCE, ROE, Piotroski, Pledge, Promoter holding, Sales/Profit growth 3y,
     EV/EBITDA, Price to book.
   - **extended**: Symbol, Sales/Profit growth 5y, Qtr sales/profit growth,
     OPM latest + last year, Avg ROCE/ROE 5y, EPS latest + last year,
     Interest coverage, Price to sales, Dividend yield, PEG, 52w high/low,
     CAGR 1/3/5y, Down from 52w high, Up from 52w low, Change in promoter,
     FII/DII holding + change, Reserves, Working capital days, Debtor days,
     Cash conversion cycle. Banks: GNPA, NNPA, NIM, CASA, CAR.
   Use `mcp__claude-in-chrome__get_page_text` on each page of the table and
   save the text to `~/Desktop/GITHUB/zerodha-trading/universe.txt` and
   `universe_extended.txt` (both git-ignored). Paginate until the row count
   matches the screen's count.
3. Import, from the brain repo:
   ```bash
   cd ~/Desktop/GITHUB/zerodha-brain && python3 scripts/ingest_fundamentals.py --asof <export date YYYY-MM-DD> \
     ~/Desktop/GITHUB/zerodha-trading/universe.txt ~/Desktop/GITHUB/zerodha-trading/universe_extended.txt
   ```
   `--asof` is the day the export was taken — it dates the point-in-time copy in
   `fundamentals_snapshots` [P-68]. The script prints coverage gaps (held names with no record). Report those
   names; the user adds them to the screen.
4. Verify: `app_config.fundamentals_latest.asof` = today, and the /advisor
   summary strip no longer shows the fundamentals-age warning.

## 2. Zerodha Console — tradebook + P&L, both accounts

1. The user is logged in at https://console.zerodha.com for the account
   (Kanaklata first, then Natwar — he logs in himself; Claude never handles
   his credentials).
2. **Tradebook**: Reports → Tradebook → segment Equity, date range = since
   the last import (`select max(executed_at) from tradebook where account =
   '<acct>'`) → Download CSV. Approve the download in chat first (file name,
   source, size).
3. **P&L**: Reports → P&L → Equity → financial year → Download (XLSX).
4. Move the files to `~/Desktop/GITHUB/zerodha-trading/data/console/`
   (git-ignored), then:
   ```bash
   cd ~/Desktop/GITHUB/zerodha-brain
   python3 scripts/import_tradebook.py --account primary  ~/Desktop/GITHUB/zerodha-trading/data/console/<tradebook>.csv
   python3 scripts/import_pnl_statement.py --account primary ~/Desktop/GITHUB/zerodha-trading/data/console/<pnl>.xlsx
   ```
   Same with `--account natwar` for his files.
5. Verify: the importer prints `sells matched n/n` and `open quantities
   matched`; /pnl shows the new statement with a green "reconciled" badge.
   A mismatch is a finding for KNOWN_ISSUES, not something to patch over.

## 3. FII/DII job health

No browser needed. The job is launchd `com.akshay.fiidii` at 21:30 IST.
```bash
tail -5 ~/Desktop/GITHUB/FIIDII/fii_dii.log
launchctl list | grep fiidii
```
If the agent is not listed, the user runs (Claude is not allowed to):
```bash
cp ~/Desktop/GITHUB/FIIDII/com.akshay.fiidii.plist ~/Library/LaunchAgents/ && \
launchctl unload ~/Library/LaunchAgents/com.akshay.fiidii.plist 2>/dev/null; \
launchctl load ~/Library/LaunchAgents/com.akshay.fiidii.plist
```
Verify: `macro_daily.data.fii_net_cr` non-null for the last trading day.

## After all three

Add a line to `docs/reference/VERIFY.md` under the matching open check
(V-30 FII, V-34 fundamentals date) with the date and the numbers, and
commit as `chore(data): monthly chores <date>`.
