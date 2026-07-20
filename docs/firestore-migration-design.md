# ritsuzen-app Firestore移行 実装設計書

> 作成日: 2026-07-20 / 検討段階の設計案（未着手）
> **改訂 2026-07-20**: ユーザーヒアリングにより前提が3点変更。以下を反映済み。
> 1. **1大会あたり使用端末は常に1台**（iPadを机に置いて順番に記録する運用）。複数端末での同時入力は行わない → 競合対策としてのrecordsサブコレクション分離は**不要**（4章）
> 2. **別URL（ritsuzen-app2 等）で並行稼働させる**方式を採用 → 切り戻し機構・保存先切替スイッチは**不要**、既存アプリは一切変更しない（8章）
> 3. 立禅の会用のGoogleアカウントは**既に存在する**。**2段階認証は未使用**のため、バックアップコードの準備は不要（13章）
> 4. 公開範囲は**立禅の会専用**。マルチテナント化は行わない（6章）

## 0. 現状整理（コード調査結果）

- `src/utils/StorageManager.ts` が唯一のシングルトンで localStorage 操作を集約。呼び出しは実測 **8ファイル20箇所**（`CompetitionContext.tsx` 4箇所、`dataExport.ts` 1箇所、`ParticipantSetup.tsx` 5箇所、`data-manager/`配下6ファイルで9箇所、`DangerSection.tsx`含む）で確認済み。全メソッドは**完全同期**。
- `CompetitionContext.tsx` は `useReducer` によるローカル状態が正で、`useEffect` で「`state.competition` が変わるたびに丸ごと `saveCurrentCompetition()`」という設計。進行中の大会は `currentCompetition` という別枠に保存され、`finishCompetition()` 時に初めて `competitions` 履歴配列へコピーされる。**進行中の大会は履歴に含まれない**という現行仕様は、通算的中率が「開催中の大会も含む」という要件と食い違うため、データモデル変更で解消する。
- `ParticipantSetup.tsx:109` 付近、`handleAddSelectedMasters` はマスターの `name`/`rank` のみコピーし `masterId` を引き継がない。
- `record.hitRate` は既に「実際に射た矢数（`hit !== null`）」を分母に計算済み（`calculations.ts` の `updateParticipantRecord`）。通算的中率もこの考え方をそのまま流用できるが、**通算値は「各大会のhitRateの平均」ではなく「全大会の的中合計 ÷ 全大会の射数合計」で計算する必要がある**（大会ごとに射数が違うため平均だとバイアスが出る）。
- Excel出力は `excelExport.ts` の `exportToExcelWithBorders()`。1大会につき1シート（シート名=大会日付）を生成する構造。「2枚目のシート」は既存のこの関数が作るワークブックに対して追加する形が自然。
- `firebase` パッケージは未導入。`vercel.json` はシンプルな static build 設定。`.gitignore` に `.env` 系の除外が無い（要追加）。

---

## 1. 全体アーキテクチャ方針

### 1.1 基本方針

- **StorageManagerの公開インターフェース（メソッド名・引数・戻り値の形）はできる限り変えない。** 内部実装だけを localStorage → Firestore に差し替える。
- **読み取りは同期API を維持する。** Firestoreの「オフライン永続化キャッシュ + `onSnapshot`」の仕組みを使い、StorageManager内部にメモリキャッシュを持たせる。起動時に一度だけ購読（subscribe）を開始し、以降の `getCompetitionHistory()` 等はそのメモリキャッシュから同期的に返す。呼び出し側20箇所のうち大半（読み取り系）は**無改修**で動く。
- **書き込みはFire-and-forget（非同期・投げっぱなし）にする。** Firestore SDKは書き込み時にまずローカルキャッシュを即時更新し、オンラインなら裏でサーバーに送る（オフラインならIndexedDBにキューイングして復帰時に自動送信）。呼び出し側は今まで通り `storageManager.saveXxx(...)` と書くだけでよく、`await` の追加は必須ではない。エラーは StorageManager 内で捕捉し、軽量な通知の仕組みで画面に伝える。
- **CompetitionContextの「毎回丸ごと保存」は、StorageManager内部で差分検出して粒度の細かい書き込みに変換する。** 呼び出し側は変えずに、内部でPrevキャッシュとの比較により「どの参加者のrecordが変わったか」を判定し、変更のあった参加者のrecordドキュメントだけを `updateDoc` する。これにより複数端末競合問題も同時に緩和できる。

### 1.2 なぜ「同期っぽいキャッシュ」方式にするか

20箇所すべてを `async/await` 化して呼び出し元でローディングスピナーを出す設計も可能だが、

- `StorageInfo.tsx` や `CompetitionHistorySection.tsx` のように**レンダー中に直接呼んでいる箇所**が複数あり、Promiseにすると渡す値の型が変わり呼び出し側の書き換えが避けられない
- ScoreInput（記録入力＝最も頻繁に叩かれる操作）で毎回awaitするとタップ→反映にラグが出て「入力体験」が悪化する（オフライン時は特に致命的）

という理由から、**「ローカルにキャッシュを持ち、読み取りは同期・書き込みは非同期投げっぱなし」**が、既存アーキテクチャと要件（オフライン継続入力）の両方に対して最小改修で済む現実的な解。これはFirestore SDK自身がオフライン永続化キャッシュで標準的に提供している挙動そのもの。

---

## 2. Firestoreデータモデル

```
competitions/{competitionId}
  name, date, type, status, handicapEnabled, enableRotation,
  roundsCount,
  participants[] (id, name, rank, order, group?, masterId?),
  records[]      (participantId, rounds[], totalHits, hitRate,
                  rank, handicap, adjustedScore, rankWithHandicap),
  createdAt, updatedAt

participantMasters/{masterId}
  name, rank, isActive, lastUsed, usageCount, createdAt
```

> **改訂**: 当初案では `records` を大会ドキュメント配下のサブコレクションに分離していたが、これは「複数端末が同時に別々の参加者を入力する」運用を想定した競合対策だった。実際の運用は**常に1台の端末**であることが判明したため、分離をやめ、現行の型定義（`Competition.records: ParticipantRecord[]`）をそのまま1ドキュメントに格納する**素直な構造**に変更する。既存コードの構造を変えずに済み、実装量が減る。サイズ面の余裕は2.3を参照。

### 2.1 「currentCompetition」という特別枠を廃止

現行の `currentCompetition`（進行中1件だけの別枠）と `competitions`（終了済み履歴）という二重構造をやめ、**全大会を作成した瞬間から `competitions` コレクションの1ドキュメントとして扱い、`status` フィールド（created/inProgress/finished）で区別する**。これにより：

- 通算的中率の集計範囲「保存済みの全大会＋開催中の大会」が「`competitions` を全部読む」だけで自然に満たせる
- StorageManagerの `saveCurrentCompetition` / `saveCompetitionToHistory` は内部実装が統一され、実質同じ処理（upsert）になる

### 2.2 recordsを分離しない（改訂）

当初はサブコレクション分離を推奨したが、その唯一の目的は複数端末同時編集の競合対策だった。**1大会1端末**という実運用が確認されたため分離は不要と判断する。1ドキュメントに収める利点：

- 現行の `Competition` 型（`records: ParticipantRecord[]`）をほぼそのまま保存でき、シリアライズ／デシリアライズの変換コードが最小になる
- 大会1件＝1ドキュメントなので、読み書きの回数も少なく、無料枠にさらに余裕が出る
- 通算集計は `competitions` を全件読むだけで済む（`collectionGroup` 不要）

### 2.3 ドキュメントサイズ検証

最大構成（roundsCount=25, 参加者50名）でも、1参加者分のrecord（25立×4射のshots＋集計フィールド）はFirestoreのフィールドエンコーディングで概算 3〜4KB程度。records配列を丸ごと1ドキュメントに持たせても 50名×4KB ≒ 200KB 程度で、**1MB上限の1/5にも達しない**。通常運用（5立×20名程度）ならさらに1桁小さい。**サイズ面での懸念はない。**

