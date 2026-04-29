# IDE Chat Storage 逆向工程研究

## 8. Phase 2 研究計畫：IDE Chat Storage 逆向工程

### 8.1 目標

研究從以下 IDE 的本地儲存中自動讀取 Chat History 的方法，建立 Edo Tensei 的「100 分」自動抓取能力：

IDE|商業屬性|備註
---|---|---
GitHub Copilot (VS Code 內建)|商業|微軟產品，Chat Storage 私有
Cursor|商業|基於 VS Code，Chat Storage 私有
Antigravity|商業|基於 VS Code，Chat Storage 私有
Windsurf|商業|Codeium 子品牌，架構近似 VS Code
Trae|商業|阿里巴巴，基於 VS Code
Claude Code|開源 (Anthropic)|CLI 工具，chat history 在本地
Cline|開源|VS Code Extension（需實測落地位置；本機 `~/.cline` 未發現 chat transcript）
Continue.dev|開源|VS Code Extension，chat history 在本地 JSON
Codex|開源 (OpenAI)|VS Code 外掛/CLI，rollout JSONL 在本地

### 8.2 IDE 分類框架

根據技術可行性与商業属性，分為三層：

層級|IDE|技術難度|原因
---|---|---|---
**A層（開源，已確認可行）**|Cline、Continue.dev、Claude Code|極低|開源專案，Chat History 就是本地 Markdown/JSON，格式已知
**B層（商業，但有已知路徑）**|Copilot、Trae、Windsurf|中|基於 VS Code，Chat Storage 在 `%APPDATA%/Code/` 下，路徑可探測
**C層（商業，私有格式）**|Cursor、Antigravity|高|閉源，路徑與格式均未知，可能加密

### 8.3 A層 IDE：已知可行的 Chat Storage

#### Cline

本機環境觀察（2026-04-26）：

```text
~/.cline/data/
  globalState.json
  secrets.json
  workspaces/<hash>/workspaceState.json
```

目前未在 `~/.cline` 下找到可直接解析的對話 transcript（例如 `chat_history*.md`）。

結論：

- 需改以「路徑探測 + 樣本蒐集」方式確認 Cline 真正的對話落地位置。
- 在未確認前，Cline 不列入「已確認可行」清單。

#### Continue.dev

Chat History 儲存位置：

```text
~/.continue/chat_history.json
~/.continue/history.json
```

格式：JSON，結構已知

```json
{
  "sessions": [{
    "id": "abc123",
    "messages": [
      { "role": "user", "content": "..." },
      { "role": "assistant", "content": "..." }
    ],
    "createdAt": "2026-04-24T14:30:00Z"
  }]
}
```

Extension 實作方式：

1. 讀取 `~/.continue/history.json`
2. 取最新 session 的 messages
3. 轉換為 `.edo_tensei/{hash}.md`

#### Claude Code

Chat History 儲存位置：

```text
~/.claude/projects/{normalized-workspace-path}/{session-id}.jsonl
```

格式：JSONL（每行一個事件），可包含 `user/assistant` 訊息、`thinking`、tool 使用、檔案快照等。

Extension 實作方式：

1. 讀取 `~/.claude/projects/` 下所有專案資料夾
2. 對每個 `{session-id}.jsonl` 解析出訊息序列（`type: user|assistant`）
3. 以 `.jsonl` 檔案 `mtime` 作為最後編輯時間
4. 轉換為統一 `CapturedSession`

#### Codex

Chat History 儲存位置：

```text
~/.codex/session_index.jsonl
~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
```

格式：JSONL（事件流），常見事件：

- `type: session_meta`（含 `id`, `cwd`, `originator`, `model_provider`...）
- `type: response_item`（含 user/developer/assistant 訊息與工具調用）
- `type: turn_context`（含 sandbox/環境資訊）

建議讀取策略：

1. 優先從 `session_index.jsonl` 列舉 session id 與更新時間
2. 掃描 `~/.codex/sessions/` 取出對應 `rollout-*.jsonl`
3. 以 `rollout` 檔案 `mtime` 作為最後編輯時間
4. 萃取可呈現的訊息（`role` + `content`）

### 8.4 B層 IDE：需掃描探測的 Chat Storage

#### Copilot (VS Code 內建)

已知資訊：

- Chat history 存在 `%APPDATA%/Code/User/globalStorage/` 下的某處
- 可能路徑候選：

  ```text
  %APPDATA%/Code/User/globalStorage/showeditingtelemetry.github-copilot/chat/
  %APPDATA%/Code/User/globalStorage/github.copilot/chat/
  %APPDATA%/Code/User/globalStorage/*copilot*/chat/
  ```

