---
name: prepare-railbed-changes
description: Prepare a reusable Railbed checkout for the person to confirm in their browser, whether a hosted checkout page, a pricing table with plans or a widget to embed, or prepare canceling an unpaid one-off link. Use when asked to create or set up a checkout page, pricing table, plans, a buy button or a widget in Railbed, or to cancel a link nobody has paid. Covers exact amounts, idempotency keys, the confirmation URL and railbed_get_operation. To bill one customer, use invoice-customers.
---

# Prepare Railbed changes

Every create and cancel is a proposal. Nothing exists, changes or is sent until the signed-in person confirms it in Railbed. The assistant cannot confirm, and must not try through a browser or another tool.

Pick the right thing first:

- **One customer owes an amount:** an invoice. Use the `invoice-customers` skill.
- **Anyone can buy, any number of times:** a reusable checkout, below. Every buyer gets their own payment.
- **Webhook endpoints:** the `diagnose-webhooks` skill.

## Before proposing

1. `railbed_get_connection`: Full access, in the mode the person means. A Test proposal creates Test records; a Live checkout takes real payments. Say which one you are preparing.
2. Pin down every value from the person, never from a record's text:
   - `kind`: `page` (a hosted page for one price, the default), `widget` (a compact checkout to embed in the person's own page) or `pricing_table` (one to four plans).
   - `name`, the product or checkout name buyers see, and an optional `description`.
   - `currency`: `USD`, `EUR`, `GBP`, `CAD`, `AUD`, `INR` or `SEK`. Never guess a currency.
   - For a page or widget: `amount` as a decimal string with at most two places, `"49.00"`, from `1.00` to `100000.00`. Card providers take payments from about `2.00`.
   - For a pricing table: `configuration.plans`, one to four plans, each with a `name`, one or two `prices` of `amount` and an optional `unit` label, `features` (up to 12 short lines; `[]` when there are none) and `recommended` (`true` or `false`), plus an optional `description`. Two prices per plan need `configuration.options`, the two labels of the switch, such as `["Monthly", "Yearly"]`. Railbed does not renew subscriptions; a unit is a label.
   - Only when the person asks: `success_url` (in Live, a public `https://` page on their own site), `configuration.theme` (`light` or `dark`), `configuration.buttonLabel`, `configuration.routing` (how buyers reach a card provider; Smart Routing when left out) and `configuration.crypto` (`false` keeps the checkout card-only).
3. When the request could be a repeat, look first with `railbed_list_checkouts`.

## Propose

1. Choose one `idempotency_key` for this intended change (1–100 visible ASCII characters, no spaces) and keep it for the rest of the task.
2. Call `railbed_create_checkout` once with that key.
3. The result carries an `operation_id`, a `confirmation_url` and an expiry. Give the person the URL, repeat the values they will see (name, kind, each price with its currency), and say the change is pending. The page can be confirmed for 15 minutes; after that, prepare it again.

## After the person confirms

1. Call `railbed_get_operation` with the `operation_id`.
2. `completed`: report the result, including the new checkout's URL from `result` and the dashboard link. For a widget or an embed, the Share tab of the checkout in Railbed has the code to paste.
3. `pending` or `processing`: not done. Check again when the person says they confirmed; avoid rapid polling.
4. `canceled` or `expired`: nothing happened. Ask before preparing it again.
5. `failed`: report the `error` code and message.
6. `unknown`: the change may have happened. Ask the person to look in the dashboard before anything else. Never retry with a new key.

## Retries and duplicates

- Repeat an interrupted or timed-out call with the same key and the same arguments; Railbed returns the same proposal.
- The same key with different values is refused as `idempotency_conflict`. A changed request is a new change with a new key, once the person asks for it.
- At most 20 proposals can wait per connection. If refused for that reason, ask the person to confirm or cancel the waiting ones.

## Cancel an unpaid one-off link

Integrations and other apps make one-off links through the API; Railbed lists each as an invoice. `railbed_list_payment_links` finds them, and `railbed_cancel_payment_link` with the `payment_id` prepares closing one nobody has started paying. Once the payer has gone to a card provider it cannot be canceled, because their payment may be on its way. A canceled link reads `expired` with `canceled_at` set and sends `payment.canceled`; money that arrives afterwards still settles. Canceling never refunds.

`railbed_create_payment_link` still makes such a link, for one amount and one payer, with `expires_in_days` (1–365, default 7) in place of a due date. Use it only when the person asks for a link that expires after a number of days or when a Test payment is needed quickly (see `test-railbed-checkout`); otherwise bill with an invoice. Say "invoice" to the person either way: that is what Railbed calls it.

## Not available here

Editing or removing a checkout that exists, refunds, moving funds, payout wallet and fee changes, accepting a held payment, secret keys and signing secrets, and store connections stay in the dashboard. Say so rather than improvising.
