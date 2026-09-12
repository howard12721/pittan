# pittan 通信・コマンド契約

設計日: 2026-09-12。実装前の契約。全体方針は[ARCHITECTURE.md](../ARCHITECTURE.md)。

## 1. 接続の確立

1. ReactがDiscord SDKを生成し、readyを待つ。
2. SDKのauthorizeを最小scopeのidentifyで実行する。guilds、email、メッセージ取得権限は初期機能に不要。
3. POST /api/auth/discordへcodeを送る。サーバーが自身のclient secretでtoken交換し、Discord REST APIで本人を確定する。
4. サーバーはSDK authenticateに必要なDiscord access tokenと、pittan用のランダムなsessionTokenを返す。両方ともCache-Control: no-store。Discord refresh tokenは保存せず、user access tokenも本人確認後はサーバーの永続DBに保存しない。
5. クライアントはSDKのauthenticateを完了する。pittan sessionTokenはJSメモリだけに保持し、URL・localStorage・ログへ書かない。ページを開き直したらSDK認証をやり直す。
6. POST /api/rooms/joinにBearer sessionTokenとSDKのinstanceIdを送る。サーバーがDiscordのActivity Instance APIでapplicationと本人の在室を検証し、roomId・memberIdを割り当てる。
7. POST /api/rooms/:roomId/ws-ticketでroomに拘束された一回用ticketを取得する。
8. 同じoriginの/wsへ接続し、最初のフレームでauthenticateを送る。認証成功後だけ接続をroomに登録し、snapshotを受け取る。

ブラウザのWebSocketは任意のAuthorizationヘッダーを設定できないため、ticketを最初のフレームに入れる。クエリ文字列へ秘密を入れない。認証前は5秒・1フレーム・8KiBに制限し、状態や参加者情報を返さない。/wsのOriginは自分のActivity Proxy originを許可するが、Originだけでは認証成立としない。

| 認証データ | 寿命・保存 |
| --- | --- |
| Discord code | 一回の交換のみ。再利用拒否 |
| pittan sessionToken | 暗号学的乱数256bit、8時間。DBにはSHA-256 hashと本人ID・期限だけ |
| WS ticket | 30秒、一回限り、roomId・memberId・auth sessionに拘束。サーバーメモリにhashだけ。再起動時は再取得 |
| 接続の本人情報 | サーバー側connection context。メッセージのactorIdでは変更できない |

sessionTokenが期限切れなら再度SDK認証する。既存WSも期限到来で再認証へ移行させる。認証の失敗をローカル開発用ユーザーへ自動フォールバックしてはいけない。

