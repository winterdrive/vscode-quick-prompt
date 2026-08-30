# 為什麼會有 Quick Prompt

[繁體中文](./PHILOSOPHY.md) | [日本語](../ja/PHILOSOPHY.md) | [한국어](../ko/PHILOSOPHY.md) | [简体中文](../zh-CN/PHILOSOPHY.md) | [English](../PHILOSOPHY.md)

AI 給我們的平行處理能力越多，加諸在監督者身上的序列化壓力就越大。這個論點在 [COSCUP 2026](https://coscup.org/2026/session/9CYHJT/) 講過：*AI 跑得越快，我們反而越容易在螢幕前迷路？*

## Quick Prompt 是什麼

Quick Prompt 是一個活在你 IDE 裡的便條紙，片段庫加上剪貼簿歷史，專門留給 Agent 還在跑的時候，你突然想到的那個念頭。

## 為什麼那個瞬間很重要

Agent 在執行任務 N 的時候，你的腦子通常已經跳到任務 N+1 了。那個念頭沒地方放，只能待在你自己腦子裡，結果不是被忘掉，就是逼你中斷 Agent、打斷自己的節奏去把它寫下來。這不是自律的問題，是少了一塊基礎建設，這幾年我們一直在為 Agent 打磨 context，卻幾乎沒為監督的人做什麼。

Quick Prompt 存在的理由，就是讓那個念頭有地方去，不用留在腦子裡：先記下來，繼續手上的事，之後再回頭處理。

## 放進更大的脈絡裡看

Quick Prompt 顧的是時間那一半：你接下來想做什麼。它的搭檔 [VirtualTabs](https://github.com/winterdrive/VirtualTabs)（[理念](https://github.com/winterdrive/VirtualTabs/blob/main/docs/zh-TW/PHILOSOPHY.md)）顧的是空間那一半：多工並行時你人在工作區的哪裡。[Edo Tensei](https://github.com/Pain-Labs/Edo-Tensei) 顧第三塊：Agent 或額度用完的時候，把這個 session 的脈絡帶去下一個 IDE。

三個放一起看，與其說是三個 VS Code 擴充套件，不如說是同一個問題的三種處理方式：當 Agent 接手越來越多執行工作時，人要維持方向感，到底需要什麼。