- 底層可能是 SQLite 或 JSON，格式完全私有

研究切入點：

```typescript
async function probeCopilotStorage(): Promise<{ path: string; type: 'sqlite' | 'json' } | null> {
  const globalStorageBase = path.join(process.env.APPDATA || '', 'Code', 'User', 'globalStorage');
  const entries = await fs.readdir(globalStorageBase, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name.toLowerCase();
    if (!name.includes('copilot') && !name.includes('github')) continue;

    // 嘗試 chat 目錄
    const chatDir = path.join(globalStorageBase, entry.name, 'chat');
    if (await exists(chatDir)) return { path: chatDir, type: 'json' };

    // 嘗試 .db 檔案
    const dbPath = path.join(globalStorageBase, entry.name, 'chat.db');
    if (await exists(dbPath)) return { path: dbPath, type: 'sqlite' };
  }
  return null;
}
```

找到之後：用 `sql.js`（瀏覽器可用 SQLite）在 Extension 端嘗試開啟 `.db` 檔，列舉所有 table 並觀察 schema。

#### Windsurf

已知資訊：

- Windsurf 是 Codeium 的產品，基於 VS Code 衍生
- Chat history 可能存在 `%APPDATA%/Windsurf/` 或 `%APPDATA%/Code/User/globalStorage/` 下
- 可能與 Copilot 路徑重疊（因為同是 VS Code 家族）

研究切入點：

```typescript
async function probeWindsurfStorage(): Promise<string | null> {
  const candidates = [
    path.join(process.env.APPDATA || '', 'Windsurf'),
    path.join(process.env.APPDATA || '', 'Code', 'User', 'globalStorage'),
  ];

  for (const base of candidates) {
    if (!await exists(base)) continue;
    const entries = await fs.readdir(base, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.toLowerCase().includes('windsurf')) {
        return path.join(base, entry.name);
      }
    }
  }
  return null;
}
```

#### Trae

已知資訊：

- Trae 為阿里巴巴產品，基於 VS Code
- Chat history 可能存在 `%APPDATA%/Trae/` 或 `%APPDATA%/Code/User/globalStorage/` 下
- 中國大陸產品，路徑命名可能用拼音或中文

研究切入點：

```typescript
async function probeTraeStorage(): Promise<string | null> {
  const candidates = [
    path.join(process.env.APPDATA || '', 'Trae'),
    path.join(process.env.APPDATA || '', 'Code', 'User', 'globalStorage'),
    // 中國大陸路徑
    path.join(process.env.APPDATA || '', 'trae'),
  ];

  for (const base of candidates) {
    if (!await exists(base)) continue;
    const entries = await fs.readdir(base, { withFileTypes: true });
    for (const entry of entries) {
      const name = entry.name.toLowerCase();
      if (name.includes('trae')) {
        return path.join(base, entry.name);
      }
    }
  }
  return null;
}
```

### 8.5 C層 IDE：需深度逆向的 Chat Storage

#### Cursor

已知資訊：

- Cursor 是獨立 Electron app，不走標準 VS Code 發布流程
- 數據存在 `%APPDATA%/Cursor/` 下（不等於標準 VS Code 路徑）
- Chat 可能存於 `Cursor/chat/` 或類似子目錄
- **可能使用 Electron safeStorage 加密**，無法直接讀取純文字

研究切入點：

```typescript
async function probeCursorStorage(): Promise<string[] | null> {
  const candidates = [
    path.join(process.env.APPDATA || '', 'Cursor'),
    path.join(process.env.LOCALAPPDATA || '', 'Cursor'),
  ];

  const results: string[] = [];

  for (const base of candidates) {
    if (!await exists(base)) continue;
    // 掃描所有 subdir，找 chat / storage / db 相關
    const scan = async (dir: string, depth = 0) => {
      if (depth > 3) return;
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        const name = entry.name.toLowerCase();
        if (name.includes('chat') || name.includes('storage') || name.includes('db') || name.endsWith('.db')) {
          results.push(full);
        }
        if (entry.isDirectory()) await scan(full, depth + 1);
      }
    };
    await scan(base);
  }
  return results.length > 0 ? results : null;
}
```

**警告**：即使找到 `.db` 檔，若 Cursor 使用 Electron `safeStorage` 加密，SQLite 內容也會是密文。這種情況下只能走 60 分方案。

