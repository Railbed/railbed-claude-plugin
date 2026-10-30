# Changelog

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
