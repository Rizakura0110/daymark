# Progress

## Phase 20: 別repositoryと接続用stub

### 実施内容・採用判断

- public Git repositoryと`private: true`のworkspace packageを用意した。npmには公開しない。
- browser/server/contracts/schemaを分け、非機密の接続用stubだけを実装した。業務機能・UI・table・migrationは作っていない。
- Node.js 24.19.0・pnpm 11.22.0、固定依存、7日gateを基盤と揃えた。単独clone用lockfileとread-only CIを追加した。
- 基盤が認証とHTTP、D1、migration、deployを担当し、このrepositoryへproduction設定や資格情報を持ち込まない。

### 変更ファイル

- `src/`の4 entrypoints、`test/`、package・TypeScript・Vitest・Biome・pnpm設定
- `.github/workflows/quality.yml`、`.gitignore`、README、作業規約

### コマンド・検証結果

- `pnpm install --frozen-lockfile`: pass
- `pnpm check`: format、lint、TypeScript、2 files・8 tests、coverage、宣言付きbuild、auditがpass
- stub coverage: statements/branches/functions/lines各100%（分岐なし）
- 単体audit: 既知脆弱性なし
- schemaが空、業務・認証・networkへの依存がないことをtestで確認
- Wranglerはworkerd/worker/browser条件を同時に使うため、`workerd`をbrowser拒否より先に解決する。Nodeの条件付きexport回帰testを追加し、browser単独は拒否する。

### 未解決事項・後続gate

- 基盤側の固定commit取得・browser build境界・認証・実HTTP・既存記事を含む統合検証は基盤のPhase 20記録で管理する。
- 習慣機能・UIはPhase 21冒頭で所有者と設計する。本番deploy・remote DB操作は行っていない。

## Phase 21: 習慣のデータ・API基盤

### 合意仕様

- 1日単位の習慣だけを扱い、チェック式と数値式を用意する。数値は0〜10億、小数3桁まで、単位と「以上/以下」の達成条件を持つ。
- 日付境界は日本時間。今日と過去の記録を作成・修正・削除でき、未来は拒否する。未入力と明示的な未達を区別する。
- 状態は有効・休止・アーカイブ。休止・アーカイブ中と未来日は達成率の分母から除く。
- 目標・単位・比較条件・状態の変更は今日以降の適用日を持つversionとして保存し、過去の評価を変えない。習慣の種類は変更しない。
- 週は月曜〜日曜の日別・習慣別集計、月は各日の達成集計を返す。週途中で作成した習慣は作成日以降だけを対象にする。

### 実施内容

- Zodによるcreate/rename/configuration/record/day/week/month契約と安全な上限を追加した。
- clock、ID生成、repositoryを注入するdomain serviceへ、JST日付、3桁固定小数の整数保存、達成判定、履歴解決、日/週/月集計を実装した。
- `daymark_habits`、`daymark_habit_versions`、`daymark_records`のDrizzle schema、CHECK/UNIQUE/index/cascadeを定義した。migration履歴は基盤repositoryだけが所有する。
- unit testで契約、schema、日付境界、設定履歴、チェック/数値判定、休止、未来拒否、週/月集計、異常データを検証した。

### 境界と後続

- 認証、HTTP handler、D1 adapter、migration、実D1・実HTTP検証は基盤側Phase 21で管理する。
- browser entrypointは引き続き準備中表示だけとし、画面・PWAはPhase 22、製品別backupはPhase 23へ分けた。
- production deploy、remote migration、Cloudflare resource・課金設定の変更は行っていない。

### 検証結果

- format、lint、TypeScript、宣言付きbuildが成功した。
- 5 files・38 testsがpassし、coverageはstatements/branches/functions/linesすべて100%。
- `pnpm audit --audit-level high`は既知脆弱性0件。
- schemaの数値上限とcheck recordのNULL境界は、基盤の実local D1 gateでも検証する。

## Phase 22: 日・週・月画面と習慣管理UI

### 実施内容

- 基盤から注入する`DaymarkClient`だけを使うReact画面を`app` entrypointとして追加した。Cloudflare、認証、D1、Tech Inboxのsourceは参照しない。
- 日本時間の今日を基準に、日次のチェック・数値入力、過去日移動、記録削除、達成率を表示する。
- 月曜始まりの週tableと、暦月の各日を達成率で表示する月カレンダーを追加した。
- チェック式・数値式の習慣追加、名称・目標・単位・達成条件・有効/休止/アーカイブ変更をdialogで操作できる。
- desktop固定sidebarとmobile bottom navigationを持つresponsive構成にし、入口へ戻る通常linkを用意した。
- browser entrypointは準備中定数から、入口で使う製品名・説明へ変更した。

### 境界・検証

- `app`をbrowser build許可entrypointへ追加し、`server`・`schema`がclientへ混入しないVite境界を維持した。
- 日付helperと画面component testを追加し、7 files・43 testsがpassした。domain・契約・日付処理のcoverageはstatements/branches/functions/linesすべて100%。React画面はcomponent testと基盤側desktop/mobile E2Eで検証する。
- format、lint、TypeScript、宣言付きbuildがpassし、依存監査は既知脆弱性0件だった。
- Reactは基盤と同じ19.2.8をpeerにし、単体test用依存も既存baselineの完全versionへ揃えた。

### 基盤側・次フェーズ

- 認証済みHTTP client、HTML、manifest、icon、document routing、PWA metadata、統合E2Eは基盤repositoryのPhase 22で管理する。
- production deploy・remote migration・Cloudflare resource変更は行っていない。Daymark backup・復元はPhase 23へ残す。

## Phase 23: 製品別JSONバックアップ・復元

### 実施内容

- `product: "daymark"`とschema version 1を持つ専用形式へ、習慣、設定履歴、日次記録を参照整合付きで保存する契約を追加した。Tech InboxのJSONはDaymarkとして受け付けない。
- 既存値を更新・削除しない復元計画を実装した。習慣IDの衝突は未使用IDへ割り当て直し、同じ日付の設定履歴・記録が同値なら一致、値が異なる場合は現在値を残してスキップする。
- 同一backupの再投入は重複を作らない。previewと確定は同じ計画処理を使い、追加・一致・競合・ID再割り当て件数を返す。
- 画面へ設定navigation、JSON download、4 MiB以下のlocal file検証、preview、明示確認、復元結果を追加した。認証情報やTech Inboxの記事は含めない旨を表示する。
- backup件数上限を習慣200、設定履歴2,000、日次記録20,000とし、整合性違反またはpretty-print後4 MiB超過時は書き出しを明示的に停止する。黙った切り捨ては行わない。

### 境界・検証

- backupの形式・merge判断・UIはDaymark repositoryが所有し、HTTP認証、D1読書き、Content-Disposition、request body上限は基盤repositoryが担当する。
- merge plan、ID衝突、同一fingerprintの複数習慣、競合skip、冪等性、不正参照、ID枯渇、export上限をunit testで検証した。8 files・64 testsがpassし、domain・契約・日付・backup処理のcoverageは全指標100%を維持した。
- React設定画面はcomponent testと基盤側desktop/mobile E2Eで、download、file選択、preview、確認、復元完了を検証する。
- production deploy、remote migration、Cloudflare resource・課金設定変更は行っていない。Phase 24の統合互換確認を次に行う。
