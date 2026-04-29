# AI Session 轉移 POC 規格

## 1. 目的

本文件定義 Quick Prompt 延伸為「AI chat session 轉移」能力的第一版 POC（Proof of Concept）規格，用於驗證以下核心假設：

1. 同一個專案在不同 IDE 間切換時，真正需要交接的不是程式碼，而是 AI 對話所累積的任務脈絡。
2. 即使無法直接讀取 GitHub Copilot、Cursor、Trae 等 IDE 的私有 chat 歷史，仍然可以透過 VS Code 擴充套件完成可用的 session handoff 流程。
3. 只要能做到「封印目前狀態」與「在另一個 IDE 快速復活並接手」，就足以驗證產品方向成立。

## 2. POC 範圍

### 2.1 本次要驗證的能力

- 將目前 AI 對話紀錄或任務狀態封裝為 session 檔案。
- 在另一個 IDE 開啟同一個 workspace 時偵測該 session 檔。
- 將 session 檔內容轉換為一段包含完整歷史的 handoff prompt。
- 讓使用者用最少步驟完成交接，實現「一鍵封印、一鍵接手」。

### 2.2 明確不在本次範圍內

- 不建立 MCP Server。
- 不啟動額外 local daemon 或桌面常駐程式。
- 不處理 git diff 同步。
- 不做雲端同步、跨機同步或多人協作同步。
- 不做 RAG、向量索引或知識庫同步。

## 3. 問題定義

在同一個專案資料夾中切換 IDE 時，程式碼、檔案樹、git 狀態本來就是共享的，因此並不需要額外同步。真正流失的是完整工作記憶的上下文。

POC 的核心不是「同步程式碼」，而是「轉移 AI 已建立的工作記憶」。
直接獲取完整文件，摘要或統整交由下一個 AI Agent 自行處理。

這些內容都不需要POC內試圖取得：

- 當前任務目標
- 已經做過的關鍵決策
- 試過但失敗的方法
- 接下來應該做什麼
- 使用者對修改風格或策略的偏好

## 4. 成功標準

POC 成功的條件如下：

1. 使用者可在 IDE A 執行一次封印操作，產生 session 檔案。
2. 使用者在 IDE B 開啟同一個專案時，擴充套件能偵測到可用 session。
3. 使用者可在 IDE B 直接看到摘要，並一鍵複製 handoff prompt。
4. 新的 AI 能根據 handoff prompt 理解目前任務、限制與下一步。
5. 全流程不需要使用者記憶 `/seal`、`/summon` 或 MCP 指令。

## 5. 使用者流程

### 5.1 IDE A：封印 Session

1. 使用者點擊按鈕觸發執行 `Edo Tensei: Seal Session`
2. 擴充套件抓取目前對話紀錄 (Transcript) 或工作區狀態 (Git Diff)
3. 擴充套件將資料寫入 workspace 內的 session 檔
4. 顯示成功提示（一鍵完成，無需輸入）

### 5.2 IDE B：復活 Session

1. 使用者開啟相同 workspace
2. 擴充套件偵測到 session 檔
3. 顯示通知：偵測到可繼承 session
4. 使用者執行 `Edo Tensei: Resurrect Session`
5. 擴充套件顯示摘要並提供：
   - 複製 handoff prompt
   - 開啟 session 檔
   - 取消
