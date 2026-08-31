# Daymark

習慣管理のための製品module。現在はPhase 20の接続用stubだけで、習慣の機能・UI・業務DBは未実装です。Phase 21冒頭に所有者と設計してから実装します。

## 基盤との関係

[rizakura-hontai](https://github.com/Rizakura0110/rizakura-hontai)からGit submoduleとして取り込みます。npm公開は不要で、packageは`private: true`です。基盤がcommit SHAを固定し、統合test後に承認を得てまとめてdeployします。Daymarkへのpushだけでは本番は変わりません。

- `browser`: 準備中の表示用定数のみ
- `contracts`: 非機密の接続確認用型のみ
- `server`: DBや認証値を要求しない接続用関数
- `schema`: 空のschema。migrationは基盤だけが管理

`server`と`schema`はbrowser条件でexportを拒否する宣言を持ちます。基盤は型検査とVite plugin・実build testでもclient混入を拒否します（bundlerによるnull条件の解釈差に依存しません）。Cloudflare Worker設定、資格情報、実データ、別の本番DB・deploy commandはありません。

## 開発・品質確認

Node.js 24.19.0 / pnpm 11.22.0。基盤checkout内では基盤rootの`pnpm install --frozen-lockfile`後、`pnpm --dir modules/daymark check`で単体gate、基盤rootの`pnpm check`で組み合わせを検証します。

単独cloneではこのrepositoryにtool/cacheを配置して`pnpm install --frozen-lockfile`、`pnpm check`を実行します。CIも同じgateを実行します。format、lint、型検査、coverage付きtest、宣言付きbuild、high/critical auditを必須とします。Cloudflare生成型、D1、画面E2Eはまだ対象がなく、基盤側の統合gateが担当します。

Node.js/pnpmの配布物checksumはCIに固定し、第三者依存は完全version・公開後7日・integrity・install script制限を維持します。自作sourceはnpmへ登録せずGit review/testで管理します。
