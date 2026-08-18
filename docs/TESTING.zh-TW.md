# 測試指南(Quick Prompt)

繁體中文 | [English](./TESTING.md)

這是本 repo **自動化**測試套件目前維護中的參考文件,取代 `docs/specs/` 底下較舊的手動測試清單
(`TESTING_GUIDE.md`、`MCP_CRUD_TEST_CASES.md`、`MCP_E2E_TESTING_GUIDE.md`、
`PRIVACY_TEST_GUIDE.md`、`20260408_manual_test.md`)。那些文件描述的是 v0.3.0 時代的功能組合
(例如互動式的 Privacy Dictionary UI),現在的擴充套件裡已經不存在——字典功能在 v2 就被移除,
改成透過設定檔的自訂規則(見 `src/privacy/maskingEngine.ts`)。那些舊文件僅供歷史參考,
不要拿來判斷現況的行為或涵蓋範圍。

如果你新增、重新命名或移除測試檔案,請在同一個 PR 裡更新這份文件。

## 如何執行測試

| 套件 | 指令 | 涵蓋範圍 |
|---|---|---|
| Root 單元測試 | `npm test` | 針對擴充套件主體程式碼的純 Node/Jest 測試,透過 `src/test/__mocks__/vscode.ts` 模擬 `vscode` 模組 |
| mcp-server 單元測試 | `cd mcp-server && npm test` | 獨立的 Jest 設定(`mcp-server/jest.config.cjs`),因為 MCP server 套件的模組/tsconfig 設定跟 root 不同,無法共用 root 的 ts-jest 設定 |
| UI / E2E 測試 | `npm run test:ui` | 用真的 VS Code + Selenium(`vscode-extension-tester`)完整驅動打包好的擴充套件 |

**UI 測試需要一個真的、看得見的 VS Code 視窗,而且要跑好幾分鐘。**
應該由人在自己的機器上執行,不應該由 AI agent 在沙盒環境裡執行——原因見下方「已知限制」。

mcp-server 這個套件**不屬於** root 的 `npm test` 執行範圍(它的 `src/test/` 檔案雖然目前
剛好也符合 root Jest 設定的 `testMatch` glob、也剛好能在 root 的 `ts-jest` 設定下通過,
但它有自己專屬的設定跟指令,並不保證未來一定要繼續維持這種「剛好能跑」的狀態)。

## Root 單元測試(`src/test/unit/`)

| 檔案 | 涵蓋範圍 |
|---|---|
| `promptManager.test.ts` | `PromptManager` CRUD:讀寫 prompts.json、損毀/非陣列 JSON 的復原、新增/更新/刪除/釘選/排序/使用次數遞增、樂觀鎖(`OptimisticLockError`)、快取失效 |
| `versionManager.test.ts` | `VersionManager`:版本歷史 CRUD、損毀/錯誤格式 JSON 的復原、內容未變時去重、里程碑、`MAX_VERSIONS` 上限修剪(保護里程碑)、清除快取、路徑穿越攻擊拒絕 |
| `versionHistoryService.test.ts` | `VersionHistoryService`:在損毀或錯誤格式的歷史紀錄時載入/重置,fs 錯誤記錄不洩漏原始錯誤/路徑但仍會重新拋出 |
| `versionCommands.test.ts` | **PR #71** —— `handleShowVersionDiff` 在建立下一個 `TextDocumentContentProvider` 註冊前會先釋放前一個,連續看兩次版本比對不會拋錯 |
| `versionItem.test.ts` | **PR #68**(安全性)—— `VersionItem` 的 tooltip `MarkdownString` 的 `isTrusted` 為假值,即使里程碑標籤被刻意寫成 `command:` 連結也一樣 |
| `promptHoverProvider.test.ts` | **PR #68**(安全性)—— 同樣的 `isTrusted` 屬性,針對 `PromptHoverProvider` 由 prompt 標題建構的 hover `MarkdownString` |
| `promptProviderFsErrorLogging.test.ts` | **PR #67** —— `PromptProvider.savePrompts()` 失敗時只記錄 fs 錯誤代碼,絕不記錄完整工作區路徑 |
| `promptProviderMultiroot.test.ts` | 多根工作區下 `PromptProvider` 的路由:版本歷史存到正確的工作區、不會覆寫載入失敗的工作區、scope 切換、快速建立目標的解析 |
| `multiroot.test.ts` | `PromptManager`/MCP 工具層級的多根工作區支援:工作區前綴 ID、路由驗證、主要工作區的退回機制 |
| `clipboardManager.test.ts` | `ClipboardManager`:重複/過短/純數字內容過濾、損毀歷史 JSON 的復原、**PR #74** fs 錯誤路徑洩漏修復、焦點監聽器的釋放 |
| `secretStorage.test.ts` | `SecretStorageManager`:資料往返正確性,以及 **PR #69** 對格式錯誤/非物件/非字串的 token map 防呆(回傳 `undefined` 而不是弄壞輸出內容) |
| `privacyManager.test.ts` | `PrivacyManager`:重複值的還原遮罩,**issue #63** —— 還原時會先處理較長的遮罩值,再處理可能是它字首的較短遮罩值(不受字典新增順序影響),以及 **PR #66** 對格式錯誤的 `privacy-dictionary.json` 防呆。注意:這個類別的字典功能目前只有獨立的 `qp.bundle.js` CLI(也就是 `quickprompt` skill)會用到,VS Code 擴充套件的 UI 完全沒接上——修法是對的,但目前不影響任何 VS Code UI 的使用者 |
| `maskingEngine.test.ts` | `MaskingEngine` 把它的設定變更監聽器註冊成可釋放物件(資源洩漏防呆) |
| `mcpConfigPanel.test.ts` | **PR #79**(安全性)—— `escapeHtmlForWebview()` 正確跳脫 `&<>"'`,用來在把工作區名稱插入 MCP config webview 的 HTML 前先做消毒 |
| `i18n.test.ts` | `I18n`:語系檔遺失或載入失敗時不拋錯、會退回英文,以及 **PR #70** 不記錄原始 error 物件、只記錄語系代碼 |
| `pathUtils.test.ts` | `PathUtils`:工作區範圍檢查(含路徑穿越、同名前綴的相鄰資料夾攻擊)、路徑解析/相對化、建立目錄、JSON 讀寫、mtime 查詢 |
| `patternRegistry.test.ts` | `PatternRegistry.mask()`:標籤長度跟符合內容長度不同時的重複比對遮罩、同一個 pattern 出現 3 次以上的情況 |
| `aiEngine.test.ts` | **PR #77** —— `AIEngine.handleWorkerMessage` 在 worker 發生錯誤時立即拒絕(reject)對應的那一個待處理請求(依 `requestId` 判斷)、不影響其他同時待處理的請求,且訊息沒有 `requestId` 時會退回修復前的全域狀態行為 |

