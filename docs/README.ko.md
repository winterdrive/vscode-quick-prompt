# Quick Prompt – AI가 작동 중일 때 아이디어를 캡처하고 작업을 큐에 넣기

[![Visual Studio Marketplace Version](https://vsmarketplacebadges.dev/version-short/winterdrive.quick-prompt.svg)](https://marketplace.visualstudio.com/items?itemName=winterdrive.quick-prompt)
[![Open VSX Version](https://img.shields.io/open-vsx/v/winterdrive/quick-prompt)](https://open-vsx.org/extension/winterdrive/quick-prompt)
[![Open VSX Downloads](https://img.shields.io/open-vsx/dt/winterdrive/quick-prompt)](https://open-vsx.org/extension/winterdrive/quick-prompt)
[![AI-Ready Context](https://img.shields.io/badge/AI--Ready-LLMS.txt-blue?style=flat-square)](https://winterdrive.github.io/vscode-quick-prompt/llms.txt)
<!-- [![VS Marketplace Installs](https://vsmarketplacebadges.dev/installs-short/winterdrive.quick-prompt.svg)](https://marketplace.visualstudio.com/items?itemName=winterdrive.quick-prompt) -->
<!-- [![VS Marketplace Downloads](https://vsmarketplacebadges.dev/downloads-short/winterdrive.quick-prompt.svg)](https://marketplace.visualstudio.com/items?itemName=winterdrive.quick-prompt) -->

[繁體中文](./README.zh-TW.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [简体中文](./README.zh-CN.md) | [English](../README.md)

![Quick Prompt - AI 협업 시 IDE 내장 스크래치 패드 및 작업 큐잉](./assets/hero_banner.png)

---

## 🚀 Quick Prompt란?

**AI 에이전트가 작업을 실행 중일 때 당신의 뇌는 멈추지 않습니다.** Quick Prompt는 당신의 **IDE 내장 스크래치 패드**입니다 — 다음 단계를 기록하고, 재사용 가능한 코드 스니펫을 저장하고, 클립보드 히스토리를 추적할 수 있습니다. Notepad++로 전환하거나 사고의 흐름을 방해하지 않으면서 말이에요.

**영구 스니펫 라이브러리**와 **클립보드 히스토리 추적**을 결합하여, AI가 작동 중에 떠오르는 아이디어가 완료되는 그 순간 바로 활용될 수 있습니다.

---

![기능 하이라이트](./assets/feature_highlights.png)

---

## 🔌 v0.3.0 메이저 업데이트: AI 에이전트 통합 (MCP)

**완전한 Model Context Protocol (MCP) 지원이 출시되었습니다.** 수동 복사 붙여넣기를 완벽히 제거 — Cursor, Copilot, Claude 등의 AI 어시스턴트가 네이티브 도구를 통해 프롬프트를 직접 관리할 수 있습니다.

### 🛡️ 4층 안전 의사결정 트리

생성되는 각 Skill에는 안정적인 운영을 보장하는 내장 안전 로직이 포함되어 있습니다:

1. **Layer 0: 연결 게이트** — `list_prompts`를 통한 자동 연결 확인. MCP가 끊기면 에이전트는 즉시 HALT를 트리거하고 폴백 처리를 제시합니다.
2. **Layer 1: 표준 MCP 도구** — 프롬프트의 CRUD 작업과 버전 관리를 다루는 14개의 최적화된 도구.
3. **Layer 2: 안전 검증** — 민감한 작업 실행 전 내부 논리 검사로 데이터 일관성 보장.
4. **Layer 3: CLI 하드 폴백** — MCP 서버를 사용할 수 없을 때 에이전트는 내장 `qp.bundle.js` 스크립트로 전환하여 데이터베이스에 직접 액세스.

### ⚙️ 멀티 클라이언트 일괄 설정

주요 AI 도구를 위한 원클릭 설정 생성. `Quick Prompt: Show MCP Config` 명령을 실행하여 인터랙티브 패널을 엽니다.

| Cursor / Antigravity | GitHub Copilot / Cline | Kiro IDE / Claude Code |
| :------------------- | :--------------------- | :--------------------- |
| `${workspaceFolder}` 변수 지원 | 절대 경로 바인딩 | JSON 설정 블록 생성 |

---

## ✨ 핵심 기능

### 🔌 AI 에이전트 파워 (신규!)

- **🔌 21개의 MCP 도구**: AI 에이전트를 위한 완전한 프롬프트 관리 도구 모음.
- **🛡️ 액션 의사결정 트리**: 에이전트가 연결되고 안전한 경우에만 작동.
- **📦 CLI 폴백 번들**: 오프라인 시나리오를 위한 내장 보험.
- **⚙️ 인터랙티브 설정 패널**: Cursor, Copilot, Cline, Claude 등 주요 도구의 쉬운 설정.

### 📚 프롬프트 관리

- **🤖 AI 스마트 타이틀**: 로컬 AI(SmolLM2 / Qwen3, 선택 가능)를 사용한 자동 시맨틱 타이틀 생성.
- **🎯 초고속 검색**: `Alt+P`로 프롬프트 검색, Enter로 직접 복사.
- **🚀 빠른 추가**: 선택한 텍스트 우클릭 → "Quick Add Prompt" (또는 `Alt+Shift+S`).
- **✏️ 네이티브 편집**: 일반 파일처럼 프롬프트 편집, VSCode 기능 완전 지원.

### 🕒 버전 관리

- **🕒 선형 히스토리**: 저장할 때마다 자동으로 새 버전 생성.
- **📌 마일스톤**: 안정 버전이나 중요한 초안에 태그 지정.
- **⚖️ 비주얼 비교**: 클릭 한 번으로 변경 사항 비교.

### 🔒 개인정보 보호

- **🔒 프롬프트 마스크**: 우클릭 → `Mask Prompt`. 민감한 데이터는 즉시 토큰화됨(`[EMAIL-1]`, `[API-KEY-1]` 등).
- **🔓 마스크 해제**: 우클릭 → `Unmask Prompt`로 원본 값 복구.
- **🔑 OS 암호화 스토리지**: 역매핑은 VS Code SecretStorage(OS 키체인)에 저장되며, 일반 텍스트 파일에는 절대 기록되지 않음.

## 📸 스크린샷 (AI 생성)

### 인터페이스 개요

![인터페이스 개요](./assets/bottom_panel_overview.png)

*실제 통합 보기: 클립보드 히스토리(좌측)와 선형 히스토리가 있는 프롬프트(우측)*

### 빠른 검색 데모

![빠른 검색](./assets/quick_search_demo.png)

*캡처 큐와 클립보드 히스토리의 통합 검색 인터페이스*

## 🚀 빠른 시작

### 첫 번째 설정

1. VSCode에서 프로젝트 폴더 열기
2. 확장이 자동으로 `.vscode/prompts.json` 생성
3. `Alt+P`(Mac: `Opt+P`) 누르기로 사용 시작

### 기본 사용법

#### 방법 1: 빠른 검색(권장) ⚡

1. `Alt+P`로 통합 검색 열기
2. **프롬프트**와 **클립보드 히스토리**를 한곳에서 브라우징
3. 키워드로 필터링
4. `Enter` 누르기로 클립보드에 복사
5. `Ctrl+V`로 원하는 곳에 붙여넣기

#### 방법 2: 사이드바 작업 📋

1. 활동 표시줄의 Quick Prompt 아이콘 클릭
2. **My Prompts** 섹션:
    - 클릭으로 복사
    - 우클릭으로 위/아래 이동
    - 인라인 버튼: 복사, 고정, 편집, 삭제
3. **Clipboard History** 섹션:
    - 클릭으로 복사
    - 고정 버튼으로 영구 프롬프트로 변환
    - 인라인 버튼: 복사, 고정, 편집, 삭제

### 아이콘 의미

- 🔥: 인기(10회 이상 사용)
- ⭐: 자주 사용(5회 이상 사용)
- 📝: 일반(1회 이상 사용)
- ⚪: 미사용
- 📌: 고정

## 📝 프롬프트 관리

### 프롬프트 추가

#### 방법 1: 선택 텍스트에서 추가(가장 빠름) 🚀

1. 편집기에서 텍스트 선택
2. 우클릭 → "Quick Add Prompt" (또는 `Alt+Shift+S`)
3. 완료! 타이틀 자동 생성

#### 방법 2: 스마트 추가 모드 ⚡

1. 사이드바 제목 표시줄의 **➕ 추가** 버튼 클릭
2. 입력 상자에:
    - **자동 모드**: 콘텐츠 직접 붙여넣기(자동 타이틀 생성)
    - **수동 모드**: `제목::콘텐츠` 형식 사용
3. 완료!

#### 방법 3: 클립보드 히스토리에서

1. Clipboard History에서 항목 찾기
2. **📌 고정** 버튼 클릭
3. 자동으로 영구 프롬프트로 변환

### 프롬프트 편집

- **✏️ 편집** 버튼 클릭으로 네이티브 편집기 열기
- 일반 파일처럼 편집
- `Ctrl+S`로 저장
- 실행 취소/재실행, 자동 저장, 문서 형식화 지원

### 버전 히스토리 사용(신규)

1. **히스토리 보기**: 사이드바의 임의 프롬프트 확장.
2. **비교**: 히스토리 버전 클릭으로 **Diff View** 열기.
3. **복구**: 버전 우클릭 → **버전 적용** 선택으로 복구.
4. **마일스톤**: 중요 버전에 "v1.0 안정"같은 태그 지정.

## 🔒 개인정보 보호 – 사용 가이드

AI 모델로 보내기 전에 민감한 데이터를 마스크하세요.

### 작업 흐름

1. 민감한 데이터를 포함한 프롬프트 추가 — 사이드바에 **노란 방패** 경고 표시
2. 우클릭 → **`Mask Prompt`**
3. 민감한 값이 `[EMAIL-1]`, `[API-KEY-1]` 등 토큰으로 치환되고 프롬프트는 **녹색 방패** 표시
4. 프롬프트 복사/삽입 — 에이전트는 토큰만 받고 원본은 절대 보지 않음
5. 우클릭 → **`Unmask Prompt`** 로 즉시 복구

> **보안 모델**: 역매핑(토큰 → 원본 값)은 VS Code **SecretStorage**(macOS Keychain / Windows Credential Manager)에 저장되며 OS가 암호화된 형식으로 지속화. 일반 텍스트 파일에는 절대 기록되지 않음. Unmask는 머신 로컬만 가능 — 다른 머신으로 전환하면 마스크된 프롬프트는 복구 불가.

### 기본 감지 패턴

- 이메일 주소 → `[EMAIL-1]`
- 전화 번호 → `[PHONE-1]`
- API 키(AWS, GitHub, OpenAI 등) → `[API-KEY-1]`
- IP 주소 → `[IP-ADDRESS-1]`
- 개인 키 / 인증서 → `[PRIVATE-KEY-1]`
- 신용 카드 번호 → `[CREDIT-CARD-1]` *(기본값: 끄기)*

### 개인정보 설정

- `quickPrompt.privacy.enabled`: 모든 개인정보 기능 활성화/비활성화(기본값: `true`)
- `quickPrompt.privacy.patterns.email`: 이메일 마스크(기본값: `true`)
- `quickPrompt.privacy.patterns.phone`: 전화 마스크(기본값: `true`)
- `quickPrompt.privacy.patterns.apiKeys`: API 키 마스크(기본값: `true`)
- `quickPrompt.privacy.patterns.ipAddress`: IP 주소 마스크(기본값: `true`)
- `quickPrompt.privacy.patterns.privateKey`: 개인 키 마스크(기본값: `true`)
- `quickPrompt.privacy.patterns.creditCard`: 신용 카드 마스크(기본값: `false`)

---

## ⚙️ 설정

### AI 기능

- `quickPrompt.ai.enabled`: AI 기능 활성화/비활성화(기본값: `true`)
- `quickPrompt.ai.autoGenerateTitle`: 자동 타이틀 생성(기본값: `true`)

### 클립보드 히스토리

- `quickPrompt.clipboardHistory.enabled`: 자동 추적 활성화/비활성화(기본값: `true`)
- `quickPrompt.clipboardHistory.maxItems`: 최대 히스토리 항목(기본값: `20`)
- `quickPrompt.clipboardHistory.minLength`: 최소 콘텐츠 길이(기본값: `10`)

### 파일 위치

- **워크스페이스 모드**: `.vscode/prompts.json`(프로젝트별 독립)
- **폴백 모드**: 워크스페이스가 열려 있지 않으면 확장 디렉토리 사용

### 키보드 단축키

| 기능      | Windows/Linux | Mac           |
|----------|---------------|---------------|
| 프롬프트 검색 | `Alt+P`       | `Opt+P`       |
| 선택에서 추가 | `Alt+Shift+S` | `Opt+Shift+S` |

### 자동화용 Command ID

Quick Prompt v0.5.1은 확장 명령을 `quickPrompt.*` 네임스페이스로 통합. Command Palette 표시명과 기본 단축키는 변경되지 않지만, 사용자 정의 `keybindings.json`, 매크로 확장, 작업 또는 외부 자동화의 경우 다음 Command ID를 사용하세요.

| 동작 | Command ID |
|------|------------|
| 프롬프트 및 클립보드 히스토리 검색 | `quickPrompt.search` |
| 프롬프트 추가 | `quickPrompt.addPrompt` |
| 사용자 정의 타이틀로 추가 | `quickPrompt.addPromptWithTitle` |
| 선택 텍스트에서 빠른 추가 | `quickPrompt.silentAdd` |
| 프롬프트 편집 | `quickPrompt.editPrompt` |
| 프롬프트 이름 변경 | `quickPrompt.renamePrompt` |
| 프롬프트 삭제 | `quickPrompt.deletePrompt` |
| 고정 토글 | `quickPrompt.togglePin` |
| MCP 설정 표시 | `quickPrompt.showMcpConfig` |
| Skill 파일 생성 | `quickPrompt.generateSkill` |
| AI 연결 테스트 | `quickPrompt.testAIConnection` |

가상 프롬프트 편집기 탭은 이제 `quickprompt:` URI 스키마를 사용. 기존 프롬프트 데이터 및 설정에는 변경 사항이 없지만, 이전에 VS Code 세션 복원으로 복원된 이전 가상 편집기 탭이나 이전 가상 URI로의 외부 링크는 Quick Prompt 사이드바에서 다시 열어야 할 수 있습니다.

## 💡 모범 사례

1. **대기 중 큐 작업**: AI가 긴 작업을 시작할 때 Quick Prompt를 즉시 열고 다음 단계를 기록하세요 — 아이디어를 잃지 마세요
2. **즉시 캡처**: 유지할 가치가 있는가? 선택한 후 `Alt+Shift+S` — 타이틀 자동 생성
3. **클립보드 히스토리를 안전망으로**: 자유롭게 복사, 최근 20개 항목은 언제든 검색 가능(`maxItems`로 조정)
4. **자주 사용하는 스니펫 고정**: 원클릭으로 일시적 클립보드 항목을 영구 항목으로 업그레이드
5. **Git에 커밋**: `.vscode/prompts.json` 커밋으로 팀 전체가 재사용 가능 스니펫 공유

## 🤝 추천 동반자

### 🗂️ VirtualTabs

**AI 협업 워크플로우를 강화하세요.**

**Quick Prompt**가 IDE 내에서 생각을 정리합니다. **VirtualTabs**로 작업 공간도 정리하세요.

- **Quick Prompt**: *AI가 작동 중일 때* 당신의 뇌가 생각하는 것을 캡처
- **VirtualTabs**: 디렉토리 전체에서 어떤 파일이 어떤 작업에 속하는지 정리

[**VS Code Marketplace**](https://marketplace.visualstudio.com/items?itemName=winterdrive.virtual-tabs) | [**Open VSX Registry**](https://open-vsx.org/extension/winterdrive/virtual-tabs) 에서 얻기

---

## ❤️ 지원

이 확장이 도움이 되셨다면 개발을 지원해 주세요!

<a href="https://ko-fi.com/Q5Q41SR5WO"><img src="https://storage.ko-fi.com/cdn/kofi2.png?v=3" height="36" alt="ko-fi" /></a>

## 📄 라이선스

MIT License

---

**윈도우 전환으로 아이디어를 잃지 마세요.** 🚀

*Made with ❤️ for developers who think faster than their agents run*
