# pittan Figma再現・画面契約

設計日: 2026-09-12。対象は[PC Figma](https://www.figma.com/design/tVG0kJxe65OymFPLthTqrk?node-id=3-2)と[Mobile Figma](https://www.figma.com/design/tVG0kJxe65OymFPLthTqrk?node-id=127-16)。PCを先行実装し、同じ機能のスマホ用配置を完成させる。

## 1. 再現の基準

**PCは1280×800、Mobileは390×844と360×640 CSS pxのActivity表示領域で、現在の採用画面の構成・余白・書体・図形・色・スクロール領域を合わせる。** アイコンは今回指定されたTablerの採用表を正本とする。Figmaとブラウザの描画器の差まで含む全環境での画素完全一致を、実装前に保証することはできない。確認条件を固定し、相違を検出・修正して採用baselineを作る。

画面の情報を追加して「それらしく」作り替えない。古いデザイン、比較ボード、過去handoffではなく、対象ノードの最新design context・実寸・書き出し画像を基準とする。

Figmaの画面は状態の見本であり、実行可能なゲームルールの正本ではない。ロール切替で待機画面へ直接飛ぶ遷移、5秒後の自動公開、固定された人数・文字数・回答者名は本番仕様へそのまま移さない。動的な数値は[ゲームルール](../ARCHITECTURE.md)と[通信契約](PROTOCOL.md)から計算する。

## 2. 画面と実装の対応

ホスト / 非ホストやA / Bで画面コードをコピーしない。同じscreen componentに権限・状態・表示データを渡す。

| Figmaの画面名 | nodeId | 実装 / 表示条件 |
| --- | --- | --- |
| 01 / ロビー | 3:100 | LobbyScreen / LOBBY |
| 02 / 回答を書く | 3:101 | AnswerScreen / ANSWERING、未提出の回答者 |
| 02b / 次のお題に回答する | 20:506 | 同じAnswerScreen、次のtopic |
| 03 / 公開待ち・回答者 | 15:361 | AnswerScreen、submitted=true、取消あり |
| 03 / 公開待ち・閲覧者 | 3:102 | AnswerScreen、role=viewer、取消なし |
| 04 / 回答公開・ホスト | 3:103 | DiscussionScreen / DISCUSSING、進行操作あり |
| 04b / 回答公開・閲覧者 | 19:402 | 同じDiscussionScreen、進行操作なし |
| 回答フェーズ / ホスト | 73:1185 | GuessingScreen / GUESSING、結果発表操作あり |
| 回答フェーズ / 閲覧者 | 75:715 | 同じGuessingScreen、結果発表待ち |
| 06 / 回答履歴 | 3:104 | HistoryScreen / view=topic |
| 06b / B の回答履歴 | 18:377 | 同じHistoryScreen / view=respondent |
| 07 / お題リスト・ホスト | 3:105 | TopicsScreen / manage=true |
| 07p / お題リスト・参加者 | 115:2027 | 同じTopicsScreen / manage=false |
| 07a / お題リスト・並べ替え後 | 115:2109 | 同じTopicsScreen / 確定した順序 |
| 07b / お題リスト・削除後 | 115:2177 | 同じTopicsScreen / 確定した削除 |
| 07d / お題リスト・ドラッグ中 | 119:2809 | 同じTopicsScreen / ローカルなdrag状態 |
| 08 / 正解発表 | 3:106 | ResultsScreen / REVEALED |
| 09 / 振り返り・お題ごと | 109:1509 | ReviewScreen / REVEALED、view=topic |
| 09b / 振り返り・回答者ごと | 109:1786 | 同じReviewScreen / view=respondent |
| 05 / お題を投稿 | 14:358 | TopicComposerDialog / 560×452 |
| 07c / お題を削除・確認 | 115:2244 | DeleteTopicDialog / 560×296 |

回答者も閲覧者も非ホストであれば管理操作を持たない。「閲覧者版」というFigma名を、そのまま権限の型にしない。ロールは回答できるか、ホストは進行できるか、という独立した軸で扱う。

### Mobileの対応表

ページ`127:16`の20通常画面・8シート画面は390×844。狭幅の4画面だけ360×640。PCと同じfeature・権限判定を使い、以下のMobileレイアウトを組み合わせる。[取得記録](design/figma-mobile-inventory-2026-09-12.json)

| Figmaの画面名 | nodeId | 表示構成 / 対応 |
| --- | --- | --- |
| M01 / ロビー | 136:168 | LobbyScreen、縦配置の参加者一覧 |
| M02 / 回答を書く | 134:2607 | AnswerScreen、伸縮するメモ、下部送信 |
| M02b / 次のお題に回答する | 135:51 | 同じAnswerScreen |
| M03 / 公開待ち・回答者 | 135:106 | 待機メモ、本人の提出取消 |
| M03 / 公開待ち・閲覧者 | 135:169 | 待機メモ、取消なし |
| M04 / 回答公開・ホスト | 137:302 | DiscussionScreen、カード1列・進行操作 |
| M04b / 回答公開・閲覧者 | 137:559 | 同上、進行操作なし |
| M05 / 回答フェーズ・ホスト・予想中 | 140:1460 | GuessingScreen、匿名ID横タブと選んだ人の履歴 |
| M05 / 回答フェーズ・閲覧者・予想中 | 140:1566 | 同上、ホスト操作なし |
| M05 / 回答フェーズ・ホスト・予想完了 | 140:1669 | 予想完了の取消、発表操作 |
| M06 / 回答履歴・お題ごと | 137:692 | HistoryBrowser、topic選択シート |
| M06b / 回答履歴・B | 137:946 | HistoryBrowser、anonymousId選択シート |
| M09 / 振り返り・お題ごと | 137:1034 | Review、topic選択シート |
| M09b / 振り返り・回答者ごと | 137:1375 | Review、実名付き回答者選択シート |
| M08 / 正解発表 | 137:1468 | ResultsScreen、正体・採点の縦一覧 |
| M07 / お題リスト・ホスト | 140:4041 | TopicsScreen、touch用ハンドル・削除 |
| M07p / お題リスト・参加者 | 140:4133 | 同上、管理操作なし |
| M07a / お題リスト・並べ替え後 | 140:4223 | 同上、確定した順序 |
| M07b / お題リスト・削除後 | 140:4315 | 同上、確定した削除 |
| M07d / お題リスト・ドラッグ中 | 140:4392 | 同上、ローカルなdrag状態 |
| M / お題を投稿 | 143:1823 | TopicComposerSheet、シート高456 |
| M / お題を削除しますか？ | 143:1841 | DeleteTopicSheet、シート高284 |
| M / 正解発表に進みますか？ | 143:1857 | RevealResultsSheet、シート高192 |
| M / お題を選ぶ（履歴 / 振り返り） | 143:1871 / 143:1959 | TopicPickerSheet、各シート高444 |
| M / 回答者を選ぶ（履歴 / 振り返り） | 143:1902 / 143:1990 | RespondentPickerSheet、各シート高444 |
| M / 正体を選ぶ | 143:2077 | PredictionPickerSheet、シート高724 |
| 360 / M02 / 回答を書く | 143:4413 | 360×640、メモ高さ236 |
| 360 / M05 / 回答フェーズ・ホスト・予想中 | 143:4437 | 360×640、履歴領域高さ182 |
| 360 / M06 / 回答履歴・お題ごと | 143:4485 | 360×640、内容領域のみ縦スクロール |
| 360 / M01 / ロビー | 143:4504 | 360×640、一覧末尾と開始操作への到達 |

シートの高さはサンプル内容・基準viewportの値。内容量、キーボード、セーフエリアに応じて上限を設け、中身をスクロールする。未完了者がいる結果発表では確認文と人数を追加してシートを伸ばす。履歴の回答者選択では公開前は匿名IDだけ、振り返りでは実名を表示する。予想候補の人名一覧に正解の匿名IDを付けない。

## 3. 共通部品

| 実装名 | Figma参照 | 契約 |
| --- | --- | --- |
| ActivityHeader | 3:74 | ブランド、プレイ・履歴・お題。REVEALEDで履歴ラベルを振り返りへ |
| NavigationTab | 39:17 / 39:5 | 選択線、文字色、キーボードフォーカス |
| Button | 3:29 / 3:31 / 3:33 | Primary / Secondary / Quiet。送信待ちでも幅を変えない |
| RoleIcon | 66:2 / 66:8 | 回答者は鉛筆、閲覧者は目 |
| ParticipantRow | 3:95 | 表示名、イニシャル、役割アイコン。「あなた」は追加しない |
| AnonymousIdentity | 111:2030〜111:2059内の10部品 | アルファベットとTabler Filled。下の表の図形対応を維持 |
| QuestionMarker | 47:539 | Q + roundNumber。吹き出し形状を元データから使用 |
| FoldedMemo | 62:2 | 入力・待機で同じ背景。実際の入力はtextareaを重ねる |
| AnswerCard | 3:59 | A案の匿名カード。履歴リンクと本文 |
| ReviewAnswerCard | 108:1109 | 名前・アバター・匿名ID付き。公開前には使わない |
| HistoryBrowser | 81:35 / 108:1132 / 108:1160ほか | phase × view × densityをpropsで表す共通部品 |
| GuessRow | 3:86 | 匿名IDと人物選択。自分の行は固定 |
| PredictionCompletion | 86:7ほか | 完了人数、完了ボタン、完了取消 |
| TopicRow | 11:2 / 114:2081 | 表示番号、本文、任意のdragハンドル・削除 |
| IdentityRevealRow | 13:2 | 匿名IDと正体の対応 |
| PlayerAvatar | 103:12 | 丸枠の寸法を維持。2026-09-12のユーザー指定でDiscordプロフィール画像を表示し、読込失敗時は既存のイニシャルに戻す |
| MobileBrandHeader | 128:2 | 上部ブランド48px。画面切替は下部へ |
| MobileBottomNavigation | 139:1359 / item 150:65 | アイコン24px、ラベル12px、操作領域64px + 実セーフエリア |
| MobileQuestion / FoldedMemo | 128:25 / 129:15 / 129:2290 | Qは48px、本文18/28、折り返し32px、待機と共通背景 |
| MobileResponseStatus | 129:2299 | 高さ44px、進捗件数と投稿ボタン |
| MobileIdentityTab | 138:32 | 64×48、gap 8、横スクロール、シンボル20px |
| MobilePredictionCompletion | 138:69 | host × completed。高さ90、下部操作固定 |
| MobileTopicRow | 132:22 | サンプル高さ104。ハンドル・削除の操作領域44×44 |
| MobileHistoryBrowser | 131:415 / 131:2458 / 131:2546 / 131:2727 | playing/review × topic/respondent。PCと同じデータ、索引はシートへ |

```text
HistoryBrowser
  layout: desktop | mobile
  phase: playing | review
  view: topic | respondent
  density: standalone | embedded
  selectedTopicId / selectedAnonymousId
  topicIndex / respondentIndex / selectedHistory
  onChangeView / onSelectTopic / onSelectRespondent
```

phaseはラベルだけでなく受け取れるデータ型も切り替える。reviewカードへ必要な実名データをサーバーが未公開時に送らない構造にする。

| ID | 図形 | Figma nodeId | 採用するTabler |
| --- | --- | --- | --- |
| A | 三角 | 111:2030 | IconTriangleFilled |
| B | 丸 | 111:2033 | IconCircleFilled |
| C | ひし形 | 111:2036 | IconSquareRotatedFilled |
| D | 星 | 111:2039 | IconStarFilled |
| E | ハート | 111:2042 | IconHeartFilled |
| F | 月 | 111:2045 | IconMoonFilled |
| G | 花 | 111:2049 | IconFlowerFilled |
| H | 稲妻 | 111:2052 | IconBoltFilled |
| I | 雲 | 111:2055 | IconCloudFilled |
| J | 葉 | 111:2059 | IconLeafFilled |

匿名IDの定義を1か所に置き、カード・横タブ・履歴・予想・結果で同じ対応を使う。A〜Jはセッション内で固定。画面や端末によって別の図形に切り替えない。

## 4. 寸法とCSS

実寸は2026-09-12にFigmaの対象インスタンスから取得した。マスターのサイズと画面上のサイズを混同しない。

| 要素 | 1280×800での寸法 |
| --- | --- |
| ヘッダー | 高さ80、左右padding 32、タブ幅128、選択線4 |
| 入力 / 回答公開 / お題のcontent | 高さ720、padding 48 |
| 入力メイン / 補助欄 | 幅896 / 256、gap 32 |
| 折り返しメモ | 896×412、背面紙のずれ8、折り返し48 |
| 履歴content | padding 32、内側1216×656 |
| 単独HistoryBrowser | 幅1216、sidebar 360、gap 24、detail 832 |
| 予想content | padding 32、HistoryBrowser 904、gap 24、予想欄288 |
| 予想内HistoryBrowser | sidebar 208、gap 24、detail 672 |
| 予想欄 | padding 20、内部幅248、予想リスト高さ400、gap 8 |
| 振り返り | HistoryBrowser 1216×584、下部操作48、gap 24 |
| お題一覧 | 中央幅960、現在のお題96、待機中の行80、行gap 12 |
| QuestionMarker | 80×80、上部68、吹き出し下部12 |
| Button | 高さ48、角丸8、枠2。幅は各インスタンスの指定を使用 |
| Answer Card / Review Cardのマスター | 400×192 / 400×216。画面上の幅はGridに追従 |

Auto Layoutはflex/grid、FILLはmin-width:0とflex/minmax、独立したスクロール領域はmin-height:0 + overflow:autoへ変換する。文字をabsolute座標へ大量に置かない。紙の折り返し・図形など装飾の重ね合わせに限ってabsoluteを使う。

AnswerCardの本文は改行を保持し、長いURLや連続英数字を折り返す。通常時はFigmaの高さを保ち、140文字が収まらない場合はカードを伸ばし、一覧のスクロールで全内容を読めるようにする。本文を無断で省略して完全再現と扱わない。

一覧全体と予想欄は独立してスクロールする。10人の最後の行、最後のカード、待機中のお題の末尾が操作可能であることを必須にする。スクロールで一部が画面外に出ることと、内容がクリップされて到達できないことを区別する。

### PCとMobileの可変幅

- 1280×800を画像比較の基準にする。
- 1280以上では余白・レイアウトを保ちつつ本文領域を伸ばす。過度に長い行を避け、アプリ内の最大幅を1600にする。
- 1024〜1279では外側paddingを32へ、履歴sidebarを単独280 / 埋め込み168へ縮める。予想欄は最低248を維持。カード領域の幅が512未満なら2列から1列へ。
- 1024×640をPC最小の機能確認条件とする。高さが不足する場合は内容をスクロールさせ、操作ボタンを画面から消さない。
- 360〜1023ではMobile構成を使う。390×844と360×640がFigma比較の基準。390より広い領域も一列を維持し、本文の最大幅は600、中央寄せとする。ブランド・下部ナビ・シートの背景は全幅を保つ。
- 360未満や極端に低い領域は補助的な表示条件とし、文字の一括縮小をせず、一覧とフォームのスクロールで対応する。PIP/gridでは簡潔な進行表示とfocusedへの復帰案内を使う。
- ページ全体をtransform:scaleで縮小して操作文字を小さくする実装は採用しない。Discord内のiframe実寸に合わせ、必要ならResizeObserverで領域変化を追う。

1024の切替位置、最大幅、基準間の可変幅ルールは今回の設計判断。3種類の基準寸法以外のFigma画面が揃っているという意味ではない。

### Mobileの固定領域と入力

| 要素 | 390×844の実寸 / 実装規則 |
| --- | --- |
| 上部ブランド | 高さ48、左右16、ロゴ24/32 |
| content | 高さ712、padding 16、gap 16、内側幅358 |
| 下部ナビ | 3等分、各130×64。Figmaの下20pxはセーフエリアの例 |
| 入力画面 | Q行64、進捗44、メモ440、文字数20、送信48 |
| 入力メモ | 最小高さ180、padding 24、本文18/28、折り返し32。360×640では幅328・高さ236 |
| 予想画面 | 見出し36、匿名IDタブ48、予想行56、履歴386、完了操作90 |
| 予想の狭幅確認 | 360×640では履歴領域182、他の操作の高さを保持 |
| 履歴 | 単独の内側358×680、振り返り358×616。索引ボタン48、カード1列 |
| シート | 全幅、上角丸24、上・左右16、下24、gap20、見出し行48 |

shellは利用可能な高さを使うgrid/flexで「上部・伸縮する内容・下部ナビ」を分ける。ボタン群は内容領域の下端に残し、一覧・本文だけをスクロールさせる。固定領域を本文に重ねて最後の行を隠さない。匿名ID横タブは縦スクロールと独立し、選んだ項目を見える位置へ移動する。

`--discord-safe-area-inset-*`を優先し、未提供時は`env(safe-area-inset-*, 0px)`を使う。ナビ高は`64px + bottom inset`。20pxをさらに加算しない。Figma画像比較では上・左右0、下20のfixtureを注入する。シート下paddingは`max(24px, bottom inset)`、上限高は利用可能領域からtop insetを除いて計算する。[Discord Mobile](https://docs.discord.com/developers/activities/development-guides/mobile)

初期の高さは`100dvh`を使い、iframeのresizeとVisualViewportのresize/offsetを監視して、ソフトキーボードに隠れない利用可能領域を決める。同じ縮小分を二重に引かない。高さが足りない入力中はメモの最小高さを守ったまま質問・入力側をスクロール可能にし、送信と閉じる操作を可視領域に残す。フォーカス中のtextareaを再mountせず、IMEの変換・選択範囲を維持する。実際のキーボード挙動はiOS / AndroidのDiscordで確認する。

長いお題はQ行を必要な高さへ伸ばす。取得コード中の予想見出し`width:776`は390幅の外にはみ出す固定値なので、文字スタイルを維持して`width:100%; min-width:0`へ変換する。Figmaの見た目と到達可能性を基準とし、見えていない余分な幅を再現しない。

## 5. トークンとフォント

Figma変数のcodeSyntaxをそのままCSS変数名に使う。主な値は以下。全値は[取得JSON](design/figma-inventory-2026-09-12.json)を参照。

| CSS変数 | 値 | 用途 |
| --- | --- | --- |
| --pittan-bg | #FFFFFF | 背景 |
| --pittan-panel | #F5F9FF | 淡いパネル |
| --pittan-raised | #E6F1FF | 行・選択欄 |
| --pittan-border | #C8D9EC | 枠 |
| --pittan-text | #192C43 | 本文 |
| --pittan-muted | #566B82 | 補助文字 |
| --pittan-accent | #37A1FF | 明るい青・装飾 |
| --pittan-action | #0875E1 | ボタン・選択状態 |
| --pittan-action-hover | #0666C7 | hover |
| --pittan-action-pressed | #0754A3 | pressed |

spacingは4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64、radiusは8 / 12 / 16 / 24 / 999。全インスタンスを単一の角丸や余白へ揃え直さない。history/topic-index-widthはモード208 / 360をCSSのdensity属性へ明示的に対応させる。

書体はNoto Sans JP（400 / 500 / 700）とNunito（800）。フォントを自前で配信し、出典・ライセンス・ファイルhashを記録する。日本語フォントは全文字を含む配布またはunicode-range付きの分割を使い、サンプルの文字だけのsubsetにしない。

Figmaの代表的なtext styleはDisplay 64/70、Logo 32/38、Heading 28/40、Title 20/30、Body 16/26、Label 14/22、Small 13/20、Micro 11/18（font-size/line-height）。入力本文20/32などのローカル指定はtext styleより優先して取り込む。ブラウザの既定line-height、疑似Boldに依存しない。

### Tablerの採用契約

操作・ナビ・役割のアイコンは`@tabler/icons-react`のOutlineを使う。匿名IDは前掲のFilled。2026-09-12に配布版3.46.0の型定義で下表とA〜Jのexport名が存在することを確認した。実装時は採用バージョンをlockfileで固定する。公式Reactパッケージはsize・stroke・colorを指定でき、ES modulesによるtree shakingに対応する。[Tabler React](https://github.com/tabler/tabler-icons/blob/main/packages/icons-react/README.md)

| 用途 | 採用アイコン | 表示規則 |
| --- | --- | --- |
| プレイ | IconDeviceGamepad2 | Mobile navigation 150:48、24px |
| 回答履歴 / 振り返り | IconHistory | Mobile navigation 150:51、24px |
| お題 | IconMessage | Mobile navigation 150:54、24px |
| 回答者 / 閲覧者 | IconPencil / IconEye | RoleIcon。Figmaの各配置寸法を維持 |
| お題投稿 | IconPlus | 文字の「＋」をSVGへ。文言は「お題」「投稿」など元のまま |
| 閉じる | IconX | 「×」をSVGへ。44pxの操作領域 |
| 削除 | IconTrash | 既存のアイコン枠に使用。「削除」ラベルは維持 |
| 並べ替え | IconGripVertical | ハンドルだけに配置。44×44の操作領域 |
| 選択を開く | IconChevronDown | 「⌄」をSVGへ。ボタンの文言と間隔を維持 |
| 履歴への移動 | IconChevronRight | 「›」をSVGへ。文字リンクの高さと整列を維持 |

Outlineは`stroke={2}`、`color="currentColor"`を基本とし、ナビは24px、文中の補助記号は16pxを初期値にする。匿名図形はFilledのまま、配置に応じて20 / 24 / 32pxを使う。選択色はaction、非選択はmuted。タブの淡い背景・ラベル・余白もFigmaと合わせる。

必要なコンポーネントをnamed importし、用途の有限な対応表を置く。ライブラリ全体をnamespace importして任意文字列で探す方式、CDNからの実行時取得、アイコンフォント、絵文字は使わない。アイコンだけのボタンは親に日本語のaccessible nameを付け、装飾SVGは`aria-hidden`にする。隣接するA〜Jやラベルをスクリーンリーダーで重複して読ませない。

TablerのMITライセンス表記を配布物のライセンス一覧へ含める。既存`design/icons/respondent.svg`と`viewer.svg`は参照資料として保持し、実装では上記RoleIconへ統一する。ブランド、折り返しメモ、Qの吹き出し形状はFigma固有のSVGを使用し、実装時にnodeId・hash・取得日をmanifestへ記録する。

Figma既存の輪郭とTablerの輪郭の差は、今回の指定による意図的な変更として記録する。アイコン名・size・strokeと各配置の比較画像を残し、周囲のレイアウト差まで許容しない。Figmaファイル自体のアイコン置換はこの設計更新では行わない。

## 6. 操作と補助状態

- ボタンはbutton、入力はtextarea、モーダルはdialogなど意味のあるHTMLを使う。Figma参照コードのdivをそのまま押せる部品として扱わない。
- モーダルにはフォーカス制御、Escape、キャンセル、閉じた際のフォーカス復帰を用意する。投稿失敗時は入力を残す。
- Mobileの選択・投稿・確認はBottomSheetで提示する。背景の操作・スクロールを止め、見出しをaccessible nameにする。選択後は閉じて元のトリガーへ戻す。外側タップ・閉じる・キャンセルは確定操作にならず、投稿下書きも保持する。シートから別シートを重ねない。
- GuessRowのメニューは画面内で位置を調整し、スクロール枠にクリップされない層へ表示する。Tab・矢印・Enterで選べること。候補の使用済み状態を区別する。同じ表示名の人がいる場合だけ候補に@usernameを併記し、memberIdで選択を管理する。
- D&Dは左端のハンドルで開始する。削除ボタンでドラッグを開始させない。ドラッグ中の浮いたカードと青い挿入線を119:2809に合わせる。
- MobileのD&Dは140:4392を参照し、タッチの開始条件をハンドルに限定する。採用したdnd-kit 0.5.0の既定値は長押し250ms・移動許容5px。一覧本文の通常スワイプはスクロールに使い、端のauto-scroll、pointer cancel、drop取消、44pxハンドルを検証する。dropまで通信せず、同じtopic.reorderを1回送る。
- キーボードでもハンドルを掴み、上下移動・確定・取消できるようにする。常設の上下ボタンは復活させない。[dnd-kit sensors](https://dndkit.com/react/guides/sensors/)
- 折り返しメモの待機背景は入力と同じ部品を使う。提出済みチェックを追加しない。取消ボタンは本人が回答者でsubmittedのときだけ。
- 回答カードの「履歴」は同じanonymousIdの回答者別HistoryBrowserへ移動する。内部IDを文字の表示値から逆算しない。
- focus-visible、disabled、pendingは既存トークンで表現する。動きは主にCSSを使い、reduced motionへ対応する。

### Figmaにまだないが実装に必要な状態

| 状態 | 初期方針 |
| --- | --- |
| 認証中 / 認証失敗 / 在室確認中 | 起動画面。ゲームの内容を先に出さない |
| お題0件 / 履歴0件 | 既存パネル内に短い空状態。開始ボタンの無効化 |
| 人数不足 / 上限 / 投稿制限 | 操作付近の簡潔な理由 |
| 送信中 / 入力エラー | 幅を変えず送信状態を示す。本文を保持 |
| 再接続中 / 権限変更 | 小さな接続表示。未確定操作はpending |
| 未完了者を残して発表 | Mobile 143:1857を基に人数・確認文を補う。PCは同じ内容の確認モーダル |
| 全員退出 | UI操作を置かず、Discordの全員退出確認後に自動中断。未公開回答は公開しない |
| 再プレイの確認 | 前ゲームを閉じることを示す |
| PCの予想候補の開いた状態 | Mobile 143:2077と同じ候補・選択状態を、PC用popoverで提示 |
| キーボード表示 / PIP / grid | 前述の可視領域調整と進行表示。ゲーム状態は変えない |

これらは新しい補助状態として検証する。通常のFigma画面に常時説明を足したり、通信実装の用語を出したりしない。

## 7. 一致を判定する手順

1. 実装に着手する対象ノードのdesign context、実寸、フォント、変数、PNGを同じ時点で取得する。
2. PC 19画面・2モーダル、Mobile 20画面・8シート・狭幅4画面の計53参照をmanifestへ登録し、nodeId、取得日、fixture、viewport、safe-area、画像hash、Tablerの採用名と寸法を記録する。PNGは1x。PCモーダルは自然寸法と画面内表示を用意する。
3. 元画像をそのまま置いたモックではなく、実際のReact部品へ固定fixtureを渡す。人数、名前、改行、選択項目、スクロール位置をFigmaと合わせる。
4. フォント読み込み完了、同じviewport、DPR 1、locale ja-JP、時刻固定、アニメーション停止でブラウザ画像を取得する。
5. Figma PNGとブラウザ画像を50% overlay・差分画像・部品のbounding boxで確認する。主要ボックスの差は1 CSS px以内を目標とし、改行・欠落・列数の違いは許容しない。
6. 文字のアンチエイリアス差、Tablerへの指定変更、実際のレイアウト差を分けて判断する。未解決差分がない状態を初回baselineとしてレビューする。Figmaと異なるブラウザ画像を自動承認しない。Tablerの変更はアイコン単位で記録し、領域全体をmaskしない。
7. 採用後は固定Linux / Chromium / font環境でPlaywrightの画像回帰テストを実行する。maxDiffPixels=100を初期値とし、理由なく許容率を増やさない。動的データはfixture化し、画面の大部分をmaskしない。
8. Discord Desktop / Web / iOS / Android内で再度操作し、フォント、実寸、resize、modal/sheet、候補リスト、D&D、スクロール、ソフトキーボードとセーフエリアを確認する。

Playwrightの画像は実行OS・ブラウザ・フォントによって変わるため、CIの画像比較環境を固定する。[Playwright visual comparisons](https://playwright.dev/docs/test-snapshots)

### 完了条件

- 計53参照すべてにnodeIdとの対応と比較画像がある。
- 共通部品の修正が入力・待機・履歴・予想・振り返りへ一貫して反映される。
- A〜J・図形・Q番号が混同されず、画面間で同じ対象を指す。
- 10人分と長文が最後まで読めて、クリック・キーボード・タッチ操作が届く。
- 1280×800、390×844、360×640の一致確認に加え、PCの1024×640・1440×900・1600×900とMobileの430×932・768×1024・844×390、切替境界1023/1024pxで操作できる。
- 入力中・予想中のresizeやシート切替で本文・choices・選択IDが失われず、二重送信・二重接続にならない。
- iOS / AndroidのDiscordで入力、下部ナビ、末尾の選択肢、バックグラウンド復帰を確認する。ブラウザの端末エミュレーションだけで代替しない。
- 未公開データを送らないサーバーの実データでも同じUIが成立する。
- Figmaとの比較、画像回帰、Discord内実機検証のいずれも未完了のまま「完全再現」と報告しない。

## 実装時の確定事項

ユーザー承認済み補助UIは提案ページ157:2のP01 / P02 / P03 / P04 / P05 / P07 / P08 / P09と各Mobile版。P06 / P10 / P11は不採用。FigmaのPC結果画面ではお題タブを表示し、PC振り返りとMobile結果・振り返りでは二つのタブにする。初回比較の記録は[005-verification](design-docs/005-verification.md)。
