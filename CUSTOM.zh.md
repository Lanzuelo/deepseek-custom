# DeepSeek Custom

[English](CUSTOM.md) | 中文

DeepSeek Custom 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的**非官方分支**，为桌面应用增加了两种产品模式和 API 余额显示。它不属于 DeepSeek AI，也未获得其赞助或认可。上游项目与本分支均采用 MIT 许可证；见 [LICENSE](LICENSE)。

## 不同之处

- **侧栏中的“智能体 / 聊天”切换**。`智能体` 是保持不变的 Harness 工作区，仍是默认模式；`聊天` 在桌面窗口中打开官方 DeepSeek 网站。选择以设备本地枚举记忆，未知值回退到 `智能体`。
- **内嵌官方聊天**。`https://chat.deepseek.com` 运行在隔离的 Electron `WebContentsView` 中：启用沙箱、上下文隔离，没有 preload，没有 Node 集成，权限处理器全部拒绝，并且只允许这一个来源。其它链接在系统浏览器中打开。Harness 从不读取页面内容、cookie 或令牌，也不复刻私有 Web API。
- **本地聊天账户**。每个账户使用独立的持久浏览器分区；Harness 只保存用户命名的标签与不透明元数据。命令包括创建、选择、重命名、清除本地登录和删除。删除时会先记录分区再清理，因此被中断的清理会在下次启动时继续。密码与两步验证只留在官方页面内。
- **API 余额**。智能体撰写器显示 DeepSeek API 钱包，数据来自文档化的 `GET https://api.deepseek.com/user/balance`，由 Host 使用已配置的密钥读取。渲染器只收到字符串金额和状态，密钥不会离开 Host。自定义或代理端点会报告 `unsupported`，而不会被探测。
- **桌面身份**。打包应用名为 **DeepSeek Custom**，使用自己的应用 ID 和独立的 Electron `userData` 目录，可与官方 DeepSeek Harness 并存安装和运行。

现有智能体功能保持不变：会话、草稿、滚动位置、模型、推理强度、工具、审批、终端、侧栏与快捷键都能正常工作，往返聊天模式后也保持原样。

## 状态

这是一个用于手工测试的实验性分支。Windows x64 安装包未签名。macOS 支持来自同一份源码，但本分支尚未产出或测试 macOS 产物。本分支没有自动更新源。

## 在 Windows 上安装

1. 从仓库 Releases 下载 `DeepSeek-Custom-Setup-<version>.exe`。
2. 运行安装包。由于未签名，Windows SmartScreen 会提示未知发布者：选择 **更多信息 → 仍要运行**。
3. 安装按当前用户进行，与官方 DeepSeek Harness 相互独立。
4. 卸载请使用 **设置 → 应用 → DeepSeek Custom**，或安装目录中的卸载程序。

同一构建的 `win-unpacked` 目录是可移植版本，直接运行 `DeepSeek Custom.exe` 即可。

## 数据与清理

- 应用数据位于 `%APPDATA%\DeepSeek Custom`（Chromium 配置、聊天账户元数据）。
- 聊天账户分区位于该 Electron 配置中。在聊天账户菜单中删除账户会清除其 cookie 与站点存储。
- Harness 产品数据（`~/.dsh`）与已安装的 DeepSeek Harness 或 `dsh` CLI 共用。不要同时用同一配置运行两个桌面应用。如需隔离测试实例，请把 `DSH_HOME` 指向独立目录后再启动。
- 卸载应用不会删除 `%APPDATA%\DeepSeek Custom` 或 `~/.dsh`；如需完全重置，请手动删除。

## 配置余额

通过现有的 Harness 凭据流程（模型设置或欢迎页）配置 DeepSeek API 密钥。配置为官方端点后，余额胶囊会出现在智能体撰写器的状态行中。没有密钥或使用非官方 base URL 时不显示胶囊，而不是显示 0。

## 聊天模式说明

- 首次进入聊天会显示官方 DeepSeek 登录页。请在那里登录；Harness 永远看不到密码、验证码或一次性代码。
- 如果站点拒绝为你的账户或地区提供内嵌，请使用聊天工具栏中的 **在浏览器中打开**。
- 聊天工具栏提供后退、前进、重新加载、账户选择和外部打开。退出聊天会销毁原生视图；智能体工作区仍挂载在其下方。
- 聊天模式需要桌面应用。浏览器构建会显示说明与 `chat.deepseek.com` 链接，而不会尝试掌管其他来源的 cookie。

## 从源码构建

需要 Node.js `^22.19` 或 `>=24`、pnpm `11.28.5`，在 Windows 上还需要带 Windows SDK 的 Visual Studio C++ Build Tools（打包时会编译 NSIS 安装程序辅助组件）。

```sh
pnpm install
```

把 `apps/desktop/.env.windows.example` 复制为 `apps/desktop/.env.windows`，填入应用 ID 和打包脚本要求的更新策略来源，然后构建未签名安装包：

```sh
pnpm --filter @deepseek-ai/dsh-desktop run package:win:x64:unsigned
```

产物位于 `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/`。走完整发布脚本的打包会重新打包所有工作区包并重新下载内置运行时，耗时可达数十分钟；在 `.desktop-build` 已就绪时，重复构建可以直接调用 electron-builder。

两个可选环境变量可在不修改源码的情况下重命名本地构建：`DSH_DESKTOP_PRODUCT_NAME` 与 `DSH_DESKTOP_ARTIFACT_PREFIX`。

开发时运行 `pnpm run dev:desktop`。它需要 Electron 二进制（`pnpm --filter @deepseek-ai/dsh-desktop exec install-electron`），并在首次使用时准备内置运行时。

## 测试

新增界面的聚焦测试套件：

```sh
pnpm exec vitest run packages/client/ui-chat-mode packages/llm/deepseek-balance apps/desktop/tests/chat-view.spec.ts
pnpm exec vitest run apps/desktop/tests/main-startup.spec.ts apps/desktop/tests/preload-app.spec.ts
pnpm --filter @deepseek-ai/dsh-client-ui-chat-mode run bundle
```

## 仓库范围

本分支新增了 `packages/client/ui-chat-mode`、`packages/llm/deepseek-balance`、桌面聊天视图 `apps/desktop/src/chat-view.ts` 与 `chat-view-ipc.ts`，以及相应的注册、测试和文档。产品规格任务包、参考图片、构建产物、日志和本地打包配置不属于仓库内容。

## 许可证与商标

本分支保留上游 MIT 许可证与版权声明。“DeepSeek” 是其所有者的商标，此处仅用于说明与 DeepSeek 服务的兼容性。这是一个独立分支；请向本仓库反馈问题，而不是上游项目。
