# Quick Prompt가 존재하는 이유

[繁體中文](../zh-TW/PHILOSOPHY.md) | [日本語](../ja/PHILOSOPHY.md) | [한국어](./PHILOSOPHY.md) | [简体中文](../zh-CN/PHILOSOPHY.md) | [English](../PHILOSOPHY.md)

AI가 제공하는 병렬성이 커질수록, 그것을 감독하는 인간에게 가해지는 직렬화 압력도 커집니다. 이 생각은 [COSCUP 2026](https://coscup.org/2026/session/9CYHJT/)에서 발표되었습니다: *AI Runs Faster, So Why Are Developers Getting More Lost?*

## Quick Prompt가 뭔가

Quick Prompt는 당신의 IDE 안에 사는 스크래치 패드입니다. 스니펫 라이브러리와 클립보드 히스토리를 합친 것으로, 에이전트가 아직 돌아가고 있는 동안 문득 떠오른 생각을 위한 자리입니다.

## 그 순간이 왜 중요한가

에이전트가 작업 N을 실행하는 동안, 당신의 머릿속은 이미 작업 N+1로 넘어가 있는 경우가 많습니다. 그 생각을 둘 곳은 당신 머릿속밖에 없고, 결국 잊어버리거나 에이전트를 멈추고 자신의 흐름까지 끊으면서 적어야 합니다. 이건 자제력의 문제가 아니라 빠져 있는 인프라의 문제입니다. 지난 몇 년간 우리는 에이전트를 위한 컨텍스트만 다듬어 왔고, 그걸 감독하는 사람을 위해서는 거의 아무것도 하지 않았습니다.

Quick Prompt가 있는 이유는, 그 생각을 머릿속 밖에 둘 곳을 만들어주기 위해서입니다. 적어두고, 하던 일을 계속하고, 나중에 돌아오면 됩니다.

## 더 큰 그림 속에서

Quick Prompt가 다루는 건 이 문제의 시간적 절반입니다: 다음에 뭘 하려고 했는지. 동반자인 [VirtualTabs](https://github.com/winterdrive/VirtualTabs)([철학](https://github.com/winterdrive/VirtualTabs/blob/main/docs/ko/PHILOSOPHY.md))가 다루는 건 공간적 절반: 여러 작업이 병렬로 진행될 때 워크스페이스의 어디에 있는지. [Edo Tensei](https://github.com/Pain-Labs/Edo-Tensei)가 다루는 건 세 번째 조각: 에이전트나 쿼터가 소진됐을 때 세션의 컨텍스트를 다음 IDE로 옮기는 것.

셋을 합치면 "세 개의 VS Code 확장"이라기보다, 같은 질문에 대한 세 가지 답에 가깝습니다: 에이전트가 실행을 더 많이 떠맡게 될수록, 사람이 방향을 잃지 않으려면 실제로 뭐가 필요한가.
