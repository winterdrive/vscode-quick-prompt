## 6. 資料模型

### 6.1 儲存位置

POC 採用 workspace-scoped 檔案儲存：

```text
<workspace>/.edo_tensei/{hash}.json
```

這樣可確保使用者在 Cursor、Trae、VS Code 或其他基於 VS Code 的 IDE 中開啟同一專案時，都能看到相同 handoff 狀態。

### 6.2 Session Schema (Version 0.2.0)

```typescript
interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  thought?: string;      // 思考過程 (Reasoning/Planner response)
  toolCalls?: any[];     // 工具調用紀錄
  name?: string;         // 用於 tool role 的名稱
  timestamp?: string;    // ISO 8601
}

interface CapturedSession {
  version: "0.2.0";
  updatedAt: string;     // ISO 8601
  sourceIde: 'copilot' | 'cursor' | 'antigravity' | 'windsurf' | 'trae' | 'kiro';
  workspacePath?: string;
  sessionId?: string;
  messages: ChatMessage[];
  relatedFiles: string[];
  handoffPrompt: string;
  metadata?: {
    modelId?: string;
    modelProvider?: string;
    workflow?: string;
    [key: string]: any;
  };
}
```

### 6.3 欄位說明

- `version`: schema 版本 (目前為 0.2.0)
- `updatedAt`: 最後更新時間
- `sourceIde`: 來源 IDE 名稱
- `messages`: 結構化的對話歷史紀錄陣列
  - `role`: 角色 (user/assistant/tool)
  - `content`: 訊息文本
  - `thought`: 思考過程 (選填)
  - `toolCalls`: 工具調用紀錄 (選填)
- `relatedFiles`: 與本任務最相關的檔案
- `handoffPrompt`: 組裝好的交接 prompt（內含 history）
- `metadata`: 各 IDE 特有的元數據（如模型名稱、工作流 ID 等）

## 7. UI / UX 規格

### 7.1 Commands

POC 預計提供以下命令：

- `Edo Tensei: Seal Session`
- `Edo Tensei: Resurrect Session`
- `Edo Tensei: Open Session File`
- `Edo Tensei: Copy Handoff Prompt`

### 7.2 狀態列

- 使用 status bar 顯示 handoff 狀態
- 若有可用 session，顯示圖示與簡短提示
- tooltip 顯示摘要與最後更新時間

### 7.3 通知

- workspace 開啟且偵測到 session 檔時提示一次
- 成功封印或複製 handoff prompt 時顯示確認訊息

### 7.4 Interaction Pattern

第一版以最穩定的 VS Code 標準元件為主：

- `showInputBox`
- `showInformationMessage`
- `showQuickPick`
- status bar item
- 直接開啟 JSON 檔案

POC 不需要 webview，也不需要自定義複雜 UI。

### 7.5 接力觸發方式（Resurrection Trigger）

「復活」的最後一步是讓新 IDE 的 AI 接手。POC 需要定義如何將 handoff prompt 送入目標 IDE 的 Chat 輸入框。

#### 7.5.1 觸發方式矩陣

| 觾發方式 | 做法 | 穩定性 | 使用者步驟 | 適用 IDE |
|---------|------|--------|-----------|---------|
| **診斷注入（Diagnostic Injection）** | 將 prompt 包裝為虛假 Diagnostic，觸發 IDE 修復命令 | 中（版本敏感） | 0 步（全自動） | Cursor |
| **Chat Participant** | 建立 Edo Tensei Chat Participant，使用者 `@EdoTensei` 接手 | 高 | 1 步 | VS Code 家族（Copilot/Trae/Windsurf 等） |
| **Clipboard 粘貼** | 複製 prompt，使用者 Ctrl+V 粘貼後按 Enter | 高 | 2 步 | 所有 IDE，通用保底 |

> **研究發現**：根據 prompt-manager 原始碼，Cursor 支援透過 `composer.fixerrormessage` 命令將 Diagnostic 內容注入 Chat。這是目前已知唯一能真正「全自動」送入 Cursor Chat 的方式。

#### 7.5.2 各觾發方式詳解

**診斷注入（Cursor 專屬，全自動 0 步）**

這是目前研究發現最具創意且實際可行的 Cursor 專屬方法，基於 prompt-manager 的實作：

核心原理：

1. 將 handoff prompt 包裝成一個 `vscode.Diagnostic`（虛假錯誤）
2. 寫入當前編輯器的 Diagnostic Collection
3. 觸發 Cursor 的 `composer.fixerrormessage` 命令
4. Cursor 會將該 Diagnostic 的訊息當作「錯誤」並送入 Chat 處理
5. 清除 Diagnostic

