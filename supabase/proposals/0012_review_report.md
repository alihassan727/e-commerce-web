# Proposal 0012 — Final SQL Review Report

**Reviewed file:** `supabase/proposals/0012_safepay_stock_reservation.sql`
**Review date:** 2026-11-28
**Revision:** 2 (supersedes the earlier review report)
**Status:** proposal updated, **not applied**.

No SQL was executed against Supabase. No migration was applied, no row was inserted/updated/deleted, and no application code, environment variable, COD/n8n flow, Safepay credential or live setting was changed. The only database access was read-only `SELECT` probes (columns, row counts, null-stock counts, status counts); the temporary probe was deleted. The proposal remains outside `supabase/migrations/`.

---

## Verdict: is the SQL safe to apply?

- **Clean staging database: yes, for testing.** The proposal creates only new objects plus nullable/defaulted columns and named constraints; no existing table/column/policy is dropped or renamed. Apply it to a disposable staging project and run the matrix in §9.
- **Production: not yet.** Static review is not execution. Complete the staging tests, the concurrency tests and the rollback rehearsal first.
- **Do not re-run it over an earlier draft.** `create table if not exists` does not migrate changed table definitions. This revision changed `payment_transactions` (removed `updated_at`, narrowed status check), `payment_refunds` (`transaction_id NOT NULL` / `RESTRICT`), and added revokes. Reset the staging database or apply the equivalent `ALTER`s manually before testing this exact revision.
- **Operational impact is not purely additive:** product/variant hard deletes are now blocked when reservation history exists, and online orders must explicitly set their payment status. Both are intentional and are covered below.

No blocking defect was found in the corrected paths during this static pass. The remaining risks in §8 are design/operational decisions, not hidden writes.

---

## 2. Live schema verification

Read-only checks against the current project:

| Object | Verified columns / state | Result |
|---|---|---|
| `orders` | `address, alternate_phone, city, created_at, customer_id, customer_name, delivery_fee, delivery_instructions, email, id, notes, phone, preferred_delivery_time, status, subtotal, total, updated_at` | **No `payment_*` columns yet**; 2 rows, statuses `confirmed` and `delivered`. Matches assumptions. |
| `order_items` | `color_snapshot, id, image_snapshot_url, line_total, order_id, price, product_id, quantity, size_snapshot, title_snapshot, variant_id, variant_label_snapshot` | Snapshot names used by reserve/finalize exist exactly. |
| `order_audit` | `created_at, event, id, order_id, payload` | Matches every audit insert. |
| `products` | `category_id, created_at, description, has_variants, id, is_active, is_featured, price, slug, stock, title` | 4 rows; `stock` is NULL for all 4 (variant products), as handled by the RPCs. |
| `variants` | `color, color_hex, color_id, id, is_active, product_id, sale_price, size, sku, stock` | 22 rows; `stock` NULL for 0. Integer stock confirmed. |
| `payment_gateway_config` | 0 rows; existing RLS | Untouched; no credentials read. |
| `stock_reservations`, `stock_reservation_items`, `payment_transactions`, `payment_webhook_events`, `payment_refunds` | `PGRST205` (absent) | The proposal creates them; no pre-existing conflicts. |
| `confirm_order(uuid)` | Defined in `0002_confirm_order.sql`, corrected in `0006`; service-role only | Verified from migrations. Live body cannot be read through PostgREST; compare with `pg_get_functiondef` on staging. **Not modified.** |
| `order_status` | enum from `0001_init.sql`: pending/confirmed/out_of_stock/shipped/delivered/cancelled | No enum change. |

**Mismatches found:** none in names/types used by the proposal. Verification limitation: live function bodies and constraint definitions are not exposed through PostgREST; staging must inspect `pg_proc`/`pg_constraint`.

---

## 3. Issues found in this review and exact corrections

