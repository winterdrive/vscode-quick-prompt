# Quick Prompt – AI 工作时，同步捕捉想法与排队任务

[![Visual Studio Marketplace Version](https://vsmarketplacebadges.dev/version-short/winterdrive.quick-prompt.svg)](https://marketplace.visualstudio.com/items?itemName=winterdrive.quick-prompt)
[![Open VSX Version](https://img.shields.io/open-vsx/v/winterdrive/quick-prompt)](https://open-vsx.org/extension/winterdrive/quick-prompt)
[![Open VSX Downloads](https://img.shields.io/open-vsx/dt/winterdrive/quick-prompt)](https://open-vsx.org/extension/winterdrive/quick-prompt)
[![AI-Ready Context](https://img.shields.io/badge/AI--Ready-LLMS.txt-blue?style=flat-square)](https://winterdrive.github.io/vscode-quick-prompt/llms.txt)
<!-- [![VS Marketplace Installs](https://vsmarketplacebadges.dev/installs-short/winterdrive.quick-prompt.svg)](https://marketplace.visualstudio.com/items?itemName=winterdrive.quick-prompt) -->
<!-- [![VS Marketplace Downloads](https://vsmarketplacebadges.dev/downloads-short/winterdrive.quick-prompt.svg)](https://marketplace.visualstudio.com/items?itemName=winterdrive.quick-prompt) -->

[繁體中文](./README.zh-TW.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [简体中文](./README.zh-CN.md) | [English](../README.md)

![Quick Prompt - AI 协作时的 IDE 内建便签纸与任务排队接口](./assets/hero_banner.png)

---

## 🚀 什么是 Quick Prompt？

**AI Agent 在执行任务的时候，你的大脑不会停下来。** Quick Prompt 是你的 **IDE 内建便签纸** — 随手记下下一步任务、暂存可重用代码、追踪剪贴板历史 — 不用切换到 Notepad++，不打断你的思维流。

它结合了**持久化代码库**与**剪贴板历史追踪**，让你*在 AI 工作时*产生的想法，在它完成的那一刻就能立即派上用场。

---

![功能亮点](./assets/feature_highlights.png)

---

## 🔌 v0.3.0 重大更新：AI Agent 深度整合 (MCP)

**全方位的 Model Context Protocol (MCP) 支持正式登场。** 彻底摆脱手动复制粘贴 — 让您的 AI 助手（Cursor, Copilot, Claude 等）通过原生工具直接管理您的提示词。

### 🛡️ 四层安全行动决策树 (Safety Decision Tree)

每一个生成的 Skill 都内置了防呆与安全逻辑，确保 AI 在执行时稳定可靠：

1. **Layer 0: 连线闸门 (Connection Gate)** — 自动通过 `list_prompts` 测试连线。若 MCP 断线，Agent 会立即触发 HALT 刹车并询问用户是否降级处理。
2. **Layer 1: 标准 MCP 工具** — 提供 14 个优化过的工具，涵盖 Prompt 的增删改查与版本历史。
3. **Layer 2: 安全验证** — 在执行敏感操作前进行二次逻辑检查，确保数据一致性。
4. **Layer 3: CLI 硬核后备 (Hard Fallback)** — 当 MCP server 无法使用时，Agent 可切换调用内置的 `qp.bundle.js` 脚本直接操作数据库。

### ⚙️ 多客户端一键设置

针对主流 AI 工具提供一键生成设置。执行指令：`Quick Prompt: Show MCP Config` 即可打开交互式面板。

| Cursor / Antigravity | GitHub Copilot / Cline | Kiro IDE / Claude Code |
| :------------------- | :--------------------- | :--------------------- |
| 支持 `${workspaceFolder}` 动态变量 | 绝对路径绑定 | 直接生成 JSON 配置块 |

---

## ✨ 核心特色

### 🔌 AI Agent 强大武装 (新功能!)

- **🔌 14 个 MCP 工具**：为 AI Agent 提供完整的 Prompt 管理工具箱。
- **🛡️ 行动决策树**：确保 Agent 只在连线安全且逻辑通顺时执行变更。
- **📦 CLI 后备脚本**：断线时的终极保险，内置于 generated skill 文件夹内。
- **⚙️ 交互式设置面板**：轻松完成各类 AI 工具的环境配置。

### 📚 提示词管理 (Prompt Management)

- **🤖 AI 智慧标题**：使用本地 AI 模型（SmolLM2 / Qwen3，可自选）自动生成语义化标题。
- **🎯 极速搜索**：按 `Alt+P` 搜索 Prompt，按 Enter 直接复制。
- **🚀 快速新增**：选取文字按 `Alt+Shift+S` 立即新增。
- **✏️ 原生编辑**：像编辑一般文件一样编辑 Prompt，完整支持 VSCode 功能。

### 🕒 版本控制 (Version Control)

- **🕒 线性历史**：每次保存自动创建新版本。
- **📌 里程碑**：标记稳定版本或重要草稿。
- **⚖️ 差异比对**：视觉化查看修改内容。

### 🔒 隐私保护 (Privacy Protection)

- **🔒 遮罩 Prompt**：右键点击任一 Prompt → `Mask Prompt`，敏感数据立即替换为 Token（`[EMAIL-1]`、`[API-KEY-1]`…）。
- **🔓 解除遮罩**：右键 → `Unmask Prompt` 即时还原原始内容。
- **🔑 OS 加密储存**：还原对照表存入 VS Code SecretStorage（OS Keychain），以系统加密形式持久保存，不以明文写入任何文件。

## 📸 操作截图 (AI 生成)

### 界面总览

![界面总览](./assets/bottom_panel_overview.png)

*真实的底部控制面板视图：剪贴板历史（左）与支持线性历史记录的 Prompt 列表（右）*

### 快速搜索功能

![快速搜索](./assets/quick_search_demo.png)

*集成式的 Quick Pick 接口，一键搜索你的暂存区与剪贴板历史*

## 🚀 快速开始

### 安装后首次使用

1. 在 VSCode 中打开任一项目文件夹
2. 扩展功能会自动在 `.vscode/prompts.json` 创建预设文件
3. 按 `Alt+P`（Mac 使用 `Opt+P`）开始使用

### 基本操作

#### 方法一：快速搜索（推荐）⚡

1. 按 `Alt+P` 打开搜索框
2. 输入关键字筛选 Prompt
3. 按 `Enter` 复制到剪贴板（自动增加使用次数）
4. 切换到任何地方（Copilot、Agent、浏览器等）按 `Ctrl+V` 粘贴

#### 方法二：侧边栏操作 📋

1. 点击活动栏的 Quick Prompt 图标（对话气泡）
2. **My Prompts** 区块：
    - 点击任一 Prompt 即可复制
    - 右键点击可上下移动
    - 行内按钮：复制、钉选、编辑、删除
3. **Clipboard History** 区块：
    - 点击即可复制
    - 点击钉选图标可转为永久 Prompt
    - 行内按钮：复制、钉选、编辑、删除

### 图标说明

- 🔥：热门（使用 >= 10 次）
- ⭐：常用（使用 >= 5 次）
- 📝：一般（使用 > 0 次）
- ⚪：未使用
- 📌：已钉选

## 📝 新增与编辑

### 新增 Prompt

#### 方法 1：从选取文字新增（最快）🚀

1. 在编辑器中选取一段文字
2. 右键选择「Quick Add Prompt (Selection)」（或按 `Alt+Shift+S`）
3. 完成！自动生成标题并保存

#### 方法 2：智慧新增模式 ⚡

1. 点击侧边栏标题栏的 **➕ 新增** 按钮
2. 在输入框中：
    - **自动模式**：直接粘贴内容，按 Enter（自动生成标题）
    - **手动模式**：使用 `标题::内容` 格式
3. 完成！

#### 方法 3：从剪贴板历史

1. 在 Clipboard History 找到该项目
2. 点击 **📌 钉选** 按钮
3. 自动转为永久 Prompt

### 编辑 Prompt

- 点击 **✏️ 编辑** 按钮打开原生编辑器
- 像编辑一般文件一样修改内容
- 按 `Ctrl+S` 保存
- 支持撤销/重做 (Undo/Redo)、自动保存、格式化文档

### 使用版本历史 (最新功能)

1. **查看历史**：在侧边栏展开任何 Prompt。
2. **比较**：点击任何历史版本打开 **Diff View**。
3. **还原**：右键点击版本并选择 **套用版本** 来还原。
4. **里程碑**：将重要版本标记为里程碑（如 "v1.0 正式版"）。

## 🔒 隐私保护 – 使用指南

在内容送往任何 AI 模型前，先遮罩敏感数据。

### 操作流程

1. 新增含敏感数据的 Prompt — 侧边栏显示**黄色盾牌**警示
2. 右键点击 → **`Mask Prompt`**
3. 敏感值被替换为 `[EMAIL-1]`、`[API-KEY-1]` 等 Token；Prompt 显示**绿色盾牌**
4. 复制或插入 Prompt — Agent 只会收到 Token，永远看不到原始值
5. 右键 → **`Unmask Prompt`** 即时还原

> **安全模型**：还原对照表（Token → 原始值）存入 VS Code **SecretStorage**（macOS Keychain / Windows Credential Manager），永远不写入 `prompts.json` 或任何磁盘文件。Unmask 仅限本机，切换电脑后无法还原已遮罩的 Prompt。

### 预设侦测规则

- Email 地址 → `[EMAIL-1]`
- 电话号码 → `[PHONE-1]`
- API 密钥（AWS、GitHub、OpenAI 等）→ `[API-KEY-1]`
- IP 位址 → `[IP-ADDRESS-1]`
- 私钥 / 证书 → `[PRIVATE-KEY-1]`
- 信用卡号 → `[CREDIT-CARD-1]` *(预设关闭)*

### 隐私相关设置

- `quickPrompt.privacy.enabled`：启用/停用所有隐私功能（预设：`true`）
- `quickPrompt.privacy.patterns.email`：遮罩 Email（预设：`true`）
- `quickPrompt.privacy.patterns.phone`：遮罩电话（预设：`true`）
- `quickPrompt.privacy.patterns.apiKeys`：遮罩 API 密钥（预设：`true`）
- `quickPrompt.privacy.patterns.ipAddress`：遮罩 IP 位址（预设：`true`）
- `quickPrompt.privacy.patterns.privateKey`：遮罩私钥（预设：`true`）
- `quickPrompt.privacy.patterns.creditCard`：遮罩信用卡号（预设：`false`）

---

## ⚙️ 设置

### AI 功能设置

- `quickPrompt.ai.enabled`: 启用/停用 AI 功能（预设：`true`）
- `quickPrompt.ai.autoGenerateTitle`: 自动生成标题（预设：`true`）

### 剪贴板设置

- `quickPrompt.clipboardHistory.enabled`: 启用/停用自动追踪（预设：`true`）
- `quickPrompt.clipboardHistory.maxItems`: 最大历史记录数量（预设：`20`）
- `quickPrompt.clipboardHistory.minLength`: 最小内容长度（预设：`10`）

### 文件位置

- **工作区模式**：`.vscode/prompts.json`（每个项目独立）
- **备用模式**：如果没有打开工作区，会使用扩展功能目录

### 快捷键

| 功能        | Windows/Linux | Mac           |
|-----------|---------------|---------------|
| 搜索 Prompt | `Alt+P`       | `Opt+P`       |
| 从选取新增     | `Alt+Shift+S` | `Opt+Shift+S` |

### 给自动化使用的 Command ID

Quick Prompt v0.5.1 将扩展功能命令统一到 `quickPrompt.*` namespace。Command Palette 显示名称与预设快捷键不变，但如果你有自定义 `keybindings.json`、macro extension、task，或外部 automation，请改用下列表格中的命令 ID。

| 动作 | Command ID |
|------|------------|
| 搜索 Prompt 与剪贴板历史 | `quickPrompt.search` |
| 新增 Prompt | `quickPrompt.addPrompt` |
| 以自定义标题新增 Prompt | `quickPrompt.addPromptWithTitle` |
| 从选取文字快速新增 | `quickPrompt.silentAdd` |
| 编辑 Prompt | `quickPrompt.editPrompt` |
| 重新命名 Prompt | `quickPrompt.renamePrompt` |
| 删除 Prompt | `quickPrompt.deletePrompt` |
| 钉选 / 取消钉选 | `quickPrompt.togglePin` |
| 显示 MCP 设置 | `quickPrompt.showMcpConfig` |
| 生成 Skill 文件 | `quickPrompt.generateSkill` |
| 测试 AI 连线 | `quickPrompt.testAIConnection` |

虚拟 Prompt 编辑器分页现在使用 `quickprompt:` URI scheme。既有 Prompt 数据与设置不会被改动，但先前由 VS Code session restore 还原的旧虚拟编辑器分页，或外部连到旧虚拟 URI 的链接，可能需要从 Quick Prompt 侧边栏重新打开。

## 💡 最佳实践

1. **等待时排队**：AI 开始跑长任务时，立刻打开 Quick Prompt，把接下来的想法记下来 — 别让灵感溜走
2. **随手捕捉**：看到值得留存的内容？选取后按 `Alt+Shift+S`，标题自动生成
3. **让剪贴板历史当安全网**：放心复制，最近 20 笔复制记录随时可捞回（可通过 `maxItems` 调整上限）
4. **钉选常用片段**：把一次性剪贴板项目一键升格为永久条目
5. **加入 Git**：提交 `.vscode/prompts.json`，让整个团队共享同一份可重用片段库

## 🤝 推荐搭配

### 🗂️ VirtualTabs

**降低 AI 协作的认知负荷。**

**Quick Prompt** 让你的思绪在 IDE 内保持整齐。搭配 **VirtualTabs** 让工作区也同样整齐。

- **Quick Prompt**：*AI 工作时*，捕捉你脑中正在想的事
- **VirtualTabs**：跨任何目录，整理哪些文件属于哪个任务

在 [**VS Code Marketplace**](https://marketplace.visualstudio.com/items?itemName=winterdrive.virtual-tabs) | [**Open VSX Registry**](https://open-vsx.org/extension/winterdrive/virtual-tabs) 取得 VirtualTabs

---

## ❤️ 支持项目

如果您觉得这个扩展功能对您有帮助，欢迎小额赞助支持开发！

<a href="https://ko-fi.com/Q5Q41SR5WO"><img src="https://storage.ko-fi.com/cdn/kofi2.png?v=3" height="36" alt="ko-fi" /></a>

## 📄 授权

MIT License

---

**别再让切换窗口吃掉你的灵感。** 🚀

*Made with ❤️ for developers who think faster than their agents run*