#### Antigravity

已知資訊：

- Antigravity 為中國大陸產品，基於 VS Code 定制
- 路徑可能類似 `%APPDATA%/Antigravity/` 或標準 VS Code globalStorage
- Chat 格式完全未知

研究切入點：

```typescript
async function probeAntigravityStorage(): Promise<string | null> {
  const candidates = [
    path.join(process.env.APPDATA || '', 'Antigravity'),
    path.join(process.env.APPDATA || '', 'antigravity'),
    path.join(process.env.APPDATA || '', 'Code', 'User', 'globalStorage'),
  ];

  for (const base of candidates) {
    if (!await exists(base)) continue;
    const entries = await fs.readdir(base, { withFileTypes: true });
    for (const entry of entries) {
      const name = entry.name.toLowerCase();
      if (name.includes('antigravity') || name.includes('gravity')) {
        return path.join(base, entry.name);
      }
    }
  }
  return null;
}
```

### 8.6 通用研究流程

每個 IDE 的研究都遵循以下標準 Sprint：

```text
Step 1: 路徑探測
  → 用 candidate paths + 掃描 script 找可疑檔案/目錄

Step 2: 格式識別
  → 嘗試區分 .json / .db(sqlite) / .md 三種格式
  → .json 直接讀取
  → .db 用 sql.js 在記憶體中開啟，列舉 table schema

Step 3: Schema 分析
  → 觀察 table/structure，找出 messages / sessions / history 相關欄位
  → 確認 role (user/assistant) 與 content 欄位

Step 4: 讀取封裝
  → 寫出該 IDE 的 chatHistoryReader.ts
  → 輸出統一的 CapturedSession 格式

Step 5: 結論
  → ✅ 成功讀取 → 整合進 Phase 1 的 Seal 流程
  → ⚠️ 找到路徑但格式加密或混沌 → 降級該 IDE 至 60 分方案
  → ❌ 找不到任何可疑路徑 → 該 IDE 僅支援 60 分方案
```

### 8.7 通用輸出格式（CapturedSession）

所有 IDE 的讀取結果統一轉換為：

```typescript
interface CapturedSession {
  sourceIde: 'copilot' | 'cursor' | 'antigravity' | 'windsurf' | 'trae' | 'kiro';
  capturedAt: string;             // ISO timestamp
  sessionId?: string;             // 若有 ID
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp?: string;
  }>;
  workspaceHash?: string;         // 若能關聯到特定 workspace
  rawPath: string;                // 來源檔案路徑（用於偵錯）
  readStatus: 'success' | 'encrypted' | 'not_found' | 'unknown_format';
}
```

### 8.8 研究交付物

每個 IDE 研究完成後，交付：

1. `src/research/chatStorageLocator.ts` — 各 IDE 候選路徑 + 掃描邏輯
2. `src/research/chatHistoryReader.ts` — 統一介面 + 各 IDE 專屬 parser
3. `docs/RESEARCH_{IDE}.md` — 研究結論（路徑、格式、可行性評估）
4. SPEC 更新 — 該 IDE 的分層歸屬（A/B/C）可能因為研究結論調整

### 8.9 分層結論預期

| IDE | 預期分層 | 不確定性 |
|-----|---------|---------|
| Cline | A層（確定可行） | 無 |
| Continue.dev | A層（確定可行） | 無 |
| Claude Code | A層（確定可行） | 無 |
| Copilot | B層 | 加密可能性 |
| Windsurf | B層 | 路徑命名未知 |
| Trae | B層 | 中國大陸路徑可能特殊 |
| Cursor | C層（高風險） | 可能整體無法讀取 |
| Antigravity | C層（高風險） | 可能整體無法讀取 |

**Phase 2 的最終結論**：根據研究結果更新 SPEC，分層歸屬可能因為研究結論改變。若 C層 IDE 全軍覆沒，產品仍以 A層 + B層 IDE 的自動抓取 + 60 分方案支撐核心價值。

---

## 9. 逆向工程成果 (2026-04-25 更新)

經過實地的偵查與程式碼驗證，我們已經完成了六款核心 IDE 的逆向工程分析。以下是具體的發現與實作細節：

### 9.1 研究成果概覽

