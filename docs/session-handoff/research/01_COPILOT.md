# 逆向工程筆記：VS Code Copilot Chat

## 1. 偵查過程 (Discovery)

Copilot Chat 作為 VS Code 的擴充功能，其資料儲存通常位於 `globalStorage` 中。我們在 `github.copilot-chat` 目錄下尋找與對話相關的關鍵字。

## 2. 關鍵路徑

- **核心目錄**：`%APPDATA%\Code\User\globalStorage\github.copilot-chat`
- **Session 儲存處**：`emptyWindowChatSessions` (此目錄存放了非特定工作區或已過期的對話)

## 3. 資料格式

檔案後綴為 `.json` 或 `.jsonl`。

### 格式範例 (.json)

```json
{
  "messages": [
    {
      "role": "user",
      "content": "Hello"
    },
    {
      "role": "assistant",
      "content": "Hi there!"
    }
  ]
}
```

## 4. 提取策略

1. 遍歷 `emptyWindowChatSessions` 目錄下的所有檔案。
2. 根據檔案修改時間 (`mtime`) 進行排序，選取最新的一個。
3. 支援兩種讀取方式：
   - 如果是 `.jsonl`：按行解析 JSON 物件。
   - 如果是 `.json`：直接解析為物件。
4. 將 `role` 與 `content` 映射到 Edo Tensei 的標準模型。

## 5. 已知限制

- 部分舊版 Copilot 可能將資料存放在 `state.vscdb` (SQLite) 中，但最新版 (v1.x) 傾向於使用獨立檔案。
- 每個工作區的特定對話可能分散在 `workspaceStorage` 中，POC 階段優先抓取全域快取。
