# GitHubへのコード保存

2026-09-12、ユーザー指定でGit管理を開始し、GitHubのhoward12721/pittanへ保存する。ユーザー指定に従い、新規リポジトリはpublicとする。

ソース、package-lock.json、テスト、開発・検証スクリプト、配信用SVGとライセンス、Docker設定、設計資料を管理する。本番の実行物はNode 24でビルドする。開発用fixtureは既存のDEV分岐により本番bundleには含まれない。

環境変数の実値、認証用ファイル、DBとSQLite sidecar、暗号化バックアップ、node_modules、dist、ログ、ブラウザ画像・検証出力、エディタとエージェントのローカル設定は.gitignoreで除外する。空の.env.exampleは起動手順に必要なので含める。Dockerのbuild contextも同じ種類のローカルデータを除外する。

アップロードはコードの保存であり、自宅サーバーへのデプロイではない。Discord実機と公開環境の未検証事項は005-verification.mdを参照する。
