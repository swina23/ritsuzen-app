# 立禅の会記録アプリ

弓道の20射会の記録を効率的に管理するWebアプリケーションです。従来の手書き・Excel作成業務を自動化し、リアルタイムでの記録入力と結果表示を実現します。

**🌐 デプロイ済みアプリ**: https://ritsuzen-app.vercel.app

## 🎯 主要機能

### ✅ 実装済み機能
- **大会設定**: 大会名、日付、ハンデ機能の有効/無効設定
- **参加者管理**: 氏名・段位（初段〜8段）の登録、並び替え、削除
- **記録入力**: 20射会（5立×4射）のタップ入力、立選択
- **リアルタイム集計**: 立計・総計・的中率の自動計算
- **順位表示**: 同順位対応、ハンデ調整前/後順位
- **Excel/CSV出力**: 大会結果の詳細な出力機能
- **データ管理**: LocalStorage永続化、Export/Import機能
- **レスポンシブデザイン**: タブレット・スマホ・PC対応

## 🛠 技術構成

- **フロントエンド**: React 18 + TypeScript
- **ビルドツール**: Vite
- **スタイル**: CSS3（レスポンシブデザイン）
- **状態管理**: React Context API
- **データ永続化**: LocalStorage
- **ファイル出力**: SheetJS (xlsx)
- **デプロイ**: Vercel
- **型安全性**: TypeScript strict mode

## 🚀 セットアップ

### 前提条件
- Node.js (v18以上)
- npm または yarn

### インストール
```bash
# リポジトリをクローン
git clone https://github.com/swina23/ritsuzen-app.git
cd ritsuzen-app

# 依存関係をインストール
npm install

# 開発サーバーを起動
npm run dev
```

ブラウザで http://localhost:5173/ を開いてアクセスできます。

## 📖 使用方法

### 1. 大会設定
- 大会名、開催日を設定
- ハンデ機能の有効/無効を選択
- 「大会を作成」ボタンで次のステップへ

### 2. 参加者登録
- 参加者の氏名と段位を入力
- ハンデが自動計算されて表示
- 必要に応じて参加者の削除も可能

### 3. 記録入力
- 立選択（1立目〜5立目）
- 各参加者の射撃結果を○×でタップ入力
- リアルタイムで立計・総計が自動更新

### 4. 結果表示
- 順位表（調整前順位・ハンデ調整後順位）
- 詳細記録（立別の射撃結果）
- 的中率の表示
- Excel/CSV出力機能

### 5. データ管理
- 大会履歴の確認
- データのExport/Import
- ストレージ使用量の確認

## 🎨 スクリーンショット

（今後スクリーンショットを追加予定）

## 📊 データ構造

20射会の記録は以下の形式で管理されます：

```typescript
interface Competition {
  id: string;
  name: string;
  date: string;
  type: '20' | '50';
  status: 'created' | 'inProgress' | 'finished';
  handicapEnabled: boolean;
  participants: Participant[];
  records: ParticipantRecord[];
}
```

## 🏹 背景

従来の弓道大会では記録をExcelで手動作成していました。
このアプリケーションにより以下の課題を解決します：

- **記録入力の効率化**: 手書き → タップ入力
- **計算の自動化**: 手計算 → 自動集計・順位計算
- **リアルタイム更新**: Excel作成 → 即座の結果表示
- **ミスの削減**: 計算エラー・転記ミスの防止
- **データ管理**: 永続化・バックアップ機能

## 📝 ライセンス

© 2025 hirosetomohiko All rights reserved.

---

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>