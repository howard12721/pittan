# pittan

Figmaを基準にしたDiscord Activity。React / TypeScript / ViteのUIと、Fastify / WebSocket / SQLiteのサーバーを一つのDockerイメージにまとめています。回答は全員提出後に一斉公開し、匿名の正体を予想して結果を振り返ります。

実装の方針は[ARCHITECTURE.md](ARCHITECTURE.md)、判断の履歴は[design-docs](docs/design-docs/)、実施済み・未実施の検証は[005-verification.md](docs/design-docs/005-verification.md)を参照してください。

## ローカル開発

Node.js 24を使用します。

```sh
npm ci
cp .env.example .env
```

`.env`の`DEV_AUTH=true`を設定して起動します。開発用認証はloopback限定で、本番モードでは起動時に拒否します。

```sh
npm run dev
```

- [参加者yui](http://127.0.0.1:5173/?room=local-room&user=yui)
- [参加者ren](http://127.0.0.1:5173/?room=local-room&user=ren)

別ウィンドウで2人を開き、回答者に切り替え、お題を投稿して開始します。最初の入室者がホストです。サーバーコードを変えたら開発プロセスを再起動してください。

Figma比較用の固定状態は`?fixture=lobby`、`?fixture=answer`、`?fixture=guessing-host`などで表示できます。名前と参照ノードは[visual-manifest.json](docs/design/visual-manifest.json)にあります。固定データは開発ビルドのみで読み込まれ、本番には含まれません。

## 自宅Linuxでの起動

`.env`で次を設定します。

| 変数 | 値 |
| --- | --- |
| `DISCORD_CLIENT_ID` | Discord Application ID |
| `DISCORD_CLIENT_SECRET` | 同じApplicationのOAuth secret |
| `DISCORD_BOT_TOKEN` | 同じApplicationのBot token。在室確認用 |
| `ALLOWED_ACTIVITY_ORIGIN` | `https://<Application ID>.discordsays.com` |
| `DEV_AUTH` | `false`。Composeもfalseを強制 |
| `BACKUP_KEY` | 暗号化用の32バイト鍵を64桁のhexで指定 |

鍵は`openssl rand -hex 32`で生成し、DBとバックアップとは別に保管します。`.env`は公開・コミットしません。

```sh
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:3000/health/ready
```

Composeは`127.0.0.1:3000`へ公開します。既存nginxからこのポートへHTTPSを中継し、`/ws`のWebSocket Upgradeと、20秒のheartbeatより長いtimeoutを有効にしてください。nginxを同じDockerネットワーク内で動かす場合は、その内部アドレスへ接続先を合わせます。

Discord Developer PortalでActivitiesを設定し、ルートのURL MappingをそのHTTPSホストへ向けます。`/api`、`/ws`、`/assets`を同じoriginで通します。Cookieや外部CDNへの依存はありません。実際のApplication・HTTPS公開先を使った動作確認は、このリポジトリのローカル検証とは別に必要です。

appは1プロセスで運用します。SQLiteの`pittan-data`と暗号化バックアップの`pittan-backups`はnamed volumeです。`docker compose down -v`はデータを消すため、通常の更新には使いません。

## バックアップと復元

稼働中の整合したSQLiteコピーを暗号化して保存します。

```sh
docker compose exec -T app node dist/server/server/backup.js
```

このコマンドの毎時実行と、`/backups`から別媒体への転送は自宅サーバーのスケジューラーへ登録してください。本ツールの7日超のバックアップは、次のバックアップ実行時に削除されます。自宅サーバーへのスケジュール設定はまだ行っていません。

復元は既存ファイルを上書きしません。まず新しいファイルへ暗号タグとDB整合性を検証して復元します。

```sh
docker compose stop app
docker compose run --rm --no-deps app node dist/server/server/backup.js restore /backups/<backup>.pittan /data/restored.sqlite
```

復元後はComposeの`DATABASE_PATH`を`/data/restored.sqlite`へ変更し、`docker compose up -d`で起動します。元のDBは動作確認まで残します。

更新時はバックアップ→app停止→新イメージ起動→readiness→Discord内で2人接続、の順で確認します。schema migrationは起動時に実行します。

## 検証コマンド

```sh
npm run typecheck
npm test
npm run build
node --import tsx scripts/load-smoke.ts
```

ブラウザ操作の再実行は[scripts/browser/README.md](scripts/browser/README.md)を参照してください。Figmaとの比較は53参照と採用済み補助UI16参照が対象です。

手動の中断操作はありません。全ソケットが切れ、Discordも全員退出を返した場合に進行中セッションを自動中断します。API障害や一時切断では続行します。開発認証ではDiscordがないため、15秒の猶予後に定期確認で中断します。
