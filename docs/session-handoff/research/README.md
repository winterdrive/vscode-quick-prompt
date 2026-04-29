# 逆向工程研究索引 (Reverse Engineering Research Index)

本目錄記錄了對六大核心 AI IDE 進行對話紀錄擷取 (Chat History Extraction) 的研究過程、發現與實作細節。

## 核心目標

達成「100% 可用性」的自動抓取能力，減少使用者在 Session Handoff 過程中的手動操作。

## 研究筆記清單

### 1. [VS Code Copilot](./01_COPILOT.md)

- **狀態**：✅ 成功
- **關鍵**：解析 `emptyWindowChatSessions` 下的 JSON/JSONL。

### 2. [Cursor IDE](./02_CURSOR.md)

- **狀態**：✅ 成功
- **關鍵**：映射 `workspaceStorage` 並讀取 `cursor.transcripts`。

### 3. [Antigravity](./03_ANTIGRAVITY.md)

- **狀態**：✅ 成功
- **關鍵**：解析原生行為日誌 `overview.txt` 中的 `PLANNER_RESPONSE`。

### 4. [Kiro IDE](./04_KIRO.md)

- **狀態**：✅ 成功
- **關鍵**：修正讀取邏輯，從 `.chat` 檔案的 `chat` 陣列中提取。

### 5. [Windsurf (Codeium)](./05_WINDSURF.md)

- **狀態**：⚠️ 部分成功
- **關鍵**：應對 Protobuf 二進位格式，實作語意密度過濾的萃取器。

### 6. [Trae (ByteDance)](./06_TRAE.md)

- **狀態**：❌ 阻礙
- **關鍵**：面對 SQLCipher 強加密資料庫，確認無法直接讀取，建議手動降級。

---
*最後更新日期：2026-04-25*
