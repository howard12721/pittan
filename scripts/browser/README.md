# ブラウザ検証

各JSはPlaywright CLIの`run-code --filename`に渡す`async (page) => { ... }`です。アプリで使わないブラウザテスト用パッケージをdependenciesへ追加しない構成にしています。

Node 24で`DEV_AUTH=true npm run dev`を先に起動します。Playwright CLIが利用できる環境では、次のように実行します。

```sh
mkdir -p output/playwright
playwright-cli --session pittan open http://127.0.0.1:5173 --browser chrome
playwright-cli --session pittan run-code --filename scripts/browser/game-flow.js
playwright-cli --session pittan run-code --filename scripts/browser/game-flow-mixed.js
playwright-cli --session pittan run-code --filename scripts/browser/queue-resilience.js
playwright-cli --session pittan run-code --filename scripts/browser/touch-queue.js
playwright-cli --session pittan run-code --filename scripts/browser/text-bounds.js
playwright-cli --session pittan run-code --filename scripts/browser/capture-all.js
playwright-cli --session pittan run-code --filename scripts/browser/capture-feedback.js
```

- `game-flow`: 独立した2 contextで提出・匿名公開・予想・採点・振り返り・再プレイ。
- `game-flow-mixed`: PCとMobile幅を同じ部屋へ接続。Mobile候補シートから予想。
- `queue-resilience`: マウス・キーボードの並べ替え、削除キャンセル・確定、再読み込み後の下書き、通信復帰。
- `touch-queue`: Chromiumのタッチ入力でハンドルを長押しし、並べ替え後のサーバー保存順を確認。
- `text-bounds`: 80文字のお題、140文字の回答、32文字の表示名を使い、3サイズ×6画面でカード内とdocumentのはみ出しを確認。
- `capture-all`: visual-manifestの53状態を撮影。Mobileの下セーフエリア20pxを注入。fixtureは読み取り専用なので、ドラッグ状態では保存せずEscapeで終了。
- `capture-feedback`: 承認済み補助UI8種類×2サイズを撮影。

出力は`output/playwright/`です。固定fixtureでの画像確認と、実際のゲーム操作テストを区別します。Figmaの更新時は`docs/design/visual-manifest.json`と撮影ケースを同時に更新し、差分を目視確認してください。現段階ではpixel-diffを合否判定する固定baselineは登録していません。DiscordのiframeやiOS / Android実機の代替にはなりません。