### 2.4 `Participant.masterId` の追加

`Participant` 型に `masterId?: string` を追加することを推奨する。

- マスターから選択して追加する場合（`handleAddSelectedMasters`）→ `master.id` をそのままセット
- 新規入力＋「マスターに保存」チェック時 → `saveParticipantMaster()` の戻り値の `id` をセット（Firestore移行時もIDをクライアント側で先に採番してから書き込む設計にすれば、この戻り値は同期的に得られる＝呼び出し側は無改修）
- 手入力のみで保存しない場合 → `masterId` は `undefined` のまま

**過去データ（masterId無し）との互換性**：通算集計時は「`masterId` があればそれをキー、無ければ `氏名` 文字列をキーにグルーピング」というフォールバックにする。これにより既存の終了済み大会データを失わず、今後のデータからは正確な名寄せができるようになる。完全な名寄せ修正（過去データの遡及的な統合）は本設計のスコープ外とし、将来の管理者向けツールとして切り出す。

---

## 3. StorageManager改修の詳細方針

```ts
class StorageManager {
  private competitionsCache: Competition[] = [];
  private mastersCache: ParticipantMaster[] = [];
  private ready = false;
  private listeners = new Set<() => void>();

  initialize(): void {
    // Firestore永続化キャッシュを有効化 + onSnapshotで購読開始
    // competitionsコレクション全件、participantMastersコレクション全件を購読
    // 変化のたびに cache を更新して listeners に通知
  }

  subscribe(cb: () => void): () => void { /* useSyncExternalStore用 */ }

  // 読み取り系：署名は変えず、中身はキャッシュ参照に変更（同期のまま）
  getCompetitionHistory(): Competition[] { ... }
  getParticipantMasters(): ParticipantMaster[] { ... }
  loadCurrentCompetition(): Competition | null { ... }

  // 書き込み系：署名は変えず、内部でFirestoreへ非同期・投げっぱなし
  saveCurrentCompetition(competition: Competition | null): void {
    // 直前キャッシュと diff → 変更参加者のrecordだけ updateDoc、
    // participants/settingsが変わっていれば競技メタもupdateDoc
    // 失敗時は onError コールバック（App全体で1つのトースト表示）に通知
  }
}
```

- `initialize()` は `main.tsx` または `CompetitionProvider` のマウント時に1回だけ呼ぶ。
- **読み取り専用コンポーネント（`StorageInfo`, `CompetitionHistorySection`, `ParticipantMasterSection` 等）は、手動 `useState`+`useEffect`+再読込 呼び出しパターンから、`useSyncExternalStore` ベースの薄いフックに置き換えることを推奨**（React 19で標準サポート）。理由：Firestoreは非同期でキャッシュが更新されるため、「書き込み直後に手動で再読込する」現行パターン（例：`ParticipantSetup.tsx` の `loadMasters()` 呼び出し）はタイミングによって最新データを取りこぼす。`useSyncExternalStore` にしておけば、ローカルでもリモート（他端末）の変更でも自動的に再レンダーされ、正確性が上がると同時にコードもむしろ簡潔になる。
  - 対象：`ParticipantSetup.tsx`, `ParticipantMasterSection.tsx`, `CompetitionHistorySection.tsx`, `StorageInfo.tsx`（4ファイル、各数行の置き換え）
- **エラー処理の最小実装**：StorageManagerに `onError(cb)` を持たせ、`App.tsx` 側で1つだけトースト（「同期に失敗しました。オンラインになったら自動的に再送されます」等）を出す。20箇所それぞれに try/catch を書く必要はない。

### 3.1 CompetitionContextの変更点（唯一の実質的な非同期化ポイント）

