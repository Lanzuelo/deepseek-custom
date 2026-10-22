# DeepSeek Custom

English | [中文](CUSTOM.zh.md)

DeepSeek Custom is an **unofficial fork** of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) that adds two product modes and an API balance reading to the Desktop application. It is not affiliated with, sponsored by, or endorsed by DeepSeek AI. The upstream project and this fork remain under the MIT license; see [LICENSE](LICENSE).

## What is different

- **Agent / Chat switch** in the sidebar. `Agent` is the unchanged Harness workspace and stays the default. `Chat` opens the official DeepSeek site inside the desktop window. The choice is remembered as a single device-local enum, and an unknown value falls back to `Agent`.
- **Embedded official chat.** `https://chat.deepseek.com` runs in an isolated Electron `WebContentsView` with `sandbox`, context isolation, no preload, no Node integration, deny-all permission handlers, and an allowlist for that one origin. Other links open in the operating system browser. Harness never reads page content, cookies, or tokens, and does not reproduce private web APIs.
- **Local chat accounts.** Each account uses its own persistent browser partition; Harness stores only a user-chosen label and opaque metadata. Commands cover create, select, rename, clear local sign-in, and delete. A deletion records its partition before cleanup, so an interrupted cleanup resumes on the next launch. Passwords and 2FA stay inside the official page.
- **API balance.** The agent composer shows the DeepSeek API wallet from the documented `GET https://api.deepseek.com/user/balance`, read by the Host with the configured key. The renderer receives only string amounts and a status; the key never leaves the Host. Custom or proxy endpoints report `unsupported` instead of being probed.
- **Desktop identity.** The packaged application is named **DeepSeek Custom**, uses its own application id and its own Electron `userData` directory, so it installs and runs beside the official DeepSeek Harness.

The existing agent features are unchanged: sessions, drafts, scroll position, models, efforts, tools, approvals, terminals, sidebars, and shortcuts keep working, including across a round trip through Chat mode.

## Status

This is an experimental fork prepared for manual testing. The Windows x64 installer is unsigned. macOS support comes from the same source, but this fork has not produced or tested a macOS artifact. There is no automatic update feed for this fork.

## Install on Windows

1. Download `DeepSeek-Custom-Setup-<version>.exe` from the repository releases.
2. Run it. Windows SmartScreen reports an unknown publisher because the build is unsigned: choose **More info → Run anyway**.
3. Installation is per-user and separate from the official DeepSeek Harness.
4. To uninstall, use **Settings → Apps → DeepSeek Custom**, or the uninstaller in the installation directory.

A portable build is the `win-unpacked` directory from the same build; run `DeepSeek Custom.exe` directly.

## Data and cleanup

- Application data lives in `%APPDATA%\DeepSeek Custom` (Chromium profile, chat account metadata).
- Chat account partitions live inside that Electron profile. Deleting an account in the Chat account menu removes its cookies and site storage.
- Harness product data (`~/.dsh`) is shared with any installed DeepSeek Harness or `dsh` CLI. Do not run both desktop applications at the same time against the same profile. To isolate a test instance, launch it with `DSH_HOME` set to a private directory.
- Uninstalling the application does not delete `%APPDATA%\DeepSeek Custom` or `~/.dsh`; remove them manually if a full reset is intended.

## Configure the balance

Configure a DeepSeek API key through the existing Harness credential flow (Models settings or the welcome screen). The balance pill appears in the agent composer's status row when the official endpoint is configured. Without a key, or with a non-official base URL, the pill is hidden instead of showing a zero.

## Chat mode notes

- The first Chat launch shows the official DeepSeek login page. Sign in there; Harness never sees the password, CAPTCHA, or one-time code.
- If the site refuses to be embedded for your account or region, use **Open in browser** in the Chat toolbar.
- The Chat toolbar provides back, forward, reload, account selection, and opening the site externally. Closing Chat destroys the native view; the agent workspace stays mounted underneath.
- Chat mode requires the desktop application. The browser build shows an explanation and a link to `chat.deepseek.com` instead of trying to own another origin's cookies.

## Build from source

Requirements: Node.js `^22.19` or `>=24`, pnpm `11.28.5`, and on Windows the Visual Studio C++ Build Tools with a Windows SDK (the NSIS installer helper is compiled during packaging).

```sh
pnpm install
```

Copy `apps/desktop/.env.windows.example` to `apps/desktop/.env.windows` and fill in an application id and the update-policy origins required by the packaging script, then build the unsigned installer:

```sh
pnpm --filter @deepseek-ai/dsh-desktop run package:win:x64:unsigned
```

The artifacts land in `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/`. Packaging that runs through the full release script repacks every workspace package and re-downloads the bundled runtime, which takes tens of minutes; a repeat build with warm `.desktop-build` trees can invoke electron-builder directly.

Two optional environment variables rename a local build without editing source: `DSH_DESKTOP_PRODUCT_NAME` and `DSH_DESKTOP_ARTIFACT_PREFIX`.

For development, run `pnpm run dev:desktop`. It needs the Electron binary (`pnpm --filter @deepseek-ai/dsh-desktop exec install-electron`) and prepares the bundled runtime on first use.

## Tests

Focused suites for the added surfaces:

```sh
pnpm exec vitest run packages/client/ui-chat-mode packages/llm/deepseek-balance apps/desktop/tests/chat-view.spec.ts
pnpm exec vitest run apps/desktop/tests/main-startup.spec.ts apps/desktop/tests/preload-app.spec.ts
pnpm --filter @deepseek-ai/dsh-client-ui-chat-mode run bundle
```

## Repository scope

The fork adds `packages/client/ui-chat-mode`, `packages/llm/deepseek-balance`, the Desktop chat view in `apps/desktop/src/chat-view.ts` and `chat-view-ipc.ts`, and the corresponding registration, tests, and documentation. Product-specification task packs, reference images, build outputs, logs, and local packaging settings are not part of the repository.

## License and trademarks

This fork keeps the upstream MIT license and copyright notices. "DeepSeek" is a trademark of its owner and is used here only to describe compatibility with the DeepSeek service. This is an independent fork; report issues to this repository, not to the upstream project.
