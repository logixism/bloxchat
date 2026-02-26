<p align="center">
  <img src="https://github.com/logixism/bloxchat/blob/main/apps/desktop/app-icon.png" alt="BloxChat logo" width="150" />
</p>

# BloxChat

BloxChat is a Windows desktop chat companion for Roblox games.  
It includes:

- a Tauri desktop app (`apps/desktop`)
- a Bun + tRPC backend (`apps/server` + `packages/api`)

## Quick Start (Just Use the App)

1. Download the latest installer from [Releases](https://github.com/logixism/bloxchat/releases/latest).
2. Install and launch **BloxChat**.
3. Complete Roblox verification in-app.
4. Join a Roblox game and chat.

Release builds on Windows auto-update on startup when a newer MSI is available.

## What It Does

- Verifies your Roblox account and keeps a short-lived session.
- Routes chat by Roblox `JobId` (from Roblox logs), so each server is its own channel.
- Supports reply threading and local command `/clear`.
- Can auto-focus on `/` and return focus to Roblox on `Esc`.
- Lets you configure API URL, Roblox logs path, image loading, opacity, and auto-join message.

## Platform Support

The desktop client is currently Windows-focused (Win32 integration is used in the Rust layer). A contributor may, if they want to, introduce Linux/MacOS support with a PR.

## Project Layout

```text
apps/
  desktop/   React + Vite + Tauri desktop app
  server/    Bun server process that hosts the tRPC API
packages/
  api/       Shared tRPC routers, auth/chat logic, env config
scripts/
  bump-desktop-version.mjs
```

## Local Development

### 1. Prerequisites

- Windows 10/11
- [Bun](https://bun.sh/) (project is pinned to `bun@1.3.8`)
- Node.js 18+
- Rust toolchain `1.88.0` (see `apps/desktop/src-tauri/rust-toolchain.toml`)
- Tauri Windows prerequisites (MSVC build tools + WebView2 runtime)

### 2. Install Dependencies

```bash
bun install
```

### 3. Configure Environment Variables

Create `apps/server/.env`:

```env
# required
JWT_SECRET=replace_with_32_to_64_char_secret
VERIFICATION_SECRET=replace_with_at_least_64_char_secret
VERIFICATION_PLACE_ID=123456789

# optional
ROBLOX_COOKIE=
CHAT_DEFAULT_MAX_MESSAGE_LENGTH=280
CHAT_DEFAULT_RATE_LIMIT_COUNT=4
CHAT_DEFAULT_RATE_LIMIT_WINDOW_MS=5000
CHAT_LIMITS_OVERRIDES=
```

Notes:

- `JWT_SECRET` must be 32-64 chars.
- `VERIFICATION_SECRET` must be 64+ chars.
- `VERIFICATION_PLACE_ID` must be a numeric Roblox place ID.
- `CHAT_LIMITS_OVERRIDES` expects JSON (for per-channel overrides).

### 4. Run in Dev Mode

From repo root:

```bash
bun run dev
```

This runs:

- backend server on `http://localhost:3000`
- Tauri desktop app in development mode

### 5. Point Desktop to Local API

By default, the desktop app uses `https://bloxchat.logix.lol`.  
For local backend testing, open **Settings** in the app and set:

`API Server URL` -> `http://localhost:3000`

Include `http://` explicitly for local non-TLS development.

## Verification Flow (Important for Self-Hosting)

Login depends on a Roblox verification flow:

1. Client starts verification and gets a code.
2. User joins the configured verification place (`VERIFICATION_PLACE_ID`).
3. Game-side code calls the backend verification procedure using `x-verification-secret`.
4. Client polls for completion and receives JWT session data.

If your game integration does not send the matching verification secret, login will fail.

## Useful Commands

```bash
bun run dev            # server dev + tauri desktop dev
bun run start          # run backend server once
bun run build          # turbo build
bun run desktop:build  # build desktop bundles via tauri
bun run check-types    # workspace type checks
bun run format         # format ts/tsx/md
```

## Troubleshooting

- App cannot connect: verify **Settings -> API Server URL** points to the correct backend.
- Local API fails with HTTPS errors: use `http://localhost:3000` (not `localhost:3000`).
- Verification expires: restart verification and complete it before timeout.
- No channel switching: verify Roblox logs path in Settings points to your Roblox logs folder.

## Legal

- [Terms](/TERMS.md)
- [Privacy](/PRIVACY.md)
