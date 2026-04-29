# 逆向工程筆記：Antigravity (Self-Extraction)

## 1. 偵查過程 (Discovery)

作為自身的提取器，我們對檔案結構有完全的控制權。Antigravity 的對話記錄存放在 `brain` 目錄下的各 Conversation ID 資料夾中。

## 2. 關鍵路徑

- **根目錄**：`C:\Users\kwz50\.gemini\antigravity\brain\`
- **日誌路徑**：`<conversationId>\.system_generated\logs\overview.txt`

## 3. 資料格式

`overview.txt` 是一個 JSON Lines 檔案，記錄了 Agent 的每一項行為 (Tool Call, Response, User Input)。

### 格式範例

```json
{ "source": "USER_EXPLICIT", "content": "修復這個 Bug" }
{ "source": "MODEL", "type": "PLANNER_RESPONSE", "tool_calls": [ { "name": "reply", "arguments": { "reply": "好的..." } } ] }
```

## 4. 提取策略

1. **目錄定位**：從當前環境中獲取最新的 `conversationId`。
2. **行為過濾**：
   - 讀取 `overview.txt`。
   - `source === 'USER_EXPLICIT'`：提取為 `role: user`。
   - `source === 'MODEL'`：
     - 若 `type === 'PLANNER_RESPONSE'`，則從 `tool_calls` 中尋找 `reply` 參數作為回答。
     - 這種方式可以同時抓取到 Agent 的「思考內容」與「最終回覆」。
3. **轉換**：將 Antigravity 的複雜 JSON 行為轉換為 `ChatMessage` 陣列。

## 5. 優勢

- **精確度最高**：因為是原生格式，可以完整保留 Tool 調用順序與 Reason 過程。
- **即時性**：直接讀取正在進行的 Session。
