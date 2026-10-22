---
description: "智能体/聊天模式切换、仅桌面端的内嵌官方聊天界面，以及智能体撰写器旁的 DeepSeek API 余额；面向两种模式的用户与外壳维护者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-chat-mode

[English](README.md) | 中文

## 摘要

插件在侧栏加入紧凑的“智能体/聊天”选择器，提供整窗聊天模式（在桌面端拥有的原生视图中显示官方 DeepSeek 网站），并在智能体撰写器指标旁显示紧凑的 API 余额。智能体仍是默认模式，其会话、草稿、滚动位置与运行中的任务在往返聊天模式后保持原样。

## 目录

- [使用本包](#use-this-package)
- [实现说明](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## 使用本包

只有本插件挂载时才渲染模式行；未启用它的部署保持原有侧栏。记住的模式是设备本地枚举（`agent` 或 `chat`），存于 `dsh.chat-mode.v1`；未知或损坏的值、以及没有内嵌聊天能力的平台都回退到 `agent`。

聊天模式下，桌面应用把官方站点作为原生子视图挂载在 Harness 工具栏之下。工具栏提供可用的后退/前进、重新加载、本地账户选择以及“在浏览器中打开”。加载中、网络失败、页面崩溃与不可用状态都会给出带重试的明确提示，而不是空白矩形。普通 Web 构建无法安全持有其它来源的 cookie，因此展示外部浏览器说明与 `chat.deepseek.com` 链接。

本地账户只是设备元数据：用户命名的标签与不透明的持久 Electron 分区。“清除本地登录”销毁该分区的 cookie 与站点存储；“删除账户”还会移除元数据，并在下次启动重试被中断的清理，且不会影响网站上的对话或 Harness 智能体账户。

撰写器状态行新增 id `deepseek-balance`，由仅 Host 侧的 `deepseekBalance` Remote 提供数据。它显示主要币种总额、标记不可用账户，并展开各币种余额、刷新时间与手动刷新。缺少密钥或非官方端点时不显示胶囊，而不是显示 0。

<a id="understand-the-implementation"></a>
## 实现说明

浏览器半注册三个入口：`sidebar.mode`、id 为 `chat-mode` 的 `shell.overlay`，以及 id 为 `deepseek-balance` 的 `conversation.composer.dock`。聊天覆盖层用 `getBoundingClientRect` 测量视口并通过 `dshChat` 预加载桥发送矩形；主进程拥有 `WebContentsView`、按配置文件的分区、导航策略与销毁。渲染器从不读取远程页面内容、cookie 或凭据。

覆盖层不透明并覆盖整个框架，因此智能体列保持挂载，返回时状态不变。模式来源是进程内快照存储，只持久化枚举值。

<a id="further-exploration"></a>
## 延伸阅读

[桌面应用](../../../apps/desktop/README.zh.md)负责原生视图、分区与退出；[侧栏](../ui-sidebar/README.zh.md)声明模式行位置；[会话](../ui-conversation/README.zh.md)声明撰写器 dock；[deepseek-balance](../../llm/deepseek-balance/README.zh.md)负责 API 余额读取。

<a id="model-experience"></a>
## 模型体验

无。模式是界面状态，余额是只读 Host 能力；二者都不会进入模型提示、Session 日志或工具结果。

#### KV Cache 影响

不改变任何模型请求前缀。

## 已知限制

<a id="known-limitations-and-deferred-work"></a>

- 聊天模式仅限桌面端；Web 构建展示外部浏览器说明。
- 侧栏收起为窄轨时模式行隐藏；聊天覆盖层自带的选择器仍可退出。
- 下载、文件选择与 OAuth 弹窗遵循内嵌站点自身行为，Harness 不拦截其内容。
- 余额在挂载、窗口可见和手动刷新时读取，Host 不主动推送。