| # | Issue | Correction |
|---|---|---|
| 1 | Refund idempotency compared only `order_id` and `amount`. A repeated provider refund id could return success despite a different currency or a detached/incorrect transaction. | `record_verified_refund()` now validates **gateway, environment, order, amount, currency, status, and the stored transaction association** before returning idempotent success. A repeated id with any differing detail returns `ok = false`. |
| 2 | A retry of the **final** refund arrived after the order became `refunded`, but the refundable-state check ran first, so the retry was rejected instead of being idempotent. | The refund lookup/idempotency block now runs **before** the paid/partially-refunded state check. A matching retry after a full refund returns `ok = true`; a new refund id on a refunded order is still rejected. |
| 3 | `payment_refunds.transaction_id` was nullable and `ON DELETE SET NULL`, so a refund could lose its capture association and break idempotency/audit. | Made it **`NOT NULL REFERENCES payment_transactions(id) ON DELETE RESTRICT`**. Refund rows always point at a captured ledger row. |
| 4 | Refunds updated `payment_transactions.status` to `partially_refunded`/`refunded` while the table was described as append-only. | Chose the **immutable ledger** design: removed the status update, removed `updated_at` and its trigger, narrowed transaction status to `initiated/pending/succeeded/failed/cancelled`, and derive refund state from `payment_refunds` + `orders.payment_status`. Comments now say **insert-only**, not append-only-while-updated. |
| 5 | `service_role` still held `UPDATE`/`DELETE` on the transaction ledger, so immutability was only a convention. | Grants changed: `service_role` gets `SELECT, INSERT` on `payment_transactions`; `UPDATE, DELETE` are explicitly revoked. Table owner/postgres retains maintenance ability. |
| 6 | `fail_order_payment()` validated status and order id but not the existing transaction’s **amount or currency**; a mismatched failure callback could release the hold. | Added `v_tx_amount`/`v_tx_currency` to the re-read and compare them with `orders.total` / `payment_currency` **before any release**. A mismatch returns `ok = false` and leaves the reservation active. |
| 7 | A failure callback could release a reservation even when the matched transaction belonged to a different order/identity. | Order-id, gateway, environment and provider-id checks already existed; amount/currency checks now complete the identity validation before release. Succeeded rows and paid/refunded orders remain refused. |
| 8 | `reserve_order_stock()` could create a new hold for an already-paid/refunded order whose fulfilment status was still `pending`, or after a reservation had already been finalized. | Added `invalid_payment_state` for `paid`/`refunded`/`partially_refunded`, and `already_finalized` when a finalized reservation exists. |
| 9 | `finalize_paid_order()` could release an expired hold, then return a failed capture while leaving `payment_status = 'pending'`. | After releasing an expired hold it now marks a pending attempt `expired` (transaction-local flag). A successful capture can still move `expired → paid`; a failed capture leaves an accurate `expired` state. |
| 10 | A paid order could return “already recorded” even when its stored gateway/amount/currency disagreed with the callback and ledger row. | Added a metadata-consistency check in the idempotent branch of `record_verified_payment()`; mismatch returns `ok = false` with a manual-reconciliation message. |
| 11 | Trigger functions `guard_order_payment_state()` and `prevent_reserved_stock_delete()` retained PostgreSQL’s default `PUBLIC EXECUTE`. | Explicitly revoked `EXECUTE` from `public, anon, authenticated`. They are trigger-only, not RPCs. |
| 12 | The release comment claimed deleted variants/products are skipped; FKs are `RESTRICT`, so that was misleading and would hide a missing-row bug. | Comment corrected: referenced rows cannot be deleted; a missing row aborts the whole release. |
| 13 | The `record_verified_payment` comment said idempotency was on `(gateway, provider_transaction_id)` but the key includes environment. | Comment corrected to `(gateway, environment, provider_transaction_id)`. |
| 14 | Verification guidance did not cover the new refund/failure/ledger/reservation cases. | Section 15 now includes full-refund retry, detail-mismatch refunds, immutable ledger status, failure amount/currency mismatch, and reserve-after-paid/finalized checks. |

---

## 4. Full security review

### 4.1 Payment guard trigger (`guard_order_payment_state`)

Six rules, all `BEFORE UPDATE` on `orders`:

1. `payment_method` is immutable.
2. `payment_gateway`, `payment_amount`, `payment_currency`, `paid_at` require `atlas.allow_payment_write = 'on'`.
3. `paid` cannot become `not_required/unpaid/pending/failed/cancelled/expired`.
4. `refunded`/`partially_refunded` cannot move back to a non-refund state; partial may become full.
5. Entering `paid/refunded/partially_refunded` requires the trusted flag.
6. A non-COD `status → confirmed` requires `atlas.allow_paid_confirmation = 'on'`.

Both flags are transaction-local (`set_config(..., true)`). Only `record_verified_payment`, `record_verified_refund`, `fail_order_payment`, `expire_stale_reservations` and `finalize_paid_order` set them. A stale n8n workflow or a manual `confirm_order` cannot confirm an unpaid online order. COD bypasses rule 6 and remains unchanged.