- 起動時ロード（`useEffect` で `loadCurrentCompetition()` を呼んでいる部分）は、Firestoreの初回スナップショット取得を待つ必要があるため、`CompetitionState` に `loading: boolean` を追加し、`App.tsx` で「読み込み中はスピナー」を出す。**変更が必要なのは実質この2ファイルのみ**（他18箇所は無改修）。
- `updateShot` によるローカル `dispatch` は今まで通り即時（オフラインでも遅延なし）。裏で `saveCurrentCompetition` が非同期に投げられる。

---

## 4. 複数端末の同時編集競合（改訂：対策不要と判断）

### 4.1 実際の運用

ヒアリングにより、**1回の大会で使用する端末は常に1台**であることが確認された。iPadを机に置き、参加者が順番にその1台で的中を記録していく運用。複数人がそれぞれの端末から同時入力することは行っていない。グループ分け機能を使う場合も、入力そのものは1台に集約される。

したがって「同一大会を複数端末が同時に更新する」シナリオは発生せず、**競合対策は不要**。当初案のrecordsサブコレクション分離は取りやめる（2.2）。

### 4.2 残る低頻度のリスク：オフライン中の入れ違い

同時編集は起きないが、次のケースは理論上ありうる：

1. 大会Aを端末X（あなたのiPad）で入力 → 圏外のまま持ち帰り、同期されないまま放置
2. 次の大会を端末Y（別メンバーのタブレット）で入力・同期
3. 後日、端末Xがオンラインになり、**古い内容が後から送信されて上書きされる**

Firestoreは後から届いた書き込みを優先する（Last Write Wins）ため、理屈の上では起こりえる。ただし発生条件が「圏外のまま終了し、次の大会まで一度もオンラインにしない」と限定的で、頻度は極めて低い。

**対策方針**：大掛かりな仕組み（バージョン番号による楽観ロック等）は過剰と判断し、代わりに**未送信データがあることを可視化する**にとどめる。画面上部に「未同期の記録があります」というバッジを出し、オンライン復帰後に消える。これだけで、ユーザーが気づかないまま放置する状況をほぼ防げる。7章の簡易インジケータをこの目的で**実装対象に格上げする**。

---

## 5. 参加者の通算的中率機能

### 5.1 集計ロジック

新規ユーティリティ `src/utils/careerStats.ts` を追加。

```ts
export interface CareerStat {
  key: string;            // masterId優先、無ければ `name:${name}`
  name: string;
  rank: number;           // マスターの現在段位があればそれ、無ければ最終出場時の段位
  competitionsCount: number;
  totalShots: number;     // 実際に射た矢数の合計（hit!==nullのみ）
  totalHits: number;
  hitRate: number;        // totalHits / totalShots （※各大会のhitRateの平均ではない）
}

export const calculateCareerStats = (
  competitions: Competition[],   // 保存済み全大会＋開催中の大会
  records: Record<string /*competitionId*/, ParticipantRecord[]>,
  masters: ParticipantMaster[]
): CareerStat[] => { ... }
```

- 分母は要件どおり「実際に引いた射のみ」。これは各大会側で既に `hit !== null` フィルタ済みの `actualShotsCount` ロジックがあるので、それを再利用する。
- **集計は完全にクライアントサイドで行う。** 想定データ量（小規模な会、年間数十大会×十数〜数十名）ならCloud Functionsによる事前集計は過剰設計。`collectionGroup('records')` の一括取得＋メモリ上での `reduce` で十分高速。

### 5.2 「通算成績」タブ

- `App.tsx` の `AppView` 型に `'career'` を追加、6つ目のナビボタンを追加（大会が無くても閲覧可能にする＝`disabled` 条件は他タブと違い外す）。
- 新規コンポーネント `src/components/CareerStats.tsx`：
  - 終了済み大会一覧は `useCompetitionHistory()`（3章のフック）、開催中の大会は既存の `useCompetition()` の `state.competition` をそのまま使う（既にリアルタイムでローカル反映されているため追加の購読は不要）。
  - `calculateCareerStats()` の結果を的中率降順でテーブル表示：順位・氏名・段位・出場数・総射数・総的中・通算的中率。

### 5.3 Excel出力の2枚目シート

