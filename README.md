# Daymark

習慣管理のための製品module。Phase 21で、日次のチェック・数値記録、JST基準の達成判定、履歴集計、契約schema、domain service、DB schemaを実装しました。画面とDaymark専用PWAはPhase 22で基盤へ統合します。

## 基盤との関係

[rizakura-hontai](https://github.com/Rizakura0110/rizakura-hontai)からGit submoduleとして取り込みます。npm公開は不要で、packageは`private: true`です。基盤がcommit SHAを固定し、統合test後に承認を得てまとめてdeployします。Daymarkへのpushだけでは本番は変わりません。

- `browser`: Phase 22まで準備中の表示用定数のみ
- `contracts`: 習慣・記録・日/週/月集計の入力と応答schema
- `server`: 日付、達成判定、設定履歴、集計を扱うdomain serviceとrepository interface
- `schema`: `daymark_`接頭辞の習慣・設定履歴・記録table定義。migrationは基盤だけが管理

`server`と`schema`はbrowser条件でexportを拒否する宣言を持ちます。基盤は型検査とVite plugin・実build testでもclient混入を拒否します（bundlerによるnull条件の解釈差に依存しません）。Cloudflare Worker設定、資格情報、実データ、別の本番DB・deploy commandはありません。

## 開発・品質確認

Node.js 24.19.0 / pnpm 11.22.0。基盤checkout内では基盤rootの`pnpm install --frozen-lockfile`後、`pnpm --dir modules/daymark check`で単体gate、基盤rootの`pnpm check`で実D1・実HTTPを含む組み合わせを検証します。

単独cloneではこのrepositoryにtool/cacheを配置して`pnpm install --frozen-lockfile`、`pnpm check`を実行します。CIも同じgateを実行します。format、lint、型検査、coverage付きtest、宣言付きbuild、high/critical auditを必須とします。Cloudflare生成型、D1 migration、HTTP認証、画面E2Eは基盤側の統合gateが担当します。

Node.js/pnpmの配布物checksumはCIに固定し、第三者依存は完全version・公開後7日・integrity・install script制限を維持します。自作sourceはnpmへ登録せずGit review/testで管理します。
