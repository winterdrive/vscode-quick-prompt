# 逆向工程筆記：Kiro IDE

## 1. 偵查過程 (Discovery)

Kiro 同樣是 VS Code 的衍生版本。初次研究時，我們誤以為它使用 `context` 欄位儲存對話，但測試結果為 0。經過對 `.chat` 檔案的完整檢視，發現其實體資料位於 `chat` 陣列中。

## 2. 關鍵路徑

- **核心儲存處**：`%APPDATA%\Kiro\User\globalStorage\kiro.kiroagent\`
- **專案映射**：與 Cursor 類似，使用 `workspaceStorage` 下的 `workspace.json` 來對應專案。
- **對話檔案**：`<projectId>\*.chat` (JSON 格式)

## 3. 資料格式

每個 `.chat` 檔案代表一個 Session。

### 格式範例

```json
{
  "chat": [
    {
      "role": "human",
      "content": "我要推廣 VirtualTabs"
    },
    {
      "role": "bot",
      "content": "好的，這裡有三個平台的推廣內容..."
    }
  ],
  "metadata": {
    "modelProvider": "qdev",
    "workflow": "act"
  }
}
```

## 4. 提取策略

1. **目錄遍歷**：遍歷 `kiro.kiroagent` 下的所有雜湊資料夾。
2. **檔案選取**：篩選出所有 `.chat` 檔案，按修改時間排序，選取最新一個。
3. **角色對應**：
   - `human` -> `user`
   - `bot` -> `assistant`
   - `tool` -> `tool`
4. **元數據提取**：從 `metadata` 欄位中提取 `modelProvider` 等資訊，存入 Edo Tensei 的 `metadata`。

## 5. 實作細節 (重要修正)

最初發現 Kiro 檔案中有一個 `context` 陣列，但裡面只存放了 System Prompt 與 File Tree。真正的對話紀錄在檔案末尾的 `chat` 陣列中。 extractor 已針對此結構進行修正。
