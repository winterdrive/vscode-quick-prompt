# Quick Prompt – AI が動作中に、アイデアをキャッチしてタスクをキューイング

[![Visual Studio Marketplace Version](https://vsmarketplacebadges.dev/version-short/winterdrive.quick-prompt.svg)](https://marketplace.visualstudio.com/items?itemName=winterdrive.quick-prompt)
[![Open VSX Version](https://img.shields.io/open-vsx/v/winterdrive/quick-prompt)](https://open-vsx.org/extension/winterdrive/quick-prompt)
[![Open VSX Downloads](https://img.shields.io/open-vsx/dt/winterdrive/quick-prompt)](https://open-vsx.org/extension/winterdrive/quick-prompt)
[![AI-Ready Context](https://img.shields.io/badge/AI--Ready-LLMS.txt-blue?style=flat-square)](https://winterdrive.github.io/vscode-quick-prompt/llms.txt)
<!-- [![VS Marketplace Installs](https://vsmarketplacebadges.dev/installs-short/winterdrive.quick-prompt.svg)](https://marketplace.visualstudio.com/items?itemName=winterdrive.quick-prompt) -->
<!-- [![VS Marketplace Downloads](https://vsmarketplacebadges.dev/downloads-short/winterdrive.quick-prompt.svg)](https://marketplace.visualstudio.com/items?itemName=winterdrive.quick-prompt) -->

[繁體中文](./README.zh-TW.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [简体中文](./README.zh-CN.md) | [English](../README.md)

![Quick Prompt - AI 協作時の IDE 内蔵スクラッチパッド＆タスクキューイング](./assets/hero_banner.png)

---

## 🚀 Quick Prompt とは？

**AI エージェントがタスクを実行している間、あなたの思考は止まりません。** Quick Prompt は、あなたの **IDE 内蔵スクラッチパッド** です。Notepad++ に切り替えて思考フローを妨げることなく、次のステップをメモし、再利用可能なコードスニペットを保存し、クリップボード履歴を追跡できます。

**永続化スニペットライブラリ**と**クリップボード履歴追跡**を組み合わせており、AI が動作中に生まれたアイデアが、タスク完了の瞬間にすぐ活用できます。

---

![機能ハイライト](./assets/feature_highlights.png)

---

## 🔌 v0.3.0 大型アップデート：AI エージェント統合 (MCP)

**完全な Model Context Protocol (MCP) サポートが登場しました。** 手動コピペを完全に廃止 — Cursor、Copilot、Claude などの AI アシスタントが、ネイティブツールを通じてプロンプトを直接管理できます。

### 🛡️ 標準 Skill の安全ロジック

QuickPrompt Skill には、安全で安定した動作を保証する組み込みロジックが含まれています：

1. **Layer 0: 接続ゲート** — `list_prompts` による自動接続確認。MCP が切断された場合、エージェントは即座に HALT と判定し、フォールバック処理をユーザーに提示します。
2. **Layer 1: 標準 MCP ツール** — プロンプトの CRUD 操作、バージョン管理、クリップボード履歴を扱う 17 個のツール。
3. **Layer 2: 安全検証** — 敏感な操作の実行前に内部的なサニティチェックを実施し、データ整合性を確保。
4. **Layer 3: CLI フォールバック** — MCP サーバーが利用不可の場合、エージェントは内蔵の `qp.bundle.js` スクリプトに切り替えてデータベースに直接アクセス。

### ⚙️ マルチクライアント一括設定

主要な AI ツール向けにワンクリック設定を提供。`Quick Prompt: Show MCP Config` コマンドを実行して、インタラクティブパネルを開きます。

| Cursor / Antigravity | GitHub Copilot / Cline | Kiro IDE / Claude Code |
| :------------------- | :--------------------- | :--------------------- |
| `${workspaceFolder}` 変数をサポート | 絶対パス バインディング | JSON 設定ブロック生成 |

---

## ✨ コア機能

### 🔌 AI エージェント パワーアップ (新機能!)

- **🔌 17 個の MCP ツール**：AI エージェント用の完全なプロンプト管理スイート。
- **🛡️ アクション判定ツリー**：エージェントは接続状態が安全で実行可能な場合にのみ動作。
- **📦 CLI フォールバック バンドル**：オフライン時に利用できる内蔵スクリプト。
- **⚙️ インタラクティブ設定パネル**：Cursor、Copilot、Cline、Claude など主要ツールの簡単セットアップ。
- **🧠 Agent Skill**：**Quick Prompt: Install Agent Skill** を実行し、**Auto Install (Recommended)** を選んで公式 skill をインストールします。同じインストールコマンドを直接実行することもできます：

  ```bash
  npx skills add winterdrive/QuickPrompt
  ```

  特定の agent 向け skill/rule ファイルを手動で書き出す必要がある場合だけ、**Generate Skill Files Manually** を選びます。

### 📚 プロンプト管理

- **🤖 AIスマートタイトル**：ローカル AI（SmolLM2 / Qwen3、選択可能）による自動意味タイトル生成。
- **🎯 高速検索**：`Alt+P` でプロンプトを検索、Enter で直接コピー。
- **🚀 クイック追加**：選択したテキストを右クリック → 「Quick Add Prompt」（または `Alt+Shift+S`）。
- **✏️ ネイティブ編集**：プロンプトを通常ファイルのように編集、VSCode 機能を完全サポート。

### 🕒 バージョン管理

- **🕒 線形履歴**：保存するたびに自動バージョン作成。
- **📌 マイルストーン**：安定版や重要なドラフトにタグ付け。
- **⚖️ ビジュアル差分**：クリック一つで変更内容を比較。

### 🔒 プライバシー保護

- **🔒 プロンプトをマスク**：右クリック → 「Mask Prompt」。敏感データは即座にトークン化（`[EMAIL-1]`、`[API-KEY-1]` など）。
- **🔓 マスク解除**：右クリック → 「Unmask Prompt」で元の値を復元。
- **🔑 OS 暗号化ストレージ**：復号マッピングは VS Code SecretStorage（OS キーチェーン）に保存、プレーンテキストファイルには決して記述されません。

## 📸 スクリーンショット (AI 生成)

### インターフェース概要

![インターフェース概要](./assets/bottom_panel_overview.png)

*実際の統合ビュー：クリップボード履歴（左）とプロンプト線形履歴（右）*

### クイック検索デモ

![クイック検索](./assets/quick_search_demo.png)

*キャプチャキューとクリップボード履歴の統合検索インターフェース*

## 🚀 クイックスタート

### 初回セットアップ

1. VSCode で任意のプロジェクトフォルダを開く
2. 拡張機能が自動的に `.vscode/prompts.json` を作成
3. `Alt+P`（Mac: `Opt+P`）を押して使用開始

### 基本操作

#### 方法 1：クイック検索（推奨）⚡

1. `Alt+P` を押して統合検索を開く
2. **Prompts** と **Clipboard History** を一か所で閲覧
3. キーワードでフィルタリング
4. `Enter` を押してクリップボードにコピー
5. `Ctrl+V` で任意の場所にペースト

#### 方法 2：サイドバー操作 📋

1. アクティビティバーの Quick Prompt アイコンをクリック
2. **My Prompts** セクション：
    - クリックでコピー
    - 右クリックで上下移動
    - インラインボタン：コピー、ピン、編集、削除
3. **Clipboard History** セクション：
    - クリックでコピー
    - ピンボタンで永続プロンプトに変換
    - インラインボタン：コピー、ピン、編集、削除

### アイコンの意味

- 🔥：ホット（10 回以上使用）
- ⭐：頻出（5 回以上使用）
- 📝：標準（1 回以上使用）
- ⚪：未使用
- 📌：ピン留め

## 📝 プロンプト管理

### プロンプト追加

#### 方法 1：選択テキストから追加（最速）🚀

1. エディタでテキストを選択
2. 右クリック → 「Quick Add Prompt」（または `Alt+Shift+S`）
3. 完了！タイトル自動生成

#### 方法 2：スマート追加モード ⚡

1. サイドバーの **➕ 追加** ボタンをクリック
2. 入力ボックスで：
    - **自動モード**：コンテンツを直接ペースト（自動タイトル生成）
    - **手動モード**：`Title::Content` 形式を使用
3. 完了！

#### 方法 3：クリップボード履歴から

1. Clipboard History でアイテムを検索
2. **📌 ピン** ボタンをクリック
3. 自動的に永続プロンプトに変換

### プロンプト編集

- **✏️ 編集** ボタンをクリックしてネイティブエディタを開く
- 通常ファイルのように編集
- `Ctrl+S` で保存
- Undo/Redo、自動保存、フォーマット文書に完全対応

### バージョン履歴を使用（新機能）

1. **履歴表示**：サイドバーの任意プロンプトを展開
2. **比較**：履歴版をクリックして **Diff View** を開く
3. **復元**：版を右クリック → **版を適用** で復元
4. **マイルストーン**：重要版に「v1.0 安定版」などタグ付け

## 🔒 プライバシー保護 – 使用ガイド

AI モデルに送信する前に、敏感データをマスク化します。

### 操作フロー

1. 敏感データを含むプロンプトを追加 — サイドバーに **黄色シールド** 警告表示
2. 右クリック → **`Mask Prompt`**
3. 敏感値は `[EMAIL-1]`、`[API-KEY-1]` などトークンに置換；プロンプトは **緑色シールド** を表示
4. プロンプトをコピー/挿入 — エージェントはトークンのみ受け取り、元の値は見えません
5. 右クリック → **`Unmask Prompt`** で即座に復元

> **セキュリティモデル**：復号マッピング（トークン → 元の値）は VS Code **SecretStorage**（macOS Keychain / Windows Credential Manager）に保存され、OS により暗号化された形式で永続化。プレーンテキストファイルには決して記述されません。Unmask はマシンローカルのみ — 別のマシンに切り替えると、マスク化されたプロンプトは復元不可。

### デフォルト検出パターン

- メールアドレス → `[EMAIL-1]`
- 電話番号 → `[PHONE-1]`
- API キー（AWS、GitHub、OpenAI など）→ `[API-KEY-1]`
- IP アドレス → `[IP-ADDRESS-1]`
- 秘密鍵 / 証明書 → `[PRIVATE-KEY-1]`
- クレジットカード番号 → `[CREDIT-CARD-1]` *(デフォルト：オフ)*

### プライバシー設定

- `quickPrompt.privacy.enabled`：全プライバシー機能のオン/オフ（デフォルト：`true`）
- `quickPrompt.privacy.patterns.email`：メール マスク（デフォルト：`true`）
- `quickPrompt.privacy.patterns.phone`：電話 マスク（デフォルト：`true`）
- `quickPrompt.privacy.patterns.apiKeys`：API キー マスク（デフォルト：`true`）
- `quickPrompt.privacy.patterns.ipAddress`：IP アドレス マスク（デフォルト：`true`）
- `quickPrompt.privacy.patterns.privateKey`：秘密鍵 マスク（デフォルト：`true`）
- `quickPrompt.privacy.patterns.creditCard`：クレジットカード マスク（デフォルト：`false`）

---

## ⚙️ 設定

### AI 機能

- `quickPrompt.ai.enabled`：AI 機能のオン/オフ（デフォルト：`true`）
- `quickPrompt.ai.autoGenerateTitle`：タイトルを自動生成（デフォルト：`true`）

### クリップボード履歴

- `quickPrompt.clipboardHistory.enabled`：自動追跡のオン/オフ（デフォルト：`true`）
- `quickPrompt.clipboardHistory.maxItems`：最大履歴アイテム数（デフォルト：`20`）
- `quickPrompt.clipboardHistory.minLength`：最小コンテンツ長（デフォルト：`10`）

### ファイル位置

- **ワークスペースモード**：`.vscode/prompts.json`（プロジェクトフォルダ毎に独立、マルチワークスペース Multi-root 対応）
- **フォールバックモード**：ワークスペースが開かない場合、拡張機能ディレクトリを使用

### キーボード ショートカット

| 機能        | Windows/Linux | Mac           |
|-----------|---------------|---------------|
| プロンプト検索 | `Alt+P`       | `Opt+P`       |
| 選択から追加   | `Alt+Shift+S` | `Opt+Shift+S` |

### オートメーション用 Command ID

Quick Prompt v0.5.1 は拡張コマンドを `quickPrompt.*` namespace に統一。Command Palette 表示名とデフォルトショートカットは変わりませんが、カスタム `keybindings.json`、マクロ拡張、タスク、外部オートメーションの場合は以下の Command ID を使用してください。

| アクション | Command ID |
|-----------|------------|
| プロンプト＆クリップボード履歴を検索 | `quickPrompt.search` |
| プロンプト追加 | `quickPrompt.addPrompt` |
| カスタムタイトルで追加 | `quickPrompt.addPromptWithTitle` |
| 選択テキストからクイック追加 | `quickPrompt.silentAdd` |
| プロンプト編集 | `quickPrompt.editPrompt` |
| プロンプト名前変更 | `quickPrompt.renamePrompt` |
| プロンプト削除 | `quickPrompt.deletePrompt` |
| ピン トグル | `quickPrompt.togglePin` |
| MCP 設定表示 | `quickPrompt.showMcpConfig` |
| AI 接続テスト | `quickPrompt.testAIConnection` |

仮想プロンプトエディタタブは `quickprompt:` URI スキームを使用。既存のプロンプトデータと設定は変更されません。ただし、以前の VS Code セッションから復元された古い仮想エディタタブ、または古い仮想 URI へのリンクはサイドバーから開き直す必要があります。

## 💡 ベストプラクティス

1. **AI 実行中にキュー**：AI が長いタスクを実行している間、Quick Prompt を開いて次ステップを記録 — アイデアを失わない
2. **その場でキャプチャ**：保存する価値がありますか？選択して `Alt+Shift+S` — タイトルは自動生成
3. **クリップボード履歴を安全網に**：自由にコピー；過去 20 アイテムはいつでも取得可能（`maxItems` で調整）
4. **よく使うスニペットをピン留め**：ワンクリックで一時的なクリップボードアイテムを永続プロンプトにアップグレード
5. **Git にコミット**：`.vscode/prompts.json` をコミットしてチーム全体で再利用スニペットを共有

## 🤝 推奨コンパニオン

### 🗂️ VirtualTabs

**AI コラボレーションワークフロー を強化。**

**Quick Prompt** があなたの思考を IDE 内で整理。**VirtualTabs** でワークスペースも整理。

- **Quick Prompt**：*AI が動作中に* 、あなたの脳が考えていることをキャプチャ
- **VirtualTabs**：ディレクトリ横断して、どのファイルがどのタスクに属するかを整理

[**VS Code Marketplace**](https://marketplace.visualstudio.com/items?itemName=winterdrive.virtual-tabs) | [**Open VSX Registry**](https://open-vsx.org/extension/winterdrive/virtual-tabs) で取得

### 🔁 Edo Tensei

**移動が必要なのは思考だけでなく、セッションそのものであるとき。**

Quick Prompt がバッファするのは、セッション *内* で考えていることです。[Edo Tensei](https://github.com/Pain-Labs/Edo-Tensei) は、クォータが切れたり途中でエージェントがクラッシュしたりしたとき、セッションを IDE を *またいで* 運びます。

[**VS Code Marketplace**](https://marketplace.visualstudio.com/items?itemName=Pain-Labs.edo-tensei) | [**Open VSX Registry**](https://open-vsx.org/extension/Pain-Labs/edo-tensei) で Edo Tensei を取得

---

## ❤️ サポート

この拡張が役に立つと思われたら、ぜひ開発をサポートしてください！

<a href="https://ko-fi.com/Q5Q41SR5WO"><img src="https://storage.ko-fi.com/cdn/kofi2.png?v=3" height="36" alt="ko-fi" /></a>

## 📄 ライセンス

MIT License

---

**ウィンドウ切り替えであなたのアイデアを失わないでください。** 🚀

*Made with ❤️ for developers who think faster than their agents run*
