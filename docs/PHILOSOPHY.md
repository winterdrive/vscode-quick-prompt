# Why Quick Prompt Exists

[繁體中文](zh-TW/PHILOSOPHY.md) | [日本語](ja/PHILOSOPHY.md) | [한국어](ko/PHILOSOPHY.md) | [简体中文](zh-CN/PHILOSOPHY.md) | English

The more parallelism AI gives us, the more serialization pressure it puts on the human supervising it. This idea was presented at [COSCUP 2026](https://coscup.org/2026/session/9CYHJT/): *AI Runs Faster, So Why Are Developers Getting More Lost?*

## What Quick Prompt is

Quick Prompt is a scratch pad that lives inside your IDE — a snippet library plus clipboard history, there for the moment you think of something while an agent is still running.

## Why that moment matters

While an agent is executing task N, your mind has usually already moved on to task N+1. There's nowhere to put that thought except your own head, which means it either gets forgotten, or you interrupt the agent and break your own flow just to write it down. That's not a discipline problem, it's a missing piece of infrastructure — we've spent the last few years engineering context for agents and barely anything for the person supervising them.

Quick Prompt exists to give that thought somewhere to go that isn't your head: capture it, keep working, come back to it later.

## Part of a bigger picture

Quick Prompt handles the temporal half of that problem: what you were about to do next. Its companion [VirtualTabs](https://github.com/winterdrive/VirtualTabs) ([Philosophy](https://github.com/winterdrive/VirtualTabs/blob/main/docs/PHILOSOPHY.md)) handles the spatial half: where you are in a workspace running multiple tasks in parallel. [Edo Tensei](https://github.com/Pain-Labs/Edo-Tensei) handles a third piece: carrying a session's context to the next IDE when an agent or quota runs out.

Put together, they're less "three VS Code extensions" and more three answers to the same question: as agents take on more of the execution, what does a person actually need to stay oriented?
