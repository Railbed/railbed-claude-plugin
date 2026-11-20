# Changelog

## 1.5.0 — 2026-11-20

- New skill, `invoice-customers`: invoice a customer for one amount or several lines, share the invoice's page or email it with its PDF, send a reminder, void it, and answer what is unpaid, overdue or paid. Claude says "invoice" throughout, as Railbed does.
- `prepare-railbed-changes` now covers reusable checkouts (pages, pricing tables and widgets, with every option the tool takes) and canceling an unpaid one-off link, and sends billing to the invoice skill.
- The integration and review skills cover the invoices API (`POST /v1/invoices`, which honors `Idempotency-Key` like checkout sessions), invoice webhook events, which reach only an endpoint that names them, changing an endpoint's events with `PATCH /v1/webhook_endpoints/:id`, and paying another saved wallet with `payout_wallet_id` from `GET /v1/payout_wallets`.
- The webhook skill explains a missing invoice event, sample invoice events and an endpoint removed after answering 410 Gone.
- The integration skill treats the example integrations at checkouts.md as reference code, and runs Railbed's command-line tool at a pinned version (`npx checkouts.md@0.2.0`) only after saying what it does.
- The README says what the plugin reads, fetches and may run, lists example requests for invoicing, and has a troubleshooting table.
- Needs server 1.9.0, as before.

## 1.4.0 — 2026-11-18

- Invoices: Claude can list and read invoices (`railbed_list_invoices`, `railbed_get_invoice`) and prepare an invoice with line items, discount, tax, a due date, part payments and reminders, or emailing or voiding one, for you to confirm in Railbed (`railbed_create_invoice`, `railbed_send_invoice`, `railbed_void_invoice`).
- Payments read by Claude carry the invoice they're toward (`invoice_id`) and any `tip`.
- An invoice needs a customer's name and email only to be emailed; one shared by its link can go without them. Invoices also take the card providers they offer and the page the payer lands on after paying.
- Needs server 1.9.0.
- The README asks for an invoice where it used to ask for a payment link, and names server 1.9.0 as the version it needs.

## 1.3.1 — 2026-11-17

- The author, publisher and copyright name Railbed, LLC, the company behind Railbed. Nothing else changed.

## 1.3.0 — 2026-11-17

- The integration skill starts from the tested recipe for the project's stack and the playbook at checkouts.md, instead of a blank page, and ends with the Test proof.
- Keys without pasting: where it can run commands, Claude gets the app's secret key and webhook signing secret with `npx checkouts.md login` and `npx checkouts.md webhook`, after one approval in the person's browser.
- The webhook skill no longer carries a dated note about older endpoints; it says to check an endpoint's `events`.
- Server 1.7.0 ranks documentation search by the question's words, describes every tool parameter and points integration work at the docs tools and recipes in its instructions.

## 1.2.0 — 2026-11-07

- Payment links can be paid for 1 to 365 days (7 by default) and can choose their card providers with `routing`; left out, the payer chooses from every provider the business offers.
- Prices can also be in Indian rupees (`INR`) and Swedish kronor (`SEK`).
- The payments skill reports what reached the wallet in US dollars, whatever the coin (`merchant_received_usd`, and `received_usd` in period totals).
- The integration skill points Claude at the OpenAPI document for exact `/v1` schemas.
- Needs server 1.5.0.

## 1.1.0 — 2026-10-30

- The integration skill covers embedded checkout for signed-in users: the embed asks the merchant's server for a session at Continue, and the server makes it from a saved checkout with `POST /v1/checkout_sessions`. It points Claude at the existing-app guide.
- Server 1.3.0 returns each checkout's `slug`, the value that request takes as `checkout`.

## 1.0.2 — 2026-10-26

- The `ground-rules` skill is gone, so it no longer shows in the `/` menu. Railbed's server already gives Claude those instructions when it connects, and each task skill carries the detail for its job.

## 1.0.1 — 2026-10-23

- The README no longer embeds the logo; the directory shows the plugin's icon.
- The Test checkout skill and README say that Claude asks before each simulated payment, now that the server marks `railbed_simulate_payment` as changing data.

## 1.0.0 — 2026-10-23

- First release, built for Claude Code, Cowork and claude.ai chat.
- Connects to Railbed's hosted MCP server at `https://mcp.railbed.io/mcp` (server 1.2.0 or later) with OAuth sign-in.
- Skills for the ground rules, connecting an account, building an integration, reviewing one, testing checkout in Test mode, inspecting payments, diagnosing webhooks and preparing browser-confirmed changes.
- A read-only integration reviewer agent that can read code and Railbed's public docs and nothing else.
