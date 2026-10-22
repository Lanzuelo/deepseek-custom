---
description: "Agent/Chat mode switch, the Desktop-only embedded official chat surface, and the DeepSeek API balance reading in the agent composer; for users of the two modes and maintainers of the shell."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-chat-mode

English | [中文](README.zh.md)

## Summary

The plugin adds a compact Agent/Chat selector to the sidebar, a full-window Chat mode that shows the official DeepSeek site inside a Desktop-owned native view, and a compact API balance reading beside the agent composer's metrics. The agent mode stays the default and its session, draft, scroll, and running tasks survive a round trip through Chat.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## Use this package

The mode row renders only while this plugin is mounted; a deployment without it keeps the previous sidebar. The remembered mode is a device-local enum (`agent` or `chat`) under `dsh.chat-mode.v1`; an unknown or corrupt value and any platform without the embedded-chat capability fall back to `agent`.

In Chat mode, the Desktop application mounts the official site as a native child view beneath a Harness toolbar. The toolbar offers back and forward when history allows, reload, local account selection, and "Open in browser". Loading, network failure, a crashed page, and an unavailable surface each render an honest state with retry instead of an empty rectangle. A plain Web build cannot own another origin's cookies; it shows the external-browser explanation and a link to `chat.deepseek.com`.

Local accounts are device metadata only: a user-chosen label and an opaque persistent Electron partition. "Clear local sign-in" destroys that partition's cookies and site storage; "Delete account" additionally removes the metadata, retries an interrupted cleanup on the next launch, and never touches conversations stored on the site or the Harness agent account.

The composer status row gains one id, `deepseek-balance`, fed by the Host-only `deepseekBalance` Remote. It shows the primary currency total, marks an unavailable account, and opens the per-currency buckets, the refresh time, and a manual refresh. A missing key or a non-official endpoint renders no pill rather than a zero.

<a id="understand-the-implementation"></a>
## Understand the implementation

The browser half registers three entries: `sidebar.mode`, `shell.overlay` with id `chat-mode`, and `conversation.composer.dock` with id `deepseek-balance`. The Chat overlay measures its viewport with `getBoundingClientRect` and sends the rectangle through the `dshChat` preload bridge; the main process owns the `WebContentsView`, per-profile partitions, navigation policy, and destruction. The renderer never reads remote page content, cookies, or credentials.

The overlay is opaque and covers the frame while Chat is active, so the agent column stays mounted underneath and returns unchanged. The mode source is a process-local snapshot store; only the enum is persisted.

<a id="further-exploration"></a>
## Further Exploration

[Desktop application](../../../apps/desktop/README.md) owns the native view, partitions, and shutdown; [sidebar](../ui-sidebar/README.md) declares the mode row seat; [conversation](../ui-conversation/README.md) declares the composer dock; [deepseek-balance](../../llm/deepseek-balance/README.md) owns the API wallet read.

<a id="model-experience"></a>
## Model Experience

None. The mode is UI state and the balance is a read-only Host capability; neither enters a model prompt, Session log, or tool result.

#### KV Cache effect

No model request prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Chat mode is Desktop-only. The Web build shows the external-browser explanation.
- The mode row hides in the collapsed sidebar rail; the Chat overlay's own selector still leaves it.
- Downloads, file picking, and OAuth popups follow the embedded site's own behavior; Harness does not intercept their content.
- The balance is polled on mount, on window visibility, and by manual refresh; it is not pushed by the Host.