`excelExport.ts` の `exportToExcelWithBorders()` が作るワークブック（現状1シート＝当該大会の結果）に対し、`addCareerStatsSheet(workbook, careerStats)` を追加実行し、2枚目のシート「通算成績」を同じワークブックに追加する。呼び出し元は `Results.tsx` と `CompetitionHistorySection.tsx` の2箇所（いずれも既にExcel出力ボタンを持つ）。この2箇所で `calculateCareerStats()` を呼ぶために必要な「全大会データ」は、既にキャッシュ経由で同期取得できる。

---

## 6. 認証・セキュリティルール

### 6.1 認証方式

Firebase Authの Googleプロバイダのみ有効化。ログイン画面を追加し、未ログイン時はアプリ本体を表示せず「Googleでログイン」ボタンのみ表示するゲートを `App.tsx` の最上位に追加する。

### 6.2 重要な前提の確認（誤解しやすい点）

Firebaseのクライアント設定値（`apiKey` 等）は秘密情報ではなく、公開されて構わない値である。**アクセス制御の実体はFirestore Security Rulesであり、「誰でもこのFirebaseプロジェクトに対してGoogleログインを試みることができる」という前提でルールを書く必要がある。** つまり「認証済みなら誰でも許可」ではなく、**特定のメールアドレスのみ許可**するルールが必須。

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isClubAccount() {
      return request.auth != null
        && request.auth.token.email == "club-shared-account@gmail.com";
      // 将来複数許可したい場合は in ["a@gmail.com","b@gmail.com"] 形式に
    }
    match /{document=**} {
      allow read, write: if isClubAccount();
    }
  }
}
```

- Firebase Consoleの Authentication > Settings > 承認済みドメイン は Vercel の本番ドメイン（＝新URL側。＋必要ならプレビュードメイン）に絞る。
- ユーザー個別権限は不要という前提通り、ルールはシンプルな1メールアドレス許可のみで完結する。
- 立禅の会用のGoogleアカウントは**既に存在する**（ヒアリング済み）ため、新規取得は不要。そのアドレスをルールに設定する。

### 6.3 公開範囲についての補足（よくある誤解）

「クラウド化すると世界中の誰もが使えるサービスになるのか？」という点について：

- **現状でも** `https://ritsuzen-app.vercel.app` は誰でもアクセスできる。ただしデータは各ブラウザのlocalStorage内にあるため、他人が開いても**空のアプリが起動するだけ**で、こちらのデータは一切見えない。
- **クラウド化後**は、URLは誰でも開けるが**ログイン画面で止まる**。立禅の会のアカウント以外はSecurity Rulesによりデータへ到達できない。つまり**アクセスできる人はむしろ限定される**。
- 他団体にも使わせる「マルチテナント化」（会ごとにデータを分離する仕組み）は、今回**スコープ外**。ユーザー確認済みで、立禅の会専用とする。

---

## 7. オフライン対応

Firestore Web SDK（v10以降）の `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })` を使う。これにより：

- 圏外でも `getDoc`/`onSnapshot` はローカルIndexedDBキャッシュから即座に値を返す
- 圏外中の `setDoc`/`updateDoc` はローカルに書き込まれた体で即時反映され、実際の送信はキューイングされる
- オンライン復帰時に自動でキューが送信される（オフライン要件をSDK標準機能だけで満たせる）
- 同一端末内で複数タブを開いても矛盾なく動く（multiTabManager）

アプリ側での追加実装はほぼ不要。

**未同期インジケータは実装する（改訂）**：当初は「必須要件ではない」として見送る判断だったが、4.2で述べたオフライン入れ違いリスクの唯一の防波堤になるため、**実装対象に格上げする**。`navigator.onLine` とFirestoreの書き込み完了コールバックを併用し、未送信の書き込みが残っている間は画面上部にバッジを表示、同期完了で消す。実装量は小さい（半日未満）。

---

## 8. 移行方式：別URLでの並行稼働（改訂）

### 8.1 方針

