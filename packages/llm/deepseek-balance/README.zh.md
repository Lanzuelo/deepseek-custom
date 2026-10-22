---
description: "仅 Host 侧读取 DeepSeek API 余额并通过 Typert Remote 投影给撰写器余额指示器；面向账单界面的维护者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-deepseek-balance

[English](README.md) | 中文

## 摘要

Host 使用已配置的 API 密钥读取官方 DeepSeek API 余额端点，并把带状态标记、以字符串表示金额的视图返回给客户端。密钥、请求头和原始响应都不会离开该进程。

## 目录

- [使用本包](#use-this-package)
- [实现说明](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## 使用本包

`deepseekBalance` Remote 命名空间提供 `read` 与 `refresh`。结果有四种：`ready`（含 `isAvailable`、`fetchedAt` 以及以十进制字符串表示的 `balances[]`）、`missing-key`、`unsupported`，或带 `auth`、`network`、`timeout`、`malformed`、`storage` 的 `error`。

`read` 在 `cacheTtlMs`（默认 60 秒）内复用已成功的读取；`refresh` 总是重新请求，并发调用共享同一请求。金额保留提供方给出的十进制字符串，客户端格式化时不经过二进制浮点。

端点固定为文档化的 `https://api.deepseek.com/user/balance`。插件从设置镜像解析 DeepSeek API 密钥路由的 `baseURL` 与 `apiKeyEnv`，否则使用自身配置。任何其它来源都报告 `unsupported`，不会探测未知端点。

```yaml
- id: deepseek-balance
  name: '@deepseek-ai/dsh-deepseek-balance'
  config:
    requestTimeoutMs: 10000
    cacheTtlMs: 60000
```

<a id="understand-the-implementation"></a>
## 实现说明

`fetchApiBalance` 发送一次带 `Authorization: Bearer`、超时中止且不跟随重定向的 `GET`，随后校验 `is_available` 与每个 `balance_infos` 行。提供方失败映射为状态标记；格式错误的响应绝不会表现为零余额。

<a id="further-exploration"></a>
## 延伸阅读

[凭据](../../credentials/credentials/README.zh.md)负责密钥解析；[LLM 提供方](../llm-deepseek-api-key/README.zh.md)负责官方路由配置；[API 网关](../../api/gateway/README.zh.md)负责 Remote 传输。

<a id="model-experience"></a>
## 模型体验

无。余额不会进入模型提示、Session 日志或工具结果。

#### KV Cache 影响

不改变任何模型请求前缀。

## 已知限制

<a id="known-limitations-and-deferred-work"></a>

- 仅查询文档化的官方端点；自定义或代理提供方在获得单独确认的配置前报告 `unsupported`。
- 读取不是推送式的：客户端在挂载和手动刷新时读取。
- 解析出的 `baseURL` 来自设置镜像；没有该服务的组合使用插件自身配置。
