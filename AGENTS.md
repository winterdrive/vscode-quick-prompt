# AGENTS.md

- 任務報告或規劃文件皆優先以中文撰寫。
- Daily routine Draft PR 不做 release 準備：不要 bump `package.json` / `package-lock.json`，不要更新 `CHANGELOG.md`。
- 不可修改 `mcp-server/src/tools/` 內任何 tool schema、tool name 或參數，避免破壞既有 MCP client。
- 不可新增、移除或更新 dependencies，除非使用者明確要求 dependency/security work。
- 文件修正不可只改使用者指出的單一檔案。若問題屬於同源文案、release-facing docs、README、多語文件或 llms 文件，必須先用 `rg` 掃 `README.md`、`docs/`、`llms*.txt` 找出同類問題，列出 scope 後一起修正，改完再反向 `rg` 驗證舊口徑不存在。