**Residual gap (documented, not fixed):** there is no `BEFORE INSERT` guard. A service-role insert could create an order already marked `paid` without a ledger row. Service role is trusted; the browser cannot insert orders directly. If this must be impossible even for service role, add an insert guard that only allows `paid` after a transaction exists (harder because the order is inserted first).

### 4.2 Reservation and stock RPCs (Sections 5–7)

- **`reserve_order_stock`**: locks the order, checks method/status/payment state/no finalized hold, returns an existing unexpired hold, releases an expired hold, locks `order_items`, locks variants then simple products in id order, validates every line, checks aggregate availability before any deduction, deducts exactly the validated quantities, inserts the reservation + item snapshots + audit. Any error rolls the whole hold back.
- **`release_order_reservation`**: locks order, then active reservation, honours the optional reservation-id guard for sweeps, locks order items and the exact stock rows, restores aggregate quantities, marks the reservation `released`/`expired`, writes audit. A second call is a no-op; a finalized reservation is refused.
- **`expire_stale_reservations`**: clamps the batch (1–500), selects expired active rows, releases each **by id** so a renewed hold cannot be swept, and marks `pending → expired` only when the release actually expired the hold. Concurrent sweeps no-op on the reservation lock.
- **Double deduction:** reserve deducts; finalize only consumes the reservation and never deducts. COD still deducts through `confirm_order` and therefore sees held units as unavailable.

### 4.3 Product/variant deletion protection

- `stock_reservation_items.product_id` is `NOT NULL`; both FKs are `ON DELETE RESTRICT`.
- `prevent_reserved_stock_delete()` runs `BEFORE DELETE` on `products` and `variants` and raises a soft-disable message for any reservation history.
- `stock_reservations.order_id` is also `RESTRICT`, so an order with a hold cannot be deleted.
- Hard delete is blocked even for released/finalized history; this preserves audit evidence but is stricter than “active holds only” (see risks).
- Trigger functions have `PUBLIC EXECUTE` revoked and `search_path = ''`.

### 4.4 SECURITY DEFINER and privileges

- **12/12** functions declare `SECURITY DEFINER` **and** `SET search_path = ''`; every object reference is schema-qualified.
- **12/12** functions have `EXECUTE` revoked from `public, anon, authenticated`. Nine RPCs plus `assert_safe_0012_rollback` are granted to `service_role`; the two trigger functions are not granted to anyone.
- New tables have RLS enabled with **no policies** and table privileges revoked from `anon`/`authenticated`; `service_role` gets the required grants.
- `payment_transactions` is `SELECT, INSERT` only for `service_role`; `UPDATE, DELETE` revoked.
- Customers can read their own `orders` row (including payment status/gateway/amount) through the existing orders policy; they cannot read transactions, refunds, reservations or webhooks.
- `payment_gateway_config` is untouched; no credential is read or written by the proposal.

**Residual gap (trusted boundary):** service-role RPCs do not check `auth.uid()` or admin role. The application must authorize refunds, manual releases and reconcile operations before calling them. Database grants keep browsers out, but service role is a trusted caller by design.

### 4.5 Payment state transitions

| From | To | Path |
|---|---|---|
| `unpaid`/`pending`/`failed`/`expired`/`cancelled` | `paid` | `record_verified_payment` / `finalize_paid_order` (verified capture, full amount/currency/identity match) |
| `pending` | `expired` | `expire_stale_reservations`, or `finalize` when the hold is already expired and capture fails |
| `unpaid`/`pending`/`failed`/`cancelled`/`expired` | `failed`/`cancelled` | `fail_order_payment` (matching identity/amount/currency; never from paid/refunded) |
| `paid` | `partially_refunded` / `refunded` | `record_verified_refund` (verified refund, amount cap) |
| `partially_refunded` | `refunded` | `record_verified_refund` |
| `paid`/`partially_refunded`/`refunded` | any downgrade | **Blocked by trigger** |
| COD `not_required` | COD fulfilment statuses | Existing `confirm_order`/n8n path, untouched |

`cancelled → paid` is deliberately allowed for a capture that happened after an admin cancellation; it is surfaced as `order_not_pending` for refund. `failed ↔ cancelled` rewrites are allowed on non-paid orders; they do not lose money history.

### 4.6 Lock ordering and deadlocks

