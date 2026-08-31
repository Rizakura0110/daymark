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