## mcp-server 單元測試(`mcp-server/src/test/`)

| 檔案 | 涵蓋範圍 |
|---|---|
| `stateStore.test.ts` | **PR #73** —— `loadState()`/`saveState()`(`~/.quickprompt-mcp-state.json` 這份持久化狀態)對 `null`/陣列/數字/無效 JSON 格式的防呆,遇到這些情況會退回 `{}` 而不是讓整個 MCP server 程序崩潰 |
| `clipboardTools.test.ts` | **PR #75** —— clipboard MCP 工具不會在 fs 錯誤回應裡洩漏剪貼簿歷史檔案的絕對路徑 |

## UI / E2E 測試(`src/test/ui/`)

每個檔案都會在自己的 `before()` 裡透過 `VSBrowser.instance.openResources(...)` 開啟自己的暫存
工作區(或自己的 `.code-workspace` fixture)——彼此不共用狀態,不過在一次 `npm run test:ui`
執行過程中,它們全部都跑在**同一個** VS Code/Chromium 程序裡(mocha 會依序把它們當成
各自獨立的 `describe` 區塊,依序對各自開啟的工作區執行)。

| 檔案 | 涵蓋範圍 |
|---|---|
| `quickPrompt.ui.test.ts` | 核心互動流程:側邊欄渲染、command palette 顯示主要指令、搜尋+複製+使用次數遞增、從樹狀圖開啟並編輯 prompt、新增 Prompt(自動標題/自訂標題)、從選取內容快速新增、Show MCP Config、Refresh Clipboard History |
| `multiRootQuickPrompt.ui.test.ts` | 透過真實 UI 測試多根工作區行為:預設 scope 下的扁平 prompt 清單、限定 scope 的搜尋、快速新增以當前編輯器所在工作區為目標 |
| `securityFixes.ui.test.ts` | **PR #79**(安全性)—— 開一個資料夾名稱惡意命名的真實多根工作區,執行「Show MCP Config」,檢查實際的 webview DOM,確認惡意內容只會渲染成無害文字、不會被執行。(**PR #68 的 hover E2E 測試已移除**——見下方「已知限制」;該修復的涵蓋範圍完全由單元測試把關) |
| `versionDiff.ui.test.ts` | **PR #71** —— 透過真實的樹狀節點點擊,連續看 3 個版本歷史的差異比對,確認每次都正確渲染、不會跳出「無法顯示版本比對」的通知 |
| `malformedConfigResilience.ui.test.ts` | **PR #66** —— 在開啟工作區**之前**先弄壞 `.vscode/privacy-dictionary.json`,確認擴充套件仍能正常啟動、側邊欄正常渲染、新增 prompt 仍然可用。(**不會**實際測到 `PrivacyManager` 的防呆邏輯本身,因為那個類別根本沒接上擴充套件 UI——只證明擴充套件不會崩潰) |
| `aiTitleGeneration.ui.test.ts` | **PR #77**,範圍較窄 —— 把 AI provider 指向一個打不通的端點,確認「新增 Prompt(自動標題)」仍然能在幾秒內存下退回用的標題(而不是卡到 90 秒逾時),而且之後擴充套件主體仍保持回應。並沒有重現精確的 `requestId` 拒絕邏輯路徑(見單元測試),因為要真正觸發本地模型 worker 的錯誤需要真的下載模型,而且背景產生標題這個呼叫本來就是即發即忘(fire-and-forget),在 UI 上根本看不出差異 |