当初案は「既存アプリの保存先を差し替え、失敗したら切り戻す」だったが、ユーザー提案により **`ritsuzen-app2` のような別URLに新バージョンをデプロイし、旧アプリと並行稼働させる**方式を採用する。

**この方式が優れている理由**：

- **既存アプリのコードを1行も変更しない。** 旧URLは今まで通り動き続ける
- したがって「切り戻し機構」「保存先の切替スイッチ」といった実装が**まるごと不要**になる。不調なら旧URLを開くだけ
- 大会の最中に問題が起きても、その場で旧アプリに戻れる
- 新旧を並べて動作比較できる

### 8.2 デプロイ構成

- 同一のGitHubリポジトリに `cloud` ブランチを作成し、Vercelで**2つ目のプロジェクト**として登録 → `ritsuzen-app2.vercel.app`
- 旧プロジェクト（`main` ブランチ → `ritsuzen-app.vercel.app`）は無変更のまま
- 環境変数（`VITE_FIREBASE_*`）は新プロジェクト側にのみ設定

### 8.3 データの持ち込み

**重要な性質**：localStorageは**オリジン（URL）ごとに独立**しているため、新URLは初回アクセス時に空の状態で立ち上がる。旧アプリのデータは自動では引き継がれない。

これは欠点ではなく、**既存のJSONエクスポート／インポート機能をそのまま使える**ことを意味する：

1. 旧アプリ（`ritsuzen-app.vercel.app`）のデータ管理タブから**全データをJSONエクスポート**
2. 新アプリ（`ritsuzen-app2.vercel.app`）でGoogleログイン
3. データ管理タブから**そのJSONをインポート** → Firestoreへ書き込まれる

専用の移行UIを新規実装する必要がなく、**当初案より実装量が減る**。インポート処理（`DataImportSection.tsx`）が新しいStorageManager経由でFirestoreに書くようになるだけで、UIは既存のまま流用できる。

### 8.4 並行稼働中の運用上の注意

新旧2つのURLが存在する期間は、**どちらに入力したか分からなくなる**のが最大のリスク。対策：

- 新アプリのヘッダーに「クラウド版」等のラベルを明示（旧アプリと見分けがつくように）
- 移行が完了したら**旧URLは使わないと決める**（ブックマークを削除する、旧アプリ側に「こちらは旧版です」と表示を出す等）
- 旧アプリのlocalStorageデータは**消さない**。最終的なバックアップとして残しておく

### 8.5 旧アプリ側への最小限の変更（任意）

厳密には「既存アプリを触らない」方針だが、移行完了後の誤入力を防ぐため、旧アプリに「このバージョンは旧版です。新版はこちら」というリンク付きの一文を出すだけの変更を、**移行が完全に終わった後に**入れることを推奨する。これは通算的中率機能とは独立した、数行の変更。

---

## 9. 環境変数・Vercel設定

- Firebase Web設定値は `VITE_FIREBASE_API_KEY` 等、`VITE_` プレフィックス付きの環境変数としてVercelの Project Settings > Environment Variables に登録（Production/Preview/Development共通でよい。前述の通り秘匿情報ではないため、間違えて漏れても実害はSecurity Rulesが守る前提）。
- ローカル開発用に `.env.local` を用意し、**`.gitignore` に `.env*`（`.env.example` は除く）を追加**（現状漏れているため修正が必要）。
- `.env.example` をリポジトリに追加し、必要なキー名一覧を明記しておくと再セットアップが楽になる。

---

## 10. 無料枠（Sparkプラン）での実現性

想定利用規模：月に数回程度の大会、1大会あたり参加者最大でも数十名、20〜100射/人。