Declared order: `orders → stock_reservations → order_items → variants → products`. `reserve`, `release`, `expire`, `fail` and `finalize` follow it. `record_verified_payment`, `record_verified_refund`, `claim` and `mark` lock only the order or the webhook row. `confirm_order` uses `orders → order_items → variants → products` and never touches reservations, so the extra reservation step cannot create a cycle with it.

**One rare deadlock pair remains:** a hard `DELETE` of a product locks the product row and then cascades/locks variants, while `reserve` locks variants and then inserts reservation items whose FK check takes a key-share lock on the product. PostgreSQL will detect and abort one transaction; neither silently loses stock. Practical mitigation: soft-disable products/variants, which is already the supported path. This is documented, not eliminated.

### 4.7 Rollback safety

`assert_safe_0012_rollback()` refuses if any **active** reservation exists and requires `atlas.allow_destructive_rollback = 'on'` before destructive DDL. The manual sequence is:

1. Inspect counts.
2. Release every active hold (`release_order_reservation(..., 'rollback')`) so stock is restored.
3. Archive orders’ payment fields, transactions, refunds and webhook events into `_archive_0012_*` tables.
4. Enable RLS and revoke `anon`/`authenticated` on the archives.
5. Call the gate, then drop in dependency order: guard triggers → functions → refunds → webhook events → transactions → reservation items → reservations → orders constraints/columns.

Finalized reservation history is dropped with the operational tables; the order audit and archived payment data remain. Run the sequence in one session/transaction and with the application stopped; the gate is not a substitute for maintenance mode. `DROP TABLE payment_refunds` precedes `payment_transactions`, satisfying the new `NOT NULL` FK.

---

## 5. Ledger design decision (explicit)

**Chosen: immutable provider ledger.**

- `payment_transactions` rows are inserted once (`succeeded` by capture, `failed`/`cancelled` by failure callback) and never updated by any function.
- Refund state is **derived** from `payment_refunds` (`status = 'succeeded'`, amount sum) and mirrored on `orders.payment_status`.
- `payment_transactions` has no `updated_at`/update trigger; `service_role` cannot `UPDATE`/`DELETE` it.
- The transaction status check no longer includes `partially_refunded`/`refunded`; those are not transaction states in this design.
- Consequently, the report no longer calls the ledger “append-only while updated”; it is **insert-only** in both function behavior and grants.

`payment_refunds` itself is insert-only through `record_verified_refund`; its `updated_at` trigger remains for future refund-execution workflows but no current function updates it.

---

## 6. COD and n8n compatibility (unchanged)

- `confirm_order(uuid)` is not modified.
- Existing orders and COD inserts receive `payment_method='cod'`, `payment_status='not_required'` from defaults; `orders_online_payment_status_check` allows this.
- The confirmation guard is non-COD only; COD/n8n confirmation still works exactly as before.
- Online inserts must set `payment_method` and `payment_status` explicitly (`pending`/`unpaid`), and must call `reserve_order_stock` before creating a payment session.
- A stale n8n workflow calling `confirm_order` for an online order raises instead of deducting stock.
- **Companion application change still required (not made here):** do not fire the n8n confirmation webhook for online orders until verified payment; the DB guard is the safety net, not the primary gate.

---

## 7. Verification performed

- Read the full proposal and the authoritative migrations for `confirm_order`/order status.
- Counted structure: **12 functions / 12 `$$;` terminators**, all 12 `SECURITY DEFINER` with empty `search_path`, 12 execute revokes.
- Checked there is **no** remaining `UPDATE payment_transactions`, no `payment_transactions_set_updated_at`, and no `ON DELETE SET NULL` in the proposal.
- Confirmed `orders_online_payment_status_check` is `payment_method = 'cod' OR payment_status <> 'not_required'`.
- Re-probed the live schema (columns, 2 orders, 4 products with NULL stock, 22 variants with non-NULL stock, 0 gateway config rows, new tables absent).
- No SQL execution, no DDL/DML, no application change.

These are structural/static checks, not proof of runtime correctness.

---

## 8. Remaining risks and decisions