實作方式（已驗證）：

```typescript
private readonly DIAGNOSTIC_COLLECTION_NAME = 'edo-tensei-cursor';

async function sendToCursorViaDiagnostic(prompt: string): Promise<boolean> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) { return false; }

  const fakeDiagCollection = vscode.languages.createDiagnosticCollection(
    this.DIAGNOSTIC_COLLECTION_NAME
  );

  const range = editor.selection.isEmpty
    ? editor.document.lineAt(editor.selection.active.line).range
    : editor.selection;

  const fakeDiagnostic = new vscode.Diagnostic(
    range,
    `\`\`\`\nAh, sorry, it wasn't an error. The user has submitted a prompt request. Here is the request, please implement it:\n\`\`\`\n\n${prompt}`,
    vscode.DiagnosticSeverity.Error
  );
  fakeDiagnostic.source = this.DIAGNOSTIC_COLLECTION_NAME;

  fakeDiagCollection.set(editor.document.uri, [fakeDiagnostic]);
  editor.selection = new vscode.Selection(range.start, range.start);

  await sleep(10);
  await vscode.commands.executeCommand('composer.fixerrormessage');

  fakeDiagCollection.delete(editor.document.uri);
  fakeDiagCollection.dispose();
  return true;
}
```

**注意**：此方法對 Cursor 版本敏感。若 `composer.fixerrormessage` 命令不存在或行為變更，自動降級至 Clipboard 粘貼。

**Chat Participant（VS Code 家族，全域可用）**

VS Code Extension API `vscode.chat` 允許建立自定義 Chat Participant。

實作方式：

```typescript
// 在 extension.ts 中建立 Edo Tensei Chat Participant
const edoParticipant = vscode.chat.createChatParticipant('edo-tensei', {
  handleRequest(request, context, progress, token) {
    const session = sessionHandoffService.readSession();
    if (!session) {
      return new vscode.ChatResponseMessage('沒有找到可接手的 session。');
    }
    const prompt = buildResurrectionPrompt(session);
    return { message: prompt };
  }
});
```

流程：

1. 使用者執行 `Edo Tensei: Resurrect Session`
2. Edo Tensei Chat Participant 開啟，自動帶入 handoff prompt
3. 使用者按 Enter 發送

優點：完全官方 API，穩定可靠，使用者只需 1 步。
缺點：仍是「繞過去」而非真正寫入 Copilot Chat；不同 IDE 的 Chat Participant 支援度不同。

**Clipboard 粘貼（全域保底）**

流程：

1. 執行 `Edo Tensei: Resurrect Session`
2. 系統自動將 handoff prompt 複製到剪貼簿
3. 顯示 notification：「接手指令已複製，請粘貼並發送」
4. 使用者切換到 Chat 輸入框，粘貼並發送

優點：完全可靠，不依賴任何 IDE API，所有平台通用。
缺點：需要 2 步手動操作（Ctrl+V, Enter）。

#### 7.5.3 V1 觸發策略：診斷注入 → Chat Participant → Clipboard 三層降級

V1 POC 採用三層降級策略，自動選擇可用方案：

```
Resurrect Session
    │
    ├─ 若為 Cursor → 嘗試診斷注入（0 步，全自動）
    │       ├─ 成功 → 完成
    │       └─ 失敗（命令不存在）→ 降級至 Clipboard
    │
    ├─ 若 IDE 支援 Chat Participant → 建立 Edo Tensei Chat Participant（1 步）
    │       └─ 使用者按 Enter 發送
    │
    └─ 否則 → Clipboard 粘貼（2 步，全域保底）
```

#### 7.5.4 三個具體使用者流程（V1）

**流程 A（Cursor IDE）**

1. 使用者按 `Edo Tensei: Resurrect Session`
2. 系統自動將 prompt 包裝為 Diagnostic
3. 觸發 `composer.fixerrormessage`
4. Cursor Chat 自動收到並開始接手（0 步，全自動）

**流程 B（VS Code Copilot / Trae / Windsurf）**

1. 使用者按 `Edo Tensei: Resurrect Session`
2. Edo Tensei Chat Participant 自動開啟，帶入 handoff prompt
3. 使用者按 Enter
4. Copilot/Trae接手任務（1 步）

**流程 C（其他 IDE / CLI 工具）**

1. 使用者按 `Edo Tensei: Resurrect Session`
2. Handoff prompt 自動複製到剪貼簿
3. 顯示 notification：「已在剪貼簿，請粘貼並發送」
4. 使用者切換到該 IDE，粘貼並發送（2 步）
