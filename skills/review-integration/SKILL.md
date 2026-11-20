---
name: review-integration
description: Audit an existing Railbed integration without changing it. Covers secret handling, server-only API calls, idempotency, raw-body webhook signature checks with timestamp tolerance and replay protection, fulfilment gating, Test and Live separation, amount and currency binding, and error and expiry handling. Use when someone wants their Railbed checkout or webhook code reviewed before going live, after a change, or because something looks wrong.
---

# Review a Railbed integration

Audit how a codebase talks to Railbed and report what could lose money, fulfil without payment, leak a secret or break under retries. A review changes no files; the person or another agent applies the fixes.

Where subagents are available (Claude Code and Cowork), hand the review to the `railbed:railbed-integration-reviewer` agent: it follows this skill read-only in its own context. If you are that agent, or subagents are not available, do the review yourself as below.

## Workflow

1. Find the integration: search for `pay.railbed.io`, `railbed`, `Railbed-Signature`, `whsec_`, `rb_live_`, `rb_test_`, `checkout_sessions`, `invoices`, `payment_links` and `Idempotency-Key`. Read every file that creates sessions or invoices, handles the return page, receives webhooks or fulfils orders.
2. Fetch the current contract with `railbed_docs_search` and `railbed_docs_read` (`api`, `api/checkout-sessions`, `api/invoices`, `webhooks`, `webhooks/events`, `webhooks/signatures`, `guides/fulfilment`, `testing`) and cite its URLs. Judge against the docs, not memory.
3. Work through the checklist and note the file and line for every finding.
4. If no repository is open, say that a review needs the code, or review the snippets the person pasted against the same checklist.

## Checklist

- **Secrets.** Keys and signing secrets come from the environment or a secret store, never from source, logs, URLs, client bundles or chat. A key in a browser bundle is critical. Do not print any secret value you find; name the file and line only.
- **Server only.** Every call to `https://pay.railbed.io/v1` runs on the server with `Authorization: Bearer` and the mode's key. No API call from browser or mobile code. The `handoff_url` opens in the buyer's browser from a click, never fetched, framed or rewritten.
- **Idempotency.** `POST /v1/checkout_sessions` and `POST /v1/invoices` send an `Idempotency-Key` saved with the order before the call and reused on retry with the same body. `POST /v1/payment_links` has no such header, so its creates check by `reference` before creating again.
- **Signature.** Verification runs on the raw request body, parses `t` and every `v1` from `Railbed-Signature`, computes HMAC-SHA256 over `{t}.{raw body}` with the `whsec_…` secret, rejects `t` outside five minutes, compares in constant time and accepts any matching `v1` (two during a secret roll). The 2xx is sent only after the event is stored. Unknown event types are acknowledged, not rejected. Sample events (`metadata.sample` is `"true"`) are skipped with a 2xx.
- **Events.** The endpoint lists every event type the code relies on: one made without a list gets the payment events only, and `invoice.*` events arrive only when named. Code that marks an invoice paid acts on `invoice.paid` or on each `payment.paid` that names the invoice (`invoiceId` on a webhook's payment), never on `invoice.sent` or `invoice.viewed`. A part payment (`invoice.partially_paid`) does not release what the full amount buys.
- **Replay and duplicates.** Event ids are stored with a unique constraint in the same transaction as their effects. A later event never undoes a paid order.
- **Fulfilment gate.** Grants happen only on `status` `paid` from a verified event or `GET /v1/payments/:id`, after binding the payment id saved on the order, `livemode`, `reference` and metadata, and `amount` with `currency` to the stored order. `held`, `pending`, `expired` and a visit to `success_url` grant nothing. A tip (`tip`) is part of a payment's `amount` and never counts toward what an invoice is owed. The grant is recorded with a unique constraint on the payment id (or the order id for shipped goods) in one transaction.
- **Test and Live.** Separate keys, endpoints and secrets per environment; the payment's mode matches the order's; nothing can read Live with a Test key or the reverse.
- **Errors and expiry.** A `429` waits for `Retry-After`; a `5xx` retries with backoff; a `409` is handled by its code: `idempotency_in_progress` waits `Retry-After` and resends the same request and key, `idempotency_conflict` stops (a different order needs a new key), `order_paid` reads the order instead of charging again, and `not_cancelable` stops; sessions expire after 24 hours and a late `paid` is still handled; a background job rechecks unfinished payments gently.
- **Buyer-facing truth.** The return page shows paid only after the server has seen `paid`.

## Report

- Findings first, ordered by severity: `critical` (money or fulfilment at risk, secret exposed), `high` (wrong under retries or duplicates), `medium` (robustness), `low` (hygiene). Each with file:line, what is wrong, why it matters, the docs URL and a concrete fix.
- What was checked and found correct, briefly.
- What could not be verified from the code, such as whether a deployed environment variable is set.
- No edits, no secret values, and no claim that a Test simulation or a clean review proves real settlement.