1. **Hard deletion is blocked for any reservation history**, not only active holds. This preserves audit evidence but means the admin catalogue must soft-disable (`is_active = false`) once a product/variant has been in an online hold.
2. **Online order creation must explicitly set `payment_method` and `payment_status`.** The constraint rejects the COD default for online rows.
3. **A payment session without a prior reservation** is still recorded, but finalize marks the order `out_of_stock` for refund. Reserve-before-session is mandatory.
4. **Provider transaction ids are assumed unique per attempt.** A reused id after a failure is rejected (`not succeeded`); use a fresh provider id per attempt.
5. **No dead-letter/max-attempt cap** for webhook events. Poison events retry with capped backoff and increment `attempts`; monitor and stop manually.
6. **Webhook events are keyed by `(gateway, provider_event_id)` without environment.** If sandbox and live share the database and reuse event ids, a sandbox event could block a live one. The current handler contract has no environment parameter; prefix ids by environment or add an environment column before enabling live. This is the main unresolved schema risk.
7. **Refund execution and restock are out of scope.** `record_verified_refund` records a provider-verified refund only. A failed refund id cannot be reused; use a new provider id. Amounts must be 2-decimal values.
8. **Late payment after expiry** becomes `payment_status='paid'`, `status='out_of_stock'`; refund handling is manual. If capture itself fails after expiry, the attempt is now marked `expired`.
9. **Admin cancellation of an online order** must call `release_order_reservation`; `admin_update_order_status` is unchanged and does not release holds.
10. **`pg_cron` is not verified.** The proposal keeps the pg_cron and Vercel Cron options and the extension check.
11. **Webhook signature verification is application-side.** The database cannot authenticate the provider.
12. **No `BEFORE INSERT` paid-order guard.** A service-role insert could create a paid order without a ledger row; service role is trusted.
13. **Fulfilment statuses beyond `confirmed` are not payment-gated.** An admin could manually mark an unpaid online order `shipped`/`delivered`; no trigger prevents it. Do not do this; add a guard if needed.
14. **Multiple captures / double charges** are rejected for the same order, but reconciliation of two provider captures is an application/refund procedure, not automated.
15. **Staging an earlier draft**: this revision changes table definitions; `create table if not exists` will not migrate them. Reset staging or apply `ALTER`s first.
16. **Rare product-delete/reserve deadlock** described in §4.6; PostgreSQL aborts one transaction, no silent stock loss.
17. **`confirm_order` live body** was not directly introspected; verify with `pg_get_functiondef` on staging.
18. **The proposal is not production-ready until the staging matrix passes.** No runtime claim is made from TypeScript/build checks.

---

## 9. Required staging test plan

Use a **clean, disposable staging project**. Do not run DML against production. Restore stock after destructive tests.

### A. Apply and structural checks

1. Apply the proposal; expect no errors.
2. `select pg_get_functiondef('public.confirm_order(uuid)'::regprocedure);` — unchanged from migration 0002/0006.
3. Confirm all new tables have RLS enabled, no policies, and `anon`/`authenticated` have no privileges.
4. Confirm nine RPCs + `assert_safe_0012_rollback` are executable by `service_role`, not by `anon`/`authenticated`; trigger functions have no client execute.
5. Confirm `service_role` cannot `UPDATE` or `DELETE` `payment_transactions` (`set role service_role; update ...;` → permission denied).

### B. COD regression

1. Create a COD order; expect `payment_method='cod'`, `payment_status='not_required'`.
2. Confirm through the existing n8n/`confirm_order` path; stock deducts once, status `confirmed`, audit `confirmed`.
3. Retry; expect “Already processed”, no second deduction.
4. Confirm the online guard does not fire for COD.

### C. Reservation success and idempotency

1. Create an online order (`safepay`, `pending`) with two lines.
2. `reserve_order_stock` → `reserved`, expiry ≈ 15 minutes, stock decremented exactly, item snapshots written.
3. Call again → `active`, same reservation, no second deduction.
4. Call on a paid/refunded order → `invalid_payment_state`; call after finalization → `already_finalized`.

### D. Concurrent checkout

1. Two sessions reserve the last unit of one variant.
2. One `reserved`, one `insufficient_stock`; stock never negative; one active hold.

### E. Successful payment

1. `finalize_paid_order(..., amount = total, currency = PKR)`.
2. Expect paid + confirmed, reservation finalized, stock unchanged from the hold, one transaction row, `payment_captured` + `confirmed` audits.
3. Retry same transaction → idempotent success, no duplicate ledger/audit.
4. Alter the order’s stored gateway/amount (staging only) and retry → `ok=false`, manual reconciliation (new metadata check).

### F. Failure callback and mismatch protection