IDE|狀態|核心發現|詳細記錄
:---|:---|:---|:---
**Copilot**|✅ 成功|位於 `emptyWindowChatSessions` 的 JSON/JSONL 檔案|[詳細筆記](./research/01_COPILOT.md)
**Cursor**|✅ 成功|位於 `workspaceStorage` 的 `cursor.transcripts`|[詳細筆記](./research/02_CURSOR.md)
**Antigravity**|⚠️ 部分（Preview-only）|`overview.txt` 每筆訊息最多約 900 chars，超出部分雲端截斷|[詳細筆記](./research/03_ANTIGRAVITY.md)
**Kiro**|✅ 成功|位於 `kiro.kiroagent` 的 `.chat` JSON|[詳細筆記](./research/04_KIRO.md)
**Windsurf**|⚠️ 部分|Protobuf 二進位萃取，受限於編碼混亂|[詳細筆記](./research/05_WINDSURF.md)
**Trae**|❌ 阻礙|`database.db` 使用 SQLCipher 強加密|[詳細筆記](./research/06_TRAE.md)

### 9.2 關鍵技術發現

1. **結構化資料優先**：
   - Kiro 與 Antigravity 提供了豐富的元數據（如模型名稱、思考過程），這促使我們將 Edo Tensei 的資料模型從純文字升級為結構化陣列 (v0.2.0)。

2. **二進位萃取挑戰**：
   - Windsurf 的 Protobuf 格式雖然包含對話內容，但夾雜大量二進位控制字元。我們開發了具備語意密度分析的萃取器來過濾雜訊。

3. **加密壁壘**：
   - Trae (ByteDance) 是目前唯一對本地快取進行強加密的 IDE。這意味著「自動抓取」在該 IDE 上無法達成 100% 覆蓋，必須實作「手動匯入」作為保底。

### 9.3 實作清單

- [x] 定義 `IChatExtractor` 介面
- [x] 實作 `CopilotExtractor`, `CursorExtractor`, `AntigravityExtractor`
- [x] 修正並完成 `KiroExtractor` (支援 `chat` 陣列)
- [x] 實作 `WindsurfExtractor` (二進位萃取版)
- [x] 完成六大 IDE 逆向過程文檔化
- [x] 實作 `ClaudeExtractor`（`~/.claude/projects/**/*.jsonl`）
- [x] 實作 `CodexExtractor`（`~/.codex/sessions/**/rollout-*.jsonl`）

### 9.4 Antigravity overview.txt 的架構限制（2026-04-27 實測）

#### 本地落地位置

```text
~\.gemini\antigravity\brain\{uuid}\.system_generated\logs\overview.txt
```

#### 問題確認：preview-only 格式

實測後確認 `overview.txt` 並**不是完整的對話記錄**，而是一個 **preview-only 日誌**：

- 每筆訊息的 `content` 欄位最多保留約 **900 chars**
- 超出的部分在**記錄當下**就被截斷，並加上 `<truncated N bytes>` 標記
- 截斷在**雲端傳回本地時**就已發生，並非「資料存在別處等待載入」
- 這是 Antigravity 日誌格式的**設計行為**，不是解析錯誤

#### 截斷量實測數據（取自 1fd8ad03 session）

| 訊息類型 | 保留 chars | 截斷 bytes |
|---------|-----------|----------|
| USER_EXPLICIT/USER_INPUT | ~900 | 970 |
| MODEL/PLANNER_RESPONSE | ~433 | 993 |
| USER_EXPLICIT/CODE_ACTION | ~510 | 1477 |
| USER_EXPLICIT/CODE_ACTION | ~385 | 9431 |

#### 本地完整資料是否存在？

掃描全部 `brain/{uuid}/` 子目錄後確認：

- 每個 brain 目錄只有 `overview.txt` + 使用者手動儲存的 artifact（`.md`、`.json`）
- **沒有第二個完整 transcript 檔案**
- 完整對話存於 Antigravity 雲端，本地不落地

#### 目前實作策略

`AntigravityExtractor` 目前解析 `overview.txt`，我們刻意**保留** `<truncated N bytes>` 標記而不將其過濾，藉此清楚向使用者呈現資料並不完整的事實，避免隱藏問題。

這已是**本地能讀取的最佳方案**。

#### 未來改善方向（待評估）

若 Antigravity 未來開放 API 或本地 export 功能：

1. **API 方案**：呼叫 Antigravity 雲端 API 取得完整 transcript（需 token/auth）
2. **Export 方案**：若 Antigravity 新增「Export conversation」功能，讀取匯出檔案
3. **目前 overview.txt 解析保留**：作為無 API 情況下的 partial fallback