- Firestore Spark無料枠：1日あたり読み取り5万回・書き込み2万回・削除2万回、保存1GiB、下り10GiB/月
- 1大会・参加者30名・20射/人の場合の書き込み回数の上限見積り：ショットごとに1書き込みとしても 30名×20射＝**600回/大会**。1日に複数大会をこなしても2万回/日には遠く及ばない。
- 読み取りは「通算成績タブ」を開くたびに全履歴を取得するとしても、大会数が数百件規模になるまでは5万回/日の枠に対して無視できる量。
- Firebase Authは無料枠に制限なし（Googleログインは無料）。
- Hostingは既存通りVercelを使い続けるためFirebase Hosting枠は消費しない。
- Cloud Functionsは今回の設計では不使用（クライアント集計で足りるため）なので、Blazeプラン（従量課金）への移行も不要。

**結論：Sparkプラン（無料）で十分すぎるほど余裕がある。**

---

## 11. 実装ステップ分割と見積もり

段階的リリースを前提に、以下の4段階＋仕上げに分割する（個人開発ペースでの目安時間）。

### Step 0：並行稼働の土台（新規・改訂で追加）

- `cloud` ブランチ作成、Vercelで2つ目のプロジェクトを登録 → `ritsuzen-app2.vercel.app`
- ヘッダーに「クラウド版」ラベル追加（新旧の見分け）
- 旧アプリは無変更
- 見積もり：**0.5日未満**

### Step 1：認証基盤の追加（リリース可能）

- Firebaseプロジェクト作成、Google認証有効化、Firestore作成（本番モード）
- ログイン画面＋未ログイン時のゲート追加（`App.tsx`）
- Security Rules設定（6章。既存の会アカウントのアドレスを設定）
- Vercel環境変数設定（新プロジェクト側）、`.gitignore`修正
- **全端末で一度ログインを済ませておく**（13章。2段階認証は未使用のため、必要なのはパスワードの共有のみ）
- **この時点ではデータは引き続きlocalStorage。** ログインを求められるようになるだけ。認証まわりのリスクを先に潰す。
- 見積もり：**0.5〜1日**

### Step 2：StorageManagerのFirestore化 + オフライン対応（リリース可能）

- `firebase` SDK導入、`initialize()`実装、キャッシュ＋購読の仕組み構築
- データモデル変更（`currentCompetition`枠の廃止。**recordsの分離は不要になったため作業から除外**）
- `CompetitionContext.tsx` の起動ロード非同期化・loading state追加（実質ここが最大の変更点）
- 読み取り系4コンポーネントの `useSyncExternalStore` フック化
- 未同期インジケータの実装（4.2・7章）
- 既存のJSONインポート機能がFirestore経由で動くことの確認（**移行UIの新規実装は不要**）
- 動作確認（複数タブ・機内モード復帰・iPad実機）
- **この時点でクラウド保存が有効になり、複数端末で同じデータを共有できる状態になる。** 通算的中率機能はまだ無い。
- 見積もり：**1.5〜2.5日**（records分離と移行UIが不要になった分、当初見積もりから短縮）

### Step 3：参加者マスターID紐付けの改善

- `Participant`型に`masterId?`追加、`ParticipantSetup.tsx`のマスター選択／新規保存時にセット
- Step 2と同時にリリースしても良いが、影響範囲が独立しているため切り離しても良い
- 見積もり：**0.5日**（Step 2に含めるなら追加コストはほぼこれのみ）

### Step 4：通算的中率機能（リリース可能・目的の機能）

- `careerStats.ts`（集計ロジック）
- 「通算成績」タブ新設（6つ目のナビ）
- Excel出力への2枚目シート追加（`Results.tsx` / `CompetitionHistorySection.tsx` から呼び出し）
- 見積もり：**1〜1.5日**

### 仕上げ

- エラートースト・ローディングUIの磨き込み
- 複数端末での同時入力の実地検証（重要：Step2で設計した競合対策が実際に機能するかの確認）
- 見積もり：**0.5〜1日**

**合計目安：4.5〜6.5日分（実働）**。当初の5〜7日から、records分離と移行UIが不要になった分だけ短縮。Step 1・2・4はそれぞれ単独でリリース可能な区切りとして設計してある。

---

## 12. リスク一覧（改訂）