1. Fresh reserved order: `fail_order_payment(...,'failed',...)` → stock restored, reservation released, payment failed, audit `payment_failed`.
2. Repeat → no double restore.
3. Attempt failure after success → refused; ledger remains `succeeded`.
4. Create a failure transaction, then alter its amount/currency (staging) and call failure again → `ok=false`; **reservation remains active**, no release, no order update.

### G. Duplicate webhook

1. `claim_payment_webhook` → claimed true, token T1.
2. Claim again while leased → false, “Currently processing…”.
3. Complete with T1 (`processed`); claim again → false, “Already processed”.
4. Confirm one transaction and one capture audit.

### H. Retry / abandoned processing

1. Claim, mark `failed` with a transient error.
2. Immediate re-claim → false (backoff); after backoff → true with a new token.
3. Old token completion → false; new token completes.
4. Set `locked_at` ten minutes in the past; a new claim succeeds.
5. Confirm `attempts` increments and backoff is capped at one hour.

### I. Expiry

1. Reserve, backdate `expires_at` (staging), run `expire_stale_reservations`.
2. Stock restored exactly, reservation `expired`, payment `expired`, order status still `pending`.
3. Run sweep again → 0, no double restore.

### J. Late payment after expiry

1. Expire a hold, then finalize with a verified capture.
2. Expect paid + `out_of_stock`, stock already restored, audit `payment_captured_stock_unavailable`.
3. Repeat with a **failed** late capture → payment status `expired` (new behavior), no pending limbo.

### K. Cancellation

1. Admin-cancel an online order with an active hold; call `release_order_reservation(...,'cancelled')`.
2. Stock restored; reservation released; COD cancellation unchanged.
3. Cancel after finalization → release refused (`finalized`).

### L. Paid-state protection

1. Paid order → `payment_status='pending'` raises.
2. Paid order → change `payment_amount`/`payment_gateway`/`payment_currency`/`paid_at` raises without the flag.
3. `payment_status='refunded'` without the flag raises.
4. COD order status updates still work.

### M. Refund matrix

1. Partial refund (100 of total): order `partially_refunded`, refund row `succeeded`, transaction status **still `succeeded`**.
2. Repeat the same refund id → `ok=true` (idempotent).
3. Same refund id with a different amount, currency, order or transaction association → `ok=false`.
4. Refund the remainder → `refunded`; repeat the **same final refund id after the order is refunded** → `ok=true` (the early idempotency lookup).
5. New refund on a refunded order → refused; refund exceeding captured → refused; refund on COD → refused.
6. Confirm `payment_refunds.transaction_id` is populated and cannot be deleted (`ON DELETE RESTRICT`).
7. Confirm refund sums and order status are consistent after concurrent refund attempts (order lock serializes).

### N. Delete protection

1. With an active hold, `delete from products` and `delete from variants` → raise soft-disable message.
2. Release, then retry delete → still raises because reservation history exists.
3. Soft-disable (`is_active=false`) succeeds; storefront hides it.
4. Confirm an order with a reservation cannot be deleted (`RESTRICT`).

### O. Concurrent finalize

1. Fire two finalize calls for the same order/transaction concurrently.
2. Exactly one transaction row, one confirmed audit, one stock outcome; the other is idempotent success.

### P. Rollback rehearsal

1. With an active hold, `assert_safe_0012_rollback()` raises.
2. Release all holds, archive, set `atlas.allow_destructive_rollback='on'`, call again → passes.
3. Run the drop sequence on staging in one session; verify archives retain payment data and stock is fully restored.
4. Never run the drop section against production.

### Q. Webhook environment collision (unresolved-risk test)

1. Insert/claim the same provider event id under sandbox and live (or two simulated environments).
2. Confirm current behavior blocks the second one because the key has no environment. Decide whether to prefix event ids or add an environment column before enabling live.

### R. Unpaid-online shipping check

1. Attempt `shipped`/`delivered` on an unpaid online order.
2. Confirm current behavior (no trigger); if this must be prevented, add the fulfilment guard and retest.

---

## 10. Confirmation

- **No SQL executed. No migration applied. No live data changed.**
- **No application code, env var, credential, COD/n8n flow or Safepay setting modified.**
- Only read-only `SELECT`s were run for schema verification; the probe file was deleted.
- The proposal remains at `supabase/proposals/0012_safepay_stock_reservation.sql`, outside `supabase/migrations/`.

**Bottom line:** the corrected SQL is statically consistent and suitable for a clean staging deployment and the test matrix above. It is **not** certified for production, and the webhook-environment key and delete/fulfilment operational risks must be decided before going live.
