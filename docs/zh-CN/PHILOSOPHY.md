# 为什么会有 Quick Prompt

[繁體中文](../zh-TW/PHILOSOPHY.md) | [日本語](../ja/PHILOSOPHY.md) | [한국어](../ko/PHILOSOPHY.md) | [简体中文](./PHILOSOPHY.md) | [English](../PHILOSOPHY.md)

AI 给我们的并行处理能力越多，加诸在监督者身上的串行化压力就越大。这个论点在 [COSCUP 2026](https://coscup.org/2026/session/9CYHJT/) 讲过：*AI 跑得越快，我们反而越容易在屏幕前迷路？*

## Quick Prompt 是什么

Quick Prompt 是一个活在你 IDE 里的便签纸，片段库加上剪贴板历史，专门留给 Agent 还在跑的时候，你突然想到的那个念头。

## 为什么那个瞬间很重要

Agent 在执行任务 N 的时候，你的大脑通常已经跳到任务 N+1 了。那个念头没地方放，只能待在你自己脑子里，结果不是被忘掉，就是逼你中断 Agent、打断自己的节奏去把它写下来。这不是自律的问题，是少了一块基础设施，这几年我们一直在为 Agent 打磨 context，却几乎没为监督的人做什么。

Quick Prompt 存在的理由，就是让那个念头有地方去，不用留在脑子里：先记下来，继续手上的事，之后再回头处理。

## 放进更大的脉络里看

Quick Prompt 顾的是时间那一半：你接下来想做什么。它的搭档 [VirtualTabs](https://github.com/winterdrive/VirtualTabs)（[理念](https://github.com/winterdrive/VirtualTabs/blob/main/docs/zh-CN/PHILOSOPHY.md)）顾的是空间那一半：多任务并行时你人在工作区的哪里。[Edo Tensei](https://github.com/Pain-Labs/Edo-Tensei) 顾第三块：Agent 或额度用完的时候，把这个 session 的上下文带去下一个 IDE。

三个放一起看，与其说是三个 VS Code 扩展，不如说是同一个问题的三种处理方式：当 Agent 接手越来越多执行工作时，人要维持方向感，到底需要什么。