| リスク | 深刻度 | 対策 |
|---|---|---|
| ~~複数端末同時編集で他者の入力が消える~~ | — | **前提が変わり解消**（1大会1端末運用のため発生しない。4.1） |
| 共有アカウントで他端末からログインできない | 低 | **2段階認証は未使用のため現状リスクは低い**。パスワードを会で保管し、全端末で事前ログイン（13章） |
| 移行時にデータを失う | 中 | 別URL方式のため旧アプリが無傷で残る。加えて移行前にJSONバックアップ（8章） |
| 新旧2つのURLで入力先を取り違える | 中 | 新版にラベル表示、移行後は旧URLを使わないと決める（8.4） |
| Firebase設定値が公開されることへの誤解・不安 | 低 | Security Rulesでメールアドレス制限（6章）を正しく設定すれば実害なし |
| 名寄せ（masterId無し過去データ）の精度 | 低〜中 | 氏名フォールバックで許容、将来的な手動統合ツールは別スコープ |
| オフライン中の入れ違いで古いデータが上書き | 低 | 未同期インジケータを実装（4.2・7章） |

---

## 13. 共有Googleアカウントの端末まわりの注意点

「アカウントを特定の端末に紐付けてしまうと、他の端末からアクセスしにくくなるのでは」という懸念について。

> **前提（ヒアリング済み）**: 立禅の会のGoogleアカウントは**2段階認証を使っていない**。したがってバックアップコードの準備は**不要**。必要なのはパスワードの共有・保管のみ。

### 13.1 結論：アカウント自体は端末に紐付かない

Googleアカウントはクラウド上のものなので、**どの端末からでも同じアカウントでログインできる**。「この端末専用のアカウント」になることはない。2段階認証を使っていない現状では、パスワードさえ分かればどの端末からでも入れる。

さらに、**Firebase Authは一度ログインすると認証トークンを端末内に保存する**ため、大会のたびにログインし直す必要はない。最初の1回だけ。トークンは自動更新され、明示的にログアウトするかブラウザのデータを消さない限り維持される。

### 13.2 現状で必要な準備

**パスワードを会として確実に共有・保管しておくこと。** これだけ。2段階認証を使っていないため、これが唯一の鍵になる。

補足として、他サービスと使い回していないパスワードであることを確認しておくとよい。2段階認証がない以上、パスワードが漏れれば誰でもログインできてしまうため。ただし格納されるデータは弓道の的中記録であり、漏洩時の実害は限定的。会のメンバー内で共有する運用は実用上問題ないと判断する。

### 13.3 将来的に発生しうる変化（頭の片隅に置く程度）

| 要因 | 何が起きるか | 対応 |
|---|---|---|
| **Googleによる2段階認証の要求** | Googleは2段階認証の必須化を段階的に進めている。共有アカウントを複数端末で使っていると設定を促されたり、一時的にブロックされることがある | その時点でバックアップコードを発行し、会で保管すればよい。事前準備は不要 |
| **不審なログインの一時ブロック** | 短期間に複数の新規端末からログインすると警告が出る場合がある | 端末を増やすタイミングを分散させる。事前に各端末でログインを済ませておけば当日は発生しない |
| **パスキーの設定** | 登録端末が手元にないと承認できず、実質的な端末依存になる | 共有運用では**パスキーを設定しない**（現状未使用なので、このまま設定しなければよい） |

### 13.4 推奨する運用

1. **パスワードを会として共有・保管する**（現状で唯一必須の準備）
2. **移行前に、使う可能性のある全端末で一度ログインを済ませておく**（あなたのiPad、メンバーのタブレット等）。以降はトークンが保持されるため再ログイン不要で、当日の手間とトラブルが減る
3. 当日に急遽別の端末を使う事態に備え、**旧アプリのURLも残しておく**（8章の並行稼働が保険として機能する）
4. 共有運用中は**パスキーを設定しない**

---

## 主要ファイル

- `src/utils/StorageManager.ts`
- `src/contexts/CompetitionContext.tsx`
- `src/types/index.ts`
- `src/components/ParticipantSetup.tsx`
- `src/utils/excelExport.ts`
