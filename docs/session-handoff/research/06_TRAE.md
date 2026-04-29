# 逆向工程筆記：Trae IDE

## 1. 偵查過程 (Discovery)

Trae 是 ByteDance 推出的 AI IDE。雖然它同樣基於 VS Code，但在資料保護上做得最為徹底。

## 2. 關鍵路徑

- **核心路徑**：`%APPDATA%\Trae\ModularData\ai-agent\`
- **資料庫檔案**：`database.db` (伴隨有 `database.db-shm` 與 `database.db-wal`)

## 3. 資料格式

**SQLCipher / 加密 SQLite**。

- **檔案頭部 (Magic Bytes)**：`13fb5546...` (非標準 SQLite 的 `53514c69...`)。
- **加密特性**：嘗試使用標準 SQLite 驅動讀取會報錯 `File is not a database`。
- **內容掃描**：搜尋 `role`, `content`, `messages` 等關鍵字，結果均為 `false`，證實整個資料庫檔案均在加密狀態下。

## 4. 嘗試過的繞過方案

1. **日誌分析**：
   - 檢查了 `%APPDATA%\Trae\logs\`。
   - 雖然找到了 `Trae AI Code Client.log` 等檔案，但內容僅包含 JSON-RPC 的方法名 (如 `ckg.CancelIndex`)，並無對話內容明文。
2. **Sandbox 檢查**：
   - 在 `ai-agent\sandbox\` 下發現一些 JSON 檔案，但內容僅為環境權限配置 (如 `file_inherit_user`)。

## 5. 結論與降級策略

Trae 目前是六款 IDE 中唯一完全無法透過靜態檔案提取對話的。

- **原因**：ByteDance 出於隱私或競爭考量，對本地快取進行了強加密。
- **降級實作建議**：
  - 由於無法 100% 自動提取，將實作「手動匯入模式」。
  - 在 Edo Tensei UI 中，針對 Trae 提供專屬指引，教導使用者如何從 Trae Chat 界面複製內容並貼回 Edo Tensei。
