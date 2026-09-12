# Figmaコンポーネントから画面へ

2026-09-12。サーバーの主要テスト通過後、画面を作る前に`components/primitives.tsx`、`game.tsx`、`feedback.tsx`を実装した。部品はpropsとイベントだけを持ち、HTTP・WSやセッション進行を直接操作しない。次の工程で画面がそれらを組み合わせ、コマンドへ接続する。

| 実装部品 | Figma |
| --- | --- |
| Button / Navigation / RoleIcon / Avatar | 3:29 / 3:74 / 66:2 / 3:95 |
| Identity / AnswerCard | 111:2030〜111:2059 / 3:59 |
| QuestionHeading / AnswerMemo / ResponseStatus | 47:539 / 62:2 / 3:101 |
| TopicRow / SortableTopic | 11:2 / 114:2081 |
| GuessRow / PredictionCompletion / RevealRow | 3:86 / 86:7 / 13:2 |
| 投稿・削除Modal | 14:358 / 115:2244 |
| 補助UI | 157:2のP01〜P05 / P07〜P09とMobile版。P06は後に不採用 |

Noto Sans JPとNunitoはローカル配信。Tablerの採用名はDESIGN_CONTRACTに従う。匿名シンボルの線形は指定された変更として扱う。折り返し用紙とQのしっぽはFigmaから取得したSVGを利用し、用紙の角はborder-imageの9分割で保つ。JSXへ生成コードを貼らず、同じ値を通常のCSSへ転記する。

動的な人名・本文・人数は定義済みの欄に渡す。PCで未選択の回答者ボタンと選択済み閲覧者ボタンは、Mobileの既定文言「切り替える」「参加中」を使う。未定義の通知テキストは追加しない。補助UIは承認済み提案の文言だけを表示する。

この記録は実装構造の記録であり、Figmaとの全画面一致・実機受入が済んだという意味ではない。

ブラウザ実表示でTablerの`IconDiamondFilled`が宝石形になることを確認したため、匿名Cのひし形は`IconSquareRotatedFilled`へ修正した。指定意図の「適切なTabler」を優先し、採用表も更新。PCの2ブラウザによる投稿→一斉公開→予想→採点→振り返り→再プレイが通過し、その後Mobile配置を追加した。

最終調整ではMobileの進行ボタンを縦配置とし、履歴選択はQマーカー付きの新しい順の一覧、回答者選択は2列グリッドにした。PC / Mobileの表示構成だけを切り替え、コマンドと履歴データを共有する。履歴再試行は失敗した読み込みだけを繰り返す。
