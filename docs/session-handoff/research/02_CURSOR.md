# 逆向工程筆記：Cursor IDE

## 1. 偵查過程 (Discovery)

Cursor 是 VS Code 的深度分支 (Fork)，其資料夾結構與 VS Code 高度相似，但將 `%APPDATA%\Code` 替換為 `%APPDATA%\Cursor`。

## 2. 關鍵路徑

- **工作區對應**：`%APPDATA%\Cursor\User\workspaceStorage\`
- **工作區索引**：每個子資料夾內的 `workspace.json` 記錄了該資料夾對應的原始路徑。
- **對話儲存處**：`<workspaceStorageId>\cursor.transcripts\*.jsonl`

## 3. 資料格式

檔案格式為 `.jsonl` (JSON Lines)，每行代表一次對話狀態的快照。

### 格式範例

```json
{
  "messages": [
    {
      "role": "user",
      "text": "How to fix this?"
    },
    {
      "role": "assistant",
      "text": "I can help with that..."
    }
  ],
  "context": { ... }
}
```

## 4. 提取策略

1. **工作區匹配**：
   - 遍歷 `workspaceStorage` 下的所有資料夾。
   - 讀取 `workspace.json` 並與當前 `workspacePath` 進行比對。
   - 匹配成功後，進入該目錄的 `cursor.transcripts` 子目錄。
2. **檔案選取**：
   - 尋找最新的 `.jsonl` 檔案。
3. **解析**：
   - 由於 `.jsonl` 的每一行都是完整的歷史記錄，我們只需解析「最後一行」。
   - 將 `role` 映射為 `user` / `assistant`，將 `text` 映射為 `content`。

## 5. 已知限制

- Cursor 的 Composer (Ctrl+I) 資料儲存位置可能不同，目前 Extractor 針對的是 Side Chat (Ctrl+L)。
- 歷史記錄可能會因為 Cursor 的垃圾回收機制而滾動刪除。
