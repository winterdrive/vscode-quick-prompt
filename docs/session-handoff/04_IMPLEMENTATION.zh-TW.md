# Session Handoff 實作

## 9. Phase 1 實作（60 分方案 + A層 IDE 整合）

### 9.1 優先實作目標

Phase 1 是產品的「保底基礎」，確保健行可用，同時整合 A層 IDE（Cline / Continue.dev / Claude Code）的自動抓取。

實作順序：

1. 先做核心封印 / 復活流程（與 IDE 無關）
2. 再整合可讀取的 IDE 本地對話來源（Extractor 架構）
3. 再補完 UI（Status Bar / Notification）

### 9.2 核心功能（所有 IDE 都能用）

- `Edo Tensei: Seal Session` — 手動封印目前 session
- `Edo Tensei: Resurrect Session` — 復活已封印 session
- `Edo Tensei: Copy Handoff Prompt` — 複製交接 prompt
- `.edo_tensei/{hash}.md` — workspace-scoped 儲存格式

此外也提供 Panel 操作：

- `Scan Project Sessions` — 掃描「同一個 workspace」的所有 session
- `Fetch ALL Historical Sessions` — 不限 workspace，抓取所有可讀取的歷史樣本
- `Export All Sessions to .edo_tensei` — 將 Panel 中目前列出的 sessions 批次匯出成 Markdown

### 9.3 已整合的 Extractors（可讀取的本地 Session）

目前已支援：

- Copilot（VS Code workspaceStorage / emptyWindowChatSessions）
- Cursor
- Antigravity
- Kiro
- Windsurf（Protobuf 二進位字串萃取，品質依內容而定）

規則：

- Panel 會以 `mtime` 作為「最後編輯時間」
- 點擊 Session item 會直接開啟一份 `untitled:` 草稿（覆蓋寫入，避免連點造成重複內容）
- 匯出時會依 `.edo_tensei/[IDE]/[project]/` 目錄分層

尚在研究中（已確認有樣本落地，但尚未整合進 Extractor）：

- Claude Code（`~/.claude/projects/.../*.jsonl`）
- Codex（`~/.codex/sessions/.../rollout-*.jsonl`）

### 9.4 60 分 Skill 引導（MCP Skill）

當自動抓取失敗或 IDE 為 B/C 層時，使用 Skill 引導 LLM 自我總結作為備案。

---

## 10. Handoff Prompt 模板

POC 需要將 session.json 組裝為可直接提供給新 AI 的自然語言 prompt。建議模板如下：

```text
你現在接手上一段 AI session，請先閱讀以下對話歷史紀錄：

---
{{history}}
---

相關檔案：
{{relatedFiles}}

請先用你的話總結目前理解（包含目前的目標、已嘗試的方法與下一步），再提出接手後的執行計畫。
```

## 10. 實作清單

### 10.1 需修改的現有檔案

- `package.json`
  - 新增 commands
  - 新增 command title / category
  - 可選：新增 keybindings

- `src/extension.ts`
  - 初始化 session handoff service
  - 註冊 watcher
  - 建立 status bar item
  - 註冊相關命令

- `src/commands.ts`
  - 新增 session handoff 命令處理流程
  - 或重構拆出 session 專屬命令模組

- `i18n/en.json`
- `i18n/zh-cn.json`
- `i18n/zh-tw.json`
  - 補齊新命令與提示訊息

- `.gitignore`
  - 決定是否忽略 `.edo_tensei/session.json`

### 10.2 建議新增檔案

- `src/core/SessionHandoffService.ts`
- `src/types/sessionHandoff.ts`
- 可選：`src/commands/sessionCommands.ts`

## 11. 模組責任

### 11.1 SessionHandoffService

預計提供以下能力：

- `getWorkspaceRoot()`
- `getSessionFileUri()`
- `ensureSessionDirectory()`
- `hasSession()`
- `readSession()`
- `writeSession()`
- `buildHandoffPrompt()`
- `getSessionSummary()`

### 11.2 Session Commands

預計包含以下 handler：

- `handleSealSession()`
- `handleResurrectSession()`
- `handleOpenSessionFile()`
- `handleCopyHandoffPrompt()`

## 12. 風險與限制

### 12.1 技術限制

- 無法保證所有 IDE 都暴露 chat API 給第三方 extension
- 無法保證可穩定存取 Copilot、Cursor 等私有 session storage

### 12.2 使用者體驗限制

- 第一版仍需要使用者主動封印或至少確認摘要
- 無法做到真正無感、全自動的原生 chat 注入

### 12.3 資料限制

- 第一版 session 內容應保持精簡，避免 JSON 過大或 prompt 過長
- 不儲存完整 transcript，以免造成維護與隱私成本升高

## 13. 里程碑

### M1：本地儲存與讀取

- 建立 session schema
- 可寫入 / 讀取 `.edo_tensei/session.json`

### M2：命令與交接 Prompt

- 完成 seal / resurrect / open / copy handoff prompt

### M3：自動偵測與提示

- 啟動時偵測 session 檔
- 顯示通知與 status bar 狀態

### M4：AI 輔助整理

- 若 AI 功能已啟用，將自由文字整理為結構化 session

### M5：進一步整合研究

- 評估特定 IDE 的 chat integration 可行性
- 視 API 條件決定是否支援更深的自動化流程

## 14. POC 結論

本 POC 的關鍵不是直接存取第三方 IDE 的私有 chat 歷史，而是驗證：

- AI 任務脈絡是否能被結構化保存
- 這份脈絡是否足以讓另一個 IDE 的 AI 快速接手
- 使用者是否願意用極少步驟完成 handoff

若以上三點成立，則表示此方向具備產品化價值，後續可再決定是否往更深的 IDE chat 整合演進。
