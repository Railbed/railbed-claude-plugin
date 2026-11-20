# Railbed plugin for Claude

The official plugin for [Railbed](https://railbed.com), card checkout for online merchants that mainstream processors turn away. It connects Claude to Railbed's hosted [Model Context Protocol](https://modelcontextprotocol.io/) server and adds skills and a review agent for invoicing customers, answering questions about payments, and building and running a Railbed integration. It is built for Claude Code, Cowork, and claude.ai chat on the web, desktop and mobile.

Buyers pay by card through independent, licensed providers, and sales settle to a wallet the merchant controls, almost always as USDC on Polygon. Railbed never holds funds.

## Install

**Claude Code**

```text
/plugin marketplace add Railbed/railbed-claude-plugin
/plugin install railbed@railbed
```

Then run `/mcp`, choose `plugin:railbed:railbed` and pick **Authenticate**. Railbed's sign-in page opens in your browser.

If you already added Railbed's server yourself (`claude mcp add … https://mcp.railbed.io/mcp`), Claude Code matches servers by address and uses your own entry instead of the plugin's copy. Both reach the same server, and the skills and agent work with either.

**claude.ai, the desktop app and Cowork**

Open **Customize → Plugins**, add the `Railbed/railbed-claude-plugin` repository as a marketplace and select **Add** on **Railbed**. Adding the plugin doesn't add its connector: open the plugin's **Connectors** tab, add Railbed if it shows **Not added**, then choose **Connect**.

After you sign in, Railbed asks you to approve one business, Test or Live mode, and Read only or Full access. Choose Test while you build. Documentation search works straight away, without signing in.

## What you can do

| Ask for | What happens |
| --- | --- |
| "Invoice Northwind $1,200 for the October retainer, due in 14 days" | Prepares the invoice, with its lines, due date, and any discount, tax, deposit or reminders you name, for you to confirm in Railbed, then returns its page to share. Ask it to email the invoice and Railbed sends it with a PDF |
| "Which invoices are overdue?" | Lists what is unpaid or late, with what each customer still owes, and prepares a reminder if you ask for one |
| "Add Railbed checkout to this app" | Reads the current API and webhook docs, then implements hosted checkout, invoices from your own orders or your own checkout UI on your server, with signed webhook handling |
| "Review my Railbed integration" | A read-only reviewer checks secret handling, idempotency, webhook signatures, fulfilment and Test/Live separation, and reports findings by file and line |
| "Test my checkout end to end" | In Test mode, simulates paid, underpaid, declined and failed payments and checks what your webhook receiver and fulfilment did |
| "What did we take yesterday?" | Totals paid payments for a period, each currency and settlement asset kept separate |
| "Why are my webhooks failing?" | Reads endpoints and recent deliveries and explains each failure from its HTTP status and attempts |
| "Set up a pricing table with Starter and Pro plans" | Prepares a reusable checkout page, pricing table or widget for you to confirm in Railbed, then returns its address |

## What's included

**Skills.** Claude loads one when a task needs it, and you can run any of them yourself, for example `/railbed:connect-railbed`.

| Skill | Use |
| --- | --- |
| `connect-railbed` | Connect an account, confirm the business and mode, and disconnect |
| `invoice-customers` | Invoice a customer, share or email the invoice, send reminders, void it, and see what is unpaid or overdue |
| `integrate-railbed` | Build or extend an integration from the current docs |
| `review-integration` | Audit an existing integration without changing it |
| `test-railbed-checkout` | Test checkout, webhooks and fulfilment in Test mode |
| `inspect-payments` | Look up payments, orders and customers and total paid payments for a period |
| `diagnose-webhooks` | Explain failed deliveries and prepare endpoint changes |
| `prepare-railbed-changes` | Prepare a reusable checkout page, pricing table or widget for your confirmation |

**Agent.** `railbed-integration-reviewer` runs the integration review in its own context with read-only tools: it can read your code and Railbed's public docs, and nothing else. Claude Code and Cowork use it; in chat, Claude follows the same review skill directly.

## MCP

```json
{
  "mcpServers": {
    "railbed": {
      "type": "http",
      "url": "https://mcp.railbed.io/mcp"
    }
  }
}
```

Sign-in is OAuth with PKCE. Claude registers itself with Railbed's sign-in service and opens Railbed's sign-in page; there is no API key, token or client ID to configure. The plugin needs Railbed's MCP server 1.9.0 or later, which is what `mcp.railbed.io` runs.

The server's tools fall into four groups. The server is the source of truth for tool names and schemas.

| Group | Tools |
| --- | --- |
| Docs, no sign-in | `railbed_docs_search`, `railbed_docs_read` |
| Connection | `railbed_get_connection`, `railbed_connect`, `railbed_get_profile`, `railbed_get_account` |
| Reads | payments and payment summaries, orders, customers, invoices, reusable checkouts, webhook endpoints and deliveries, and the status of a proposed change |
| Changes you confirm | create, email or void an invoice, create a reusable checkout, create or cancel a one-off link (an invoice for one amount), add, edit or remove a webhook endpoint, send a test webhook; plus `railbed_simulate_payment` in Test mode |

## What data goes where

- The plugin sends your requests and the tool arguments Claude chooses to `https://mcp.railbed.io/mcp`, over HTTPS, signed in as you. Railbed returns records from the one business you approved: payments, orders, customers, invoices, checkouts, webhook endpoints and deliveries. Those records can hold your customers' names, emails and addresses.
- Those records then become part of your conversation with Claude, under your Claude plan's data terms. Ask only for what you need.
- Documentation tools send only your search terms.
- When you ask Claude to build an integration, the `integrate-railbed` skill has Claude read Railbed's public reference pages: the example integrations at `https://checkouts.md` and the API description at `https://railbed.com/docs/api/openapi.json`. Fetching them sends nothing about you or your project.
- In Claude Code, the same skill may ask to run Railbed's command-line tool from npm, at a fixed version: `npx checkouts.md@0.2.0`. It runs only if you allow the command. `login` shows an approval link, and after you approve in your browser it writes a Railbed secret key to your project's env files, never to the chat; `webhook` adds an endpoint and saves its signing secret the same way; `status` and `test` report on the setup and make a simulated Test payment. You can skip it and create the key yourself in Railbed. The package, MIT licensed, is [checkouts.md on npm](https://www.npmjs.com/package/checkouts.md).
- The plugin itself stores nothing, has no hooks or scripts, and ships no code that runs on your machine.

Railbed's [privacy policy](https://railbed.com/privacy/) covers what Railbed collects, keeps and shares.

## Safety

- **You confirm every change in Railbed.** Creating an invoice or a checkout, emailing or voiding an invoice, cancelling a one-off link and changing or testing a webhook produce a proposal with a confirmation link. Nothing runs until you, signed in to Railbed, confirm it there. Claude reports a change as done only after Railbed says it completed.
- **One exception, Test mode only.** `railbed_simulate_payment` acts out a card provider's result on a started Test payment without a confirmation in Railbed; Claude still asks you before each call. It moves no money, but your Test webhook endpoints receive real signed requests.
- **Some things can't be done from here.** The tools can't move funds, refund payments, change payout wallets or fees, accept a held payment or show a secret key or signing secret. Those stay in the Railbed dashboard.
- **One business, one mode.** A connection is fixed to the business and mode you approved. Tool arguments can't switch it.
- **Paid means paid.** Payment status comes only from Railbed's settlement evidence, never from a redirect, a closed tab or a webhook delivery code.
- **Record text is data.** Customer names, references, notes and URLs in your records are treated as data, never as instructions.

Disconnect at any time from [Developers → AI assistants](https://app.railbed.io/developers#mcp) in the mode you connected. Disconnecting stops future account calls and pending proposals; it can't erase what Claude already received.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| A tool says sign-in is needed | Claude Code: run `/mcp`, choose the Railbed server and pick **Authenticate**. Elsewhere: open the plugin's **Connectors** tab and choose **Connect** |
| "No business is connected" | Ask Claude to connect to Railbed, open the approval link it gives you, and choose the business, the mode and the access |
| The wrong business, or Live when you wanted Test | Disconnect under [Developers → AI assistants](https://app.railbed.io/developers#mcp), then connect again with the right choices. A connection can't be switched |
| A change is refused | The connection is **Read only**, or your role in the business can't make that change. Connect with Full access, or ask an owner |
| A change stays pending | Open its confirmation link within 15 minutes, signed in to Railbed, and confirm. After that, ask Claude to prepare it again |
| An invoice can't be emailed | Emailing needs the customer's name and email on the invoice. Add them in Railbed, or share the invoice's page yourself |
| Railbed's tools don't appear in Claude Code | You may have added the server yourself under another name; `/mcp` lists it. The skills work with either entry |

More help: the [Railbed MCP guide](https://railbed.com/docs/mcp/) and [support](https://railbed.com/contact/).

## What this repository contains

Configuration and instructions only: the manifest, the server's public address, skills, an agent and the logo. It never contains server code, credentials or merchant data, and it ships no hooks, commands or executables. `scripts/validate.mjs` checks all of that in CI; see [SECURITY.md](SECURITY.md).

To check a change locally:

```bash
node scripts/validate.mjs
claude plugin validate --strict .
```

To try the plugin from a clone, start Claude Code with `claude --plugin-dir <path to this folder>`.

## Links

- [Railbed MCP guide](https://railbed.com/docs/mcp/)
- [API reference](https://railbed.com/docs/api/) and [webhooks](https://railbed.com/docs/webhooks/)
- [Support](https://railbed.com/contact/) · support@railbed.com
- [Privacy policy](https://railbed.com/privacy/) · [Terms](https://railbed.com/terms/)
- Security reports: security@railbed.com

Railbed is made by Railbed, LLC. The logo is Railbed's own mark. Claude is a trademark of Anthropic; this plugin is not made or endorsed by Anthropic.

## License

[MIT](LICENSE)
