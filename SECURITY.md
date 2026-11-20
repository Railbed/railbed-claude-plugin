# Security

## Reporting a vulnerability

Please don't open a public issue for a security problem. Email security@railbed.com, or follow the policy at https://railbed.com/security/. We reply from the same address.

## What this repository holds

Configuration and instructions only: the plugin manifest, the public address of Railbed's hosted MCP server, skills, a read-only review agent, a README and the logo.

It never holds server code, API keys, webhook signing secrets, OAuth client secrets or other credentials, internal hostnames, or merchant and buyer data. The plugin ships no hooks, commands, scripts, executables or other code that runs on your machine. One skill may ask, in Claude Code, to run Railbed's command-line tool from npm at a pinned version (`npx checkouts.md@0.2.0`); it runs only when the person allows the command, and the README says what it does.

## How access works

Sign-in and permissions live on Railbed's server, not in this plugin:

- Claude signs in with OAuth (authorization code with PKCE). No token or key is stored in these files.
- The signed-in person approves one business, Test or Live mode, and Read only or Full access in Railbed. Tool arguments can't change that choice.
- Every change to an invoice, checkout or webhook is a proposal the person confirms in Railbed's own page. The one exception is simulating a payment on a Test connection, which moves no money.
- The tools can't move funds, refund payments, change payout wallets, accept held payments or reveal secrets.

Disconnect at any time from https://app.railbed.io/developers#mcp.

## Controls

- Before each release Railbed checks the plugin with its own validator: the manifest and components, a read-only agent, an HTTPS-only allowlisted MCP host, no inline credentials, no scripts and a secret scan.
- CI in this repository runs `claude plugin validate --strict` and gitleaks over the full history on every push and pull request.
- Adding a new MCP host to the allowlist needs a security review.