SDKの認可・token交換フローは公式ガイドに従う。WS開始後の各メッセージはHTTPのmiddlewareを通らないため、毎回入力・権限を検査する。[Discord認証](https://docs.discord.com/developers/activities/building-an-activity)、[Fastify WebSocket](https://github.com/fastify/fastify-websocket)

## 2. Discord在室の検証

- roomへの新規入室とWS ticket発行時にActivity Instance APIを検証する。
- usersに本人が含まれること、application_idが自アプリであること、instance_idが対象と一致することを確認する。クライアントのparticipants一覧は証明に使わない。
- 同じroomの検証をまとめ、成功した一覧を最大15秒だけキャッシュする。キャッシュに未登録の入室者が来た場合は再取得する。入室直後の反映遅延は最大10秒の再試行として扱い、検証を省略しない。
- 活動中は60秒ごとにroom単位で再確認する。usersから消えた人の接続を失効させる。本人の明示的退出と同じく接続状態を更新する。
- 429はRetry-Afterに従う。5xx時、新規入室は再試行画面へ。既に検証済みの接続には最大5分の猶予を与え、それを超えたら変更操作を止めて再認証を要求する。
- 404は既存Activityが終了したものとして扱い、別のinstanceIdへゲームを自動コピーしない。

Activity Instance APIはBot tokenを用い、現在の参加者IDを取得できる。BotのGateway接続や音声へのBot参加はこの構成には不要。[Discord Multiplayer](https://docs.discord.com/developers/activities/development-guides/multiplayer-experience)、[Activity Instance](https://docs.discord.com/developers/resources/application#get-application-activity-instance)

## 3. HTTP

| Method / Path | 入力・出力 | 認証 |
| --- | --- | --- |
| POST /api/auth/discord | code → sessionToken、SDK用access token、expiresAt | 認可code。rate limit |
| POST /api/rooms/join | instanceId → roomId、memberId、currentSessionId | Bearer + Discord在室確認 |
| POST /api/rooms/:roomId/ws-ticket | → 一回用ticket、expiresAt | Bearer + room在室確認 |
| GET /api/rooms/:roomId/snapshot | → RoomView | Bearer + room membership |
| GET /api/rooms/:roomId/sessions/:sessionId/history | view、subject、cursor、limit → HistoryView | Bearer + room membership + current session |
| GET /health/live | liveness | 内部利用 |
| GET /health/ready | DBとschemaのreadiness | 内部利用 |

ゲーム状態を書き換える操作はWSのcommandに一本化する。HTTPとWSに別々の提出処理を作らない。すべての認証・ゲームAPIはno-store。履歴も共有CDNにキャッシュさせない。

## 4. WSの外形

```json
{
  "type": "command",
  "wireVersion": 1,
  "commandId": "client-generated-uuid",
  "sessionId": "server-issued-session-id",
  "name": "answer.submit",
  "payload": {
    "topicId": "server-issued-topic-id",
    "expectedVersion": 0,
    "text": "深夜のラジオDJ。"
  }
}
```

roomId・memberIdは認証済み接続から取得する。host権限・匿名IDをpayloadに入れさせない。未知フィールドもstrict schemaで拒否する。type=authenticate / command / sync.requestだけを受け付ける。

```json
{
  "type": "ack",
  "wireVersion": 1,
  "commandId": "client-generated-uuid",
  "status": "applied",
  "appliedRevision": 42
}
```

拒否時はstatus=rejected、errorCode、必要なら対象versionを返す。違反した相手の非公開情報はerror詳細にも入れない。

- snapshotはrevisionを含む本人向けRoomView。受信済み以下のrevisionは破棄する。
- ACKは操作がcommit済みであることを示す。画面データはsnapshotから更新する。
- ACKのrevisionより古いsnapshotしかなければpendingを維持し、2秒でsync.requestを送る。
- ACKはcommit後に先に送り、その後に更新したsnapshotを配信する。配信の欠落はsnapshotの再取得で解決する。
- commandIdは論理的な1操作につき一つ。再送時は同じID・payloadを使う。新しいユーザー操作には新しいIDを発行する。
- 同じcommandIdでpayloadが変わった場合はCOMMAND_ID_REUSED。request_hashで検出する。
- wireVersionが非対応ならUPDATE_REQUIREDを返す。更新完了まで書き込みしない。

## 5. RoomView

以下は論理的な型定義。実装時はZodからTypeScriptの型を導出する。

```text
RoomView
  wireVersion, roomId, revision, serverTime
  sessionId, phase, phaseVersion, queueVersion, historyVersion
  host: { memberId, epoch }
  members: [{ memberId, displayName, avatarInitial, role, online }]
  respondents: [{ memberId, displayName, username, avatarInitial }]
  identities: [{ anonymousId, symbolKey }]
  topics: [{ topicId, text, status, displayNumber, roundNumber? }]
  currentRound: null | {
    topicId, roundNumber, submittedCount, requiredCount,
    publishedAnswers?: [{ anonymousId, text }]
  }
  guessing: { eligibleCount, completedCount }
  result?: { identities: [{ anonymousId, memberId }] }
  me: {
    memberId, memberVersion, role, isHost, myAnonymousId?, guessEligible,
    submission?: { topicId, text, submitted, version },
    prediction?: { choices, completed, version },
    score?: { correct, total }
  }
```

membersとrespondentsの配列順は匿名割当から独立。identitiesにmemberIdを加えてよいのはREVEALEDのresult内だけ。myAnonymousIdは本人分のみ。responseにDBの連番answerIdや提出時刻を含めない。

提出・取消の途中は公開件数だけが変化する。誰が今提出したか、Aが提出済みか、などの通知は作らない。完了者一覧も返さず人数だけとする。

RoomViewはcurrent sessionだけを含み、過去お題の回答本文は含めない。通常fixtureは64KiB以内を目標とし、特殊な結合文字を最大限入れた場合も絶対上限512KiB以内にする。利用者別privateフィールドも含め、実データのUTF-8 byte数でテストする。表示名などDiscordからのデータにも最大256 UTF-8 byteの表示用上限を設ける。

## 6. 履歴取得

- view=topic / subject=topicId: 公開済みのお題と、匿名ID順の全回答を返す。
- view=respondent / subject=anonymousId: その匿名IDの公開済み回答をroundNumber順に返す。初回20件、最大50件、cursorで続きを取得できる。
- REVEALEDでは同じ応答へmemberId・displayName・avatarInitialを付加する。
- current未公開のお題、他room、旧sessionの要求は拒否する。
- 応答にはsessionId、historyVersion、visibility（anonymous / revealed）を付ける。
- clientのキャッシュキーはsessionId + visibility + view + subject + cursor。historyVersionが変わればinvalidateする。
- current sessionの変更時は旧履歴キャッシュを破棄する。遅れて到着した旧sessionのHTTP応答は描画しない。
- GUESSINGでは履歴選択を変えても右の予想パネルをunmountしない。

小規模・読み取り中心なので、最初はReactの単純な取得hookとキー付きキャッシュで十分。非同期キャンセルと応答キーの照合は必須とする。

## 7. コマンドと権限

H = 現在のホスト、M = 参加者、R = セッション開始時の回答者、G = GUESSING開始時の予想対象者。すべてにcurrent session確認を行う。

| コマンド | 誰 | フェーズ / 条件 | payloadの要点 |
| --- | --- | --- | --- |
| role.set | M | LOBBY | role、expectedMemberVersion |
| topic.create | M | LOBBY / ANSWERING / DISCUSSING | text |
| topic.reorder | H | 同上、queuedだけ | orderedTopicIds、expectedQueueVersion、hostEpoch |
| topic.delete | H | 同上、queuedだけ | topicId、expectedQueueVersion、hostEpoch |
| session.start | H | LOBBY、2人以上・お題あり | expectedPhaseVersion、expectedQueueVersion、hostEpoch |
| answer.submit | R | ANSWERING、currentのお題のみ、未提出 | topicId、text、expectedVersion |
| answer.withdraw | R | ANSWERING、自分の提出済み回答 | topicId、expectedVersion |
| round.next | H | DISCUSSING、queuedがある | expectedPhaseVersion、expectedQueueVersion、hostEpoch |
| guessing.start | H | DISCUSSING | expectedPhaseVersion、hostEpoch |
| prediction.save | G | GUESSING、未完了 | choices全体、expectedVersion |
| prediction.complete | G | GUESSING、全枠有効 | choices全体、expectedVersion |
| prediction.reopen | G | GUESSING、完了済み | expectedVersion |
| results.reveal | H | GUESSING、全員完了または明示確認 | expectedPhaseVersion、hostEpoch、allowIncomplete |
| session.restart | H | REVEALED。新LOBBYを作成 | expectedPhaseVersion、hostEpoch |

権限判定はUIのボタン表示とサーバーで同じ条件を使うが、UIの条件を信頼しない。全員退出による自動中断とホスト移譲はサーバー内部の処理であり、任意の人がhost.claimを送れるAPIは設けない。

### ロールとversion

memberのロール変更にはroom_members.versionを保持する。開始時の名簿はsession_membersに固定し、開始後のロール変更で書き換えない。

answerの初期versionは0。提出・取消ごとに増やす。予想はprediction_status.versionで全体を管理する。queueは並べ替え・作成・削除・次のお題への確定で増やす。phaseVersionはゲーム進行時、hostEpochはホスト交代時、room revisionは成功した状態変更時に増やす。

全操作にroom revisionの完全一致を要求しない。そうすると他人の提出だけで自分の回答が古いと判定される。編集対象のversionと、必要なphase/queue/hostだけを比較する。

## 8. 競合の確定規則

| 競合 | 正しい結果 |
| --- | --- |
| 最後の提出と取消 | DBで先にcommitした操作に従う。公開後は取消不可 |
| 同じ回答の二重送信 | 同じcommandIdは同じACK。異なるIDはversionで拒否。回答数は1件 |
| D&D中にお題が投稿された | queueVersion不一致で並べ替えを拒否。最新一覧へ戻し、再操作してもらう |
| お題削除と次のお題開始 | 先のtransactionだけ成立。currentのお題は削除不可 |
| 予想保存と完了 | completeはchoices全体を一緒に確定。保存ACK待ちの間は完了操作を制御し、古いversionは拒否 |
| 予想完了と結果発表 | 結果発表が先なら後続の予想変更を拒否。結果は一度だけ採点 |
| ホスト交代と旧ホストの操作 | hostEpochと実行者を再検証し、旧権限を拒否 |
| 再プレイ後に古い操作が再送された | SESSION_CHANGED。新しいゲームには適用しない |
| DB commit後、ACK前にクラッシュ | receiptと更新が同じtransactionで残る。再送で二重適用しない |

D&Dはドラッグ中だけローカルの順序を表示し、drop時に全queued IDを一度送る。サーバーは「重複なし・不足なし・追加なし・全IDが同じsessionのqueued」を検証する。拒否時に古い配列を再適用せずsnapshotへ戻す。

PCのマウス・キーボード、MobileのタッチD&Dは同じtopic.reorderを使う。ハンドルを掴む、匿名IDタブを切り替える、選択シートを開く、画面幅が変わる、といった操作はサーバーのフェーズを変更しない。

Mobileで1人の予想を変更するときも、保持しているchoices全体へ変更を適用してprediction.saveを送る。表示していない行を空欄へ初期化しない。予想候補はmemberIdで識別し、公開前の回答者履歴はanonymousIdで取得する。この2種類の選択シートから正解の対応表を推定できるDTOを作らない。

## 9. エラーと再送

| errorCode | UI動作 |
| --- | --- |
| UNAUTHENTICATED / AUTH_EXPIRED | 再認証。入力下書きを維持 |
| NOT_IN_INSTANCE | 入室確認画面。ゲームデータを表示し続けない |
| FORBIDDEN | snapshotを取得し、失った権限の操作を閉じる |
| SESSION_CHANGED / PHASE_CHANGED | 最新のプレイ画面へ。古い操作を新IDで自動送信しない |
| VERSION_CONFLICT | 編集元を再取得。本人の入力を保持して再操作可能にする |
| INVALID_INPUT | Figma P05の失敗表示。入力は維持 |
| ROOM_FULL / RESPONDENTS_FULL / TOPIC_LIMIT | 上限を短く表示 |
| RATE_LIMITED | P08の上限・操作間隔の表示。独自のカウントダウンは追加しない |
| STORAGE_UNAVAILABLE | 成功扱いにせず再試行可能にする |
| UPDATE_REQUIRED | P01を表示して変更操作を停止。独自の更新案内文言は追加しない |

ACKまたは初期snapshotを10秒待って届かなければ接続を作り直し、P02を表示する。同じcommandIdで再送可能なのは通信結果が不明な場合だけ。自動再接続は最大5回。失敗後も結果不明の操作IDを保持し、P01の再試行で同じIDを再送する。明示的にrejectedになった操作を勝手に繰り返さない。receiptの保持期間はsessionの有効期間と同じとし、古いsessionからの操作は新sessionへ流れない。

Mobileの前景復帰時は接続と認証を再確認し、snapshotでroom/session/phase/versionを合わせてから変更操作を再開する。古い履歴リクエストの応答はsessionId・選択IDを照合し、別の画面へ適用しない。WebViewが破棄されcommandIdを失った場合は本人の確定データを読み直し、古い入力を新しい操作として自動再送しない。

## 10. 入力・保存・送信量

- 文字数はIntl.Segmenterのgrapheme単位。CRLFはLFへ正規化し、本文にUnicode正規化や勝手なtrimを適用しない。全空白かの検査だけtrimを使う。
- 回答140、お題80grapheme。結合文字を大量に並べた入力も制限するため、各テキストのUTF-8上限は4KiB。先にbyte数を検査してからgraphemeを数える。フロントの文字数は補助、サーバー判定を正とする。
- textareaのIME変換中にEnterで送信しない。Enterは改行、送信はボタンを基本にする。
- 未送信の下書きはsessionStorageにroomId/sessionId/topicIdで保存する。回答公開・再プレイ・終了で削除する。保存できない環境ではメモリへ縮退する。
- 下書きは他端末へ同期しない。提出後に取消した場合の本文はサーバーの本人用submissionから復元できる。
- PC / Mobileのレイアウト切替・シート開閉は下書きの破棄条件ではない。キーボード表示や通常のバックグラウンド化でも保持するが、OSによるWebView破棄後にsessionStorageが残ることまでは保証しない。
- client→serverの通常フレームは16KiB以下。1人10 command/秒、burst 20、topic.createは5回/分。初期の運用値として設定可能にする。
- 1人3WS接続、1room96接続まで。匿名ユーザーの接続は別枠で強く制限する。
- socket.bufferedAmountが1MiBを超えた接続は切断し、snapshot再同期へ誘導する。遅い1人のために他人への配信を待たせない。
- 本文はプレーンテキストとして表示し、HTMLを解釈しない。SQLにも文字列連結で入れない。
- command receiptに本文や予想を保存しない。request_hashはサーバー内部に限定する。
- 認証リクエスト、WSの先頭ticket、本文、予想、匿名対応をaccess logや例外ログから除外する。

## 11. ローカル開発

通常ブラウザでの開発は明示的なdevelopment設定でだけDevDiscordAdapterを使用する。公開用ビルドと本番サーバーに任意ユーザー指定の入口を含めない。テスト用の部屋とDBも本番から分離する。

Discord内の試験は別の開発用Discord ApplicationとURL Mappingを用意し、認証・在室確認・WS再接続を同じ実装経路で通す。APIをmockしたE2EだけでDiscord対応完了とは判定しない。