### 調查過但沒有寫成測試的項目(原因已寫在對應的測試檔案或 PR 裡)

- **Issue #63**(`PrivacyManager` 子字串標籤還原):無法做 E2E 測試——這個類別完全接不到任何 VS Code 指令或 UI 動作。
- **PR #69**(`SecretStorageManager` 格式錯誤的 token map):無法做 E2E 測試——token map 只存在 OS 層級的金鑰庫(透過 VS Code 的 `SecretStorage` API),從來不會落地成一個測試可以從外部弄壞的檔案。
- **PR #78**(`clipboardHistoryView` tree provider 的釋放):唯一能觀察到「釋放失敗」的方式是完整跑一次擴充套件停用/重新啟用的循環(例如「Developer: Reload Window」),但在這個 Electron 環境下,`vscode-extension-tester` 的 WebDriver session 撐不過視窗重新載入——沒有重新連線的 API 可用。

## 已知限制

- **UI 測試天生比單元測試慢、也比較不穩定**——它們透過模擬的 Selenium 輸入去操作一個真的 Electron 應用程式,本來就有已知的時機敏感問題(見下方)。UI 測試失敗應該當成「需要調查」的訊號,不代表一定是真的壞掉——但也不要不分青紅皂白就加重試機制,要先確認失敗是真的偶發(隨機)還是持續性的(重試解決不了的環境限制;見下方 PR #68 的案例)。
- **`quickPrompt.ui.test.ts` 曾經讓整個 `npm run test:ui` 卡死。** 兩個測試(「Quick Add Prompt (Selection)」、「Refresh Clipboard History adds copied editor text」)會開一個「File: New Text File」暫存分頁,但先前從來沒有關掉,分頁就一直保持骯髒(未儲存)狀態。下次這個套件的 `after()` 執行 `closeAllEditors()`、切換到下一個測試檔案時,這個髒分頁就會觸發 VS Code 原生的「要不要儲存」確認視窗——而一旦有人(或後續某個步驟)對一個從沒存過檔的檔案點了「儲存」,VS Code 就得問「要存去哪」,跳出一個作業系統層級的「另存新檔」檔案選擇視窗,這種視窗 WebDriver 完全看不到、也碰不到,整個執行就會硬生生卡死。修法是用 `revertAllOpenEditors()`(呼叫 `workbench.action.revertAndCloseActiveEditor`,不是 `workbench.action.files.revert`——後者的意思是「從硬碟重新載入」,對一個從沒存過檔的暫存分頁來說會靜默地什麼都不做)。
- **PR #68 的 E2E hover 測試已經被移除,不是用 skip 或重試蓋過去。** 不管試過哪種觸發方式——單純滑鼠移動 dwell、滑鼠 + 「Show or Focus Hover」指令、滑鼠 + `this.retries(2)` 重試——這個 hover tooltip 在這個環境下**每一次**都沒有在等待時限內渲染出來。這是**持續性**、不是偶發性的症狀,代表這是重試解決不了的環境限制(重試只對真正隨機的不穩定有用),不是真的邏輯缺陷。硬是用重試把它「弄過」,只會把這個事實藏在一個綠色勾勾後面。`PromptHoverProvider` 跟 `VersionItem` 的 `isTrusted === false` 這個屬性,完全由 `promptHoverProvider.test.ts` 跟 `versionItem.test.ts` 涵蓋,而且不依賴任何 UI 時機。
- **`.vscode-test/` 跟共用的 `%TEMP%/test-resources` 快取,設計上會跟這台機器上所有用 `vscode-extension-tester` 的專案共用**(包含 `editorGrouper`/VirtualTabs 跟 `Edo-Tensei`)——`test:ui` 刻意**沒有**傳入專案自己的 `-s`/`--storage` 覆寫路徑,所以在其他姊妹專案裡重跑 `test:ui` 時,會直接沿用同一份已下載的 VS Code + ChromeDriver,而不是每個專案各自重新下載一份(~150MB 以上)。
