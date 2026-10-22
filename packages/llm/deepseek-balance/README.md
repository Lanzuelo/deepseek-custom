---
description: "Host-only DeepSeek API wallet read projected over Typert Remote for the composer balance pill; for maintainers of the billing surface."
kind: "package-reference"
---

# @deepseek-ai/dsh-deepseek-balance

English | [中文](README.zh.md)

## Summary

The Host reads the documented DeepSeek API balance endpoint with the configured API key and returns a status-tagged, string-money view to the Client. The key, the request headers, and the raw response never leave this process.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## Use this package

The `deepseekBalance` Remote namespace exposes `read` and `refresh`. Both answer one of four outcomes: `ready` with `isAvailable`, `fetchedAt`, and `balances[]` (`currency`, `totalBalance`, `grantedBalance`, `toppedUpBalance` as decimal strings), `missing-key`, `unsupported`, or `error` with `auth`, `network`, `timeout`, `malformed`, or `storage`.

`read` reuses a ready reading for `cacheTtlMs` (default 60 seconds); `refresh` always queries. Concurrent calls share one request. Money keeps the provider's decimal string; the Client formats it without binary floating point.

The endpoint is the documented `https://api.deepseek.com/user/balance`. The plugin resolves the DeepSeek API-key route's configured `baseURL` and `apiKeyEnv` from the settings mirror and falls back to `baseUrl` / `apiKeyEnv` in its own configuration. Any origin other than the documented one reports `unsupported` instead of probing an unknown endpoint. A missing key reads the credentials service first and then the process environment.

```yaml
- id: deepseek-balance
  name: '@deepseek-ai/dsh-deepseek-balance'
  config:
    requestTimeoutMs: 10000
    cacheTtlMs: 60000
```

<a id="understand-the-implementation"></a>
## Understand the implementation

`fetchApiBalance` performs one `GET` with `Authorization: Bearer`, an abort deadline, and a redirect-free request, then validates `is_available` and every `balance_infos` row. Provider failures map to the status tag; a malformed body is never reported as a zero balance. `read` deduplicates concurrent callers and caches only `ready` outcomes.

<a id="further-exploration"></a>
## Further Exploration

[Credentials](../../credentials/credentials/README.md) owns key resolution; [LLM providers](../llm-deepseek-api-key/README.md) own the official route configuration; [API gateway](../../api/gateway/README.md) owns Remote transport.

<a id="model-experience"></a>
## Model Experience

None. The balance never enters a model prompt, Session log, or tool result.

#### KV Cache effect

No model request prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Only the documented official endpoint is queried. A custom or proxy provider reports `unsupported` until it gains its own confirmed configuration.
- Reads are not pushed: the Client polls on mount and on demand, so a balance change appears at the next read.
- The resolved `baseURL` comes from the settings mirror; a composition without that service uses the plugin's own configuration.
