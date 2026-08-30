# Quick Prompt が存在する理由

[繁體中文](../zh-TW/PHILOSOPHY.md) | [日本語](./PHILOSOPHY.md) | [한국어](../ko/PHILOSOPHY.md) | [简体中文](../zh-CN/PHILOSOPHY.md) | [English](../PHILOSOPHY.md)

AI が与えてくれる並列性が大きくなるほど、それを監督する人間にかかる直列化のプレッシャーも大きくなります。この考えは [COSCUP 2026](https://coscup.org/2026/session/9CYHJT/) で発表されました：*AI Runs Faster, So Why Are Developers Getting More Lost?*

## Quick Prompt とは何か

Quick Prompt は、あなたの IDE の中に住むスクラッチパッドです。スニペットライブラリとクリップボード履歴を組み合わせたもので、エージェントがまだ動いている間にふと思いついたことのためにあります。

## その瞬間がなぜ大事なのか

エージェントがタスク N を実行している間、あなたの頭の中はたいていもうタスク N+1 に移っています。その考えを置いておく場所は自分の頭の中しかなく、結局忘れてしまうか、エージェントを中断して自分の作業の流れまで断ち切ってメモを取ることになります。これは自制心の問題ではなく、欠けているインフラの問題です。ここ数年、私たちはエージェントのためのコンテキストばかり磨いてきて、それを監督する人間のためにはほとんど何もしてきませんでした。

Quick Prompt がある理由は、その考えを頭の外に置ける場所を作ることです。書き留めて、手元の作業を続けて、あとで戻ってくればいい。

## より大きな全体像の中で

Quick Prompt が担うのはこの問題の時間的な半分です：次に何をするつもりだったか。仲間の [VirtualTabs](https://github.com/winterdrive/VirtualTabs)（[理念](https://github.com/winterdrive/VirtualTabs/blob/main/docs/ja/PHILOSOPHY.md)）が担うのは空間的な半分：複数のタスクが並行する中でワークスペースのどこにいるか。[Edo Tensei](https://github.com/Pain-Labs/Edo-Tensei) が担うのは三つ目の部分：エージェントやクォータが尽きたときに、セッションのコンテキストを次の IDE へ運ぶことです。

三つ合わせると、「三つの VS Code 拡張機能」というより、同じ問いに対する三つの答えと言えます：エージェントが実行のより多くを引き受けるようになるとき、人が方向を見失わないために本当に必要なものは何か。
