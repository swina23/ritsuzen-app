# 保存層の抽象化 実装設計書

> 作成日: 2026-07-23 / 実装済み（v1.10.0）
> 対象バージョン: v1.10.0（`cloud` ブランチ）
> 前提となる方針: フリーミアム（無料＝ローカル保存 / 有料＝クラウド保存＋通算成績）
>
> **改訂 2026-07-23（レビュー反映）**: 主な変更は次の3点。
> 1. **バックエンド切り替え時のデータ混線経路を発見**し、§7.2 を全面的に書き直した。現在この問題が起きないのは `AuthGate` が `CompetitionProvider` ごとアンマウントしているためで、`AuthGate` 撤去にはReact stateのリセットが不可分に伴う（§6.3 の `writableBackend()` ガードも追加）
> 2. §7.3 の Firebase 動的 import を **§10 のステップ3に明示的に組み込んだ**。これが無いとステップ3を終えても Firebase 未設定では起動できない
> 3. 変更対象ファイルの数え落とし（`AuthContext.tsx` / `data-manager/StorageInfo.tsx`）と、自団体名ハードコードの実在箇所を特定

## 0. 背景と目的

### 0.1 なぜやるのか

このアプリを他団体にも提供してマネタイズする方針を検討した結果、フリーミアムの境界を**機能軸**に置くことにした。

- **無料（未ログイン）**: ローカル保存。大会数・参加者数とも無制限。手書き＋Excel の完全な代替として単体で成立させる
- **有料（ログイン）**: クラウド保存、通算成績の全期間集計、複数端末・複数人での入力、参加者マスターの団体共有

この境界を成立させるには、`StorageManager` の保存先を**実行時に差し替えられる**必要がある。本書はその差し替え機構（以下「保存層の抽象化」）のみを対象とする。

### 0.2 この改修だけで得られるもの

マルチテナント化・課金機構は本書のスコープ外だが、この改修は単体でも次の価値がある。

1. **アプリが1本になる**。現在 `main`（v1.1.10 / localStorage）と `cloud`（v1.9.0 / Firestore）を別URLで並行運用しているが、`src` 配下で30ファイル乖離しており、旧版には masterId 名寄せもマスター編集も並び順修正も入っていない。一本化すれば運用負担がひとつ消え、無料版が最新機能で動くようになる。
2. **ログイン不要で全機能に触れるURLができる**。他団体への配布・体験の入口になる。最大のボトルネックである流通に効く。
3. **課金境界がコード上の1箇所に現れる**。以降の機能出し分けを探し回らずに書けるようになる。

### 0.3 スコープ外（本書では扱わない）

- マルチテナント化（`tenants/{tenantId}` 構造への再編、招待、ロール）
- 課金機構（Stripe）、利用規約・プライバシーポリシー・特商法表記
- ローカル→クラウドへのデータ吸い上げ導線（当面は既存のJSONエクスポート/インポートで代用する）

---

## 1. 現状整理（コード調査結果）

- `src/utils/StorageManager.ts`（597行）が唯一のシングルトン。**1クラスに2つの役割が同居している**。
  - **バックエンド非依存の部分**: `competitionsCache` / `historyCache` / `mastersCache` / `activeMastersCache` / `storageInfoCache` の各キャッシュ、`recomputeDerived()`、`subscribe`/`notify`、`generateId()`、マスターの重複チェックと import/export、`downloadAsFile()`
  - **Firestore 固有の部分**: `onSnapshot` 3本、`setDoc`/`deleteDoc`/`writeBatch`/`increment`、`pendingWrites` の計数、`snapshot.metadata.hasPendingWrites`
- 呼び出し側は `storageManager.` 参照が **10ファイル30箇所**（`CompetitionContext.tsx` 8、`useStorage.ts` 6、`ParticipantSetup.tsx` 5、`DataImportSection.tsx` 3、`AuthContext.tsx` 2、`ParticipantMasterSection.tsx` 2、`dataExport.ts` / `DataExportSection.tsx` / `CompetitionHistorySection.tsx` / `SyncStatusBar.tsx` 各1）。
- 読み取りは `src/hooks/useStorage.ts` の `useSyncExternalStore` フック6本を経由する。**キャッシュの参照が安定していることが再レンダー抑止の前提**になっている（`recomputeDerived()` のコメント参照）。
- `src/lib/firebase.ts` は**モジュール読み込み時に環境変数を検証して throw する**。`StorageManager.ts` が `db` を静的 import しているため、現状は Firebase 設定が無いとアプリが起動しない。
- `AuthContext.tsx` は `signedOut` / `unauthorized` のときに `storageManager.dispose()` を呼び、購読とキャッシュを破棄する（共用端末で前の人のデータが見えないようにするため）。
- **`App.tsx:283-289` の `AuthGate` は `CompetitionProvider` ごと囲っている。** つまり未認証時は `CompetitionContext` 自体がアンマウントされ、React state（`state.competition`）も一緒に消える。**現在バックエンド切り替え時のデータ混線が起きないのは、この構造に暗黙に依存しているため**であり、`AuthGate` を撤去すると代替の仕組みが必要になる（§7.2）。
- 書き込みメソッド群（`StorageManager.ts:284-385`）は**どこも `isReady()` を見ていない**。購読が張られる前でも書き込めてしまう。
- `src/lib/firebase.ts:46-48` の `persistentLocalCache`（IndexedDB永続化）は `dispose()` では消えない。`clearIndexedDbPersistence()` の呼び出しはコードベースに存在しない。
- 旧 `main` の localStorage は キー `ritsuzen-app-data`、形は `{ currentCompetition, competitions[], participantMasters[], lastUpdated }`。**現行の「全大会を1コレクションに入れ、ポインタで現在の大会を指す」構造とは異なる**（旧版は進行中の大会を別枠に持っていた）。

---

## 2. 全体方針

### 2.1 基本方針

- **`StorageManager` の公開インターフェースはほぼ変えない。** Firestore移行のときと同じ考え方をもう一段内側で繰り返す。変更されるのは `initialize()` にバックエンドを渡す点のみ。呼び出し側30箇所のうち、手を入れるのは次の4ファイルに限られる。
  - `CompetitionContext.tsx` — バックエンドの生成・注入・切り替え（§7.2）
  - `AuthContext.tsx` — `storageManager` への依存を**削除**する（§7.2）
  - `SyncStatusBar.tsx` / `CareerStats.tsx` / `data-manager/StorageInfo.tsx` — 表示の出し分け（§8）
- **切り出すのは「購読」と「書き込み」だけ。** キャッシュ・派生値・通知・採番・import/export は `StorageManager` に残し、バックエンド間で共有する。ロジックを二重に持たないことが最優先。
- **バックエンドは plain なレコードだけを扱う。** `normalizeCompetition()` の適用、`id` フィールドの剥がし方、履歴の絞り込みといったドメイン知識はバックエンドに持ち込まない。
- **バックエンドの選択は起動時（＝認証状態の確定時）に1回だけ。** 動作中に無言で切り替わることはない。切り替えは必ず `dispose()` → `initialize()` の再実行を伴う。

### 2.2 なぜ「バックエンド差し替え」であって「2つのStorageManager」ではないか

`LocalStorageManager` と `FirestoreStorageManager` を別クラスで持つ案も考えられるが、採らない。

- 共有したいロジック（`recomputeDerived()` の派生値計算、マスターの同名チェック、import のバリデーション、ID採番規則）が実装の**過半を占める**。これを二重に持つと、片方だけ直したバグが必ず出る。マスターの同名チェックと `generateId()` の連番は、いずれも過去に実害が出て入れた仕組みであり、劣化させたくない。
- 呼び出し側はシングルトン `storageManager` を直接 import している。クラスを分けると呼び出し側30箇所すべてが「どちらのインスタンスか」を意識することになる。

---

## 3. `StorageBackend` インターフェース

`src/lib/storage/StorageBackend.ts` に置く。

```ts
/** ドキュメントIDと本体フィールドの組。バックエンドはこの形しか知らない */
export interface StoredDoc<T> {
  id: string;
  fields: T;
}

/** 購読側に渡すスナップショット */
export interface Snapshot<T> {
  docs: StoredDoc<T>[];
  /** 未送信の書き込みが残っているか。ローカル実装は常に false */
  hasPendingWrites: boolean;
  /**
   * 中身が実際に変わったか。false ならキャッシュを作り直さない。
   * Firestore はメタデータのみの変更通知を送ってくるため、これが無いと
   * 参照が変わって無駄な再レンダーを招く。ローカル実装は常に true。
   */
  hasDocChanges: boolean;
}

export type Unsubscribe = () => void;

export interface StorageBackend {
  /** UI の出し分けに使う。'cloud' | 'local' */
  readonly kind: StorageKind;

  // === 購読 ===
  subscribeCompetitions(
    onSnapshot: (snapshot: Snapshot<CompetitionFields>) => void,
    onError: (error: unknown) => void
  ): Unsubscribe;

  subscribeParticipantMasters(
    onSnapshot: (snapshot: Snapshot<MasterFields>) => void,
    onError: (error: unknown) => void
  ): Unsubscribe;

  subscribeAppState(
    onSnapshot: (competitionId: string | null, hasPendingWrites: boolean) => void,
    onError: (error: unknown) => void
  ): Unsubscribe;

  // === 書き込み（すべて Promise を返す。呼び出し側で track する） ===
  setCompetition(id: string, fields: CompetitionFields): Promise<void>;
  deleteCompetition(id: string): Promise<void>;
  setAppState(competitionId: string | null): Promise<void>;

  setParticipantMaster(id: string, fields: MasterFields): Promise<void>;
  /** 部分更新。既存フィールドは保持する */
  mergeParticipantMaster(id: string, updates: Partial<MasterFields>): Promise<void>;
  deleteParticipantMaster(id: string): Promise<void>;
  /** usageCount を +1 し lastUsed を更新する。アトミック性の担保は実装に委ねる */
  incrementMasterUsage(id: string, lastUsed: string): Promise<void>;

  /** 複数マスターの一括書き込み（インポート用） */
  putParticipantMasters(masters: StoredDoc<MasterFields>[]): Promise<void>;

  /** 購読の後片付け。キャッシュ破棄は StorageManager 側の責務 */
  dispose(): void;
}
```

### 3.1 設計判断

**`incrementMasterUsage` を専用メソッドにする理由。** 現行は `increment(1)` という Firestore のセンチネル値を `setDoc` に渡している。これは汎用の `set(fields)` を通せない（センチネルは Firestore SDK 固有の型）。ローカル実装は read-modify-write で代替する。

> ⚠️ **これは厳密には等価ではない。** §5.3 で同一端末の複数タブをサポート対象にしているため、2タブから同時に呼ばれると read-modify-write では一方の加算が失われる（`increment()` センチネルはまさにこれを防ぐためのもの）。ただし `usageCount` は現在**画面に表示していない**（v1.6.0 で表示を削除し、値だけ持ち続けている）ため、ずれても実害が無い。**この前提が変わる（使用回数を再び表示する、並び順に使う）場合はローカル実装を見直すこと。**

**`mergeParticipantMaster` を `setParticipantMaster` と分ける理由。** `updateParticipantMaster()` は `{ merge: true }` で部分更新している（無効化フラグだけ、氏名だけ、を書く）。merge の有無を boolean 引数で表現すると呼び出し側で読みにくいので、メソッドを分ける。

**`putParticipantMasters` を用意する理由。** インポートは最大数百件を書く。Firestore は `writeBatch`（500操作上限、現行は450で分割）、ローカルは1回の `setItem` と、最適な書き方が実装ごとに違う。件数分ループさせず、一括の意図をインターフェースに残す。

**`hasPendingWrites` をスナップショットに載せる理由。** 現行の `pendingFromMetadata` は「圏外で入力 → タブを閉じる → 開き直す」を検出するための Firestore メタデータで、購読の副産物として届く。これを購読の戻り値に同居させておけば、ローカル実装は常に `false` を返すだけで済み、`StorageManager` 側の `hasPendingWrites()` は無改修で通る。

**バックエンドが `Competition` 型ではなく `CompetitionFields`（＝`Omit<Competition, 'id'>`）を扱う理由。** 現行コードは全書き込みで `const { id, ...fields } = competition` と剥がしている。「IDはドキュメントIDで表現し、フィールドには書かない」という規約をインターフェースの型で固定しておく。

---

## 4. `FirestoreBackend`

`src/lib/storage/FirestoreBackend.ts`。**現行 `StorageManager` の Firestore 部分をそのまま移設する**だけで、挙動を変えない。

- `initialize()` 内の `onSnapshot` 3本 → 対応する `subscribeXxx` へ。`includeMetadataChanges: true` と「メタデータのみの変更ではキャッシュを作り直さない」最適化は**購読側（StorageManager）に残す**。バックエンドは届いたスナップショットをそのまま流し、「変化が無ければ再計算しない」判定は `StorageManager` が持つ。
  - ただし `snapshot.docChanges().length > 0` は Firestore 固有 API なので、そのままでは外に出せない。**`Snapshot` に `hasDocChanges: boolean` を1つ足す**（ローカル実装は常に `true`）。これで最適化を維持したまま Firestore 依存を閉じ込められる。
- `setDoc` / `deleteDoc` / `writeBatch` / `increment` の import は**このファイルだけ**になる。`src/lib/firebase.ts` を import するのもこのファイルと `AuthContext.tsx` だけ。
- `dispose()` は `unsubscribers` の解除のみ。キャッシュのクリアは `StorageManager` 側。

---

## 5. `LocalStorageBackend`

`src/lib/storage/LocalStorageBackend.ts`。新規。

### 5.1 保存形式

キーは `ritsuzen-app-local-v2`。**旧 `main` の `ritsuzen-app-data` とは別キーにする**（形が違うため、同じキーに新旧が混ざると壊れる）。

```jsonc
{
  "version": 2,
  "competitions": { "<id>": { /* CompetitionFields */ } },
  "participantMasters": { "<id>": { /* MasterFields */ } },
  "appState": { "competitionId": "<id>" | null }
}
```

Firestore のコレクション構造をそのまま写した形にする。バックエンド間でデータを行き来させる（将来のローカル→クラウド吸い上げ）ときに、変換が要らないため。

### 5.2 旧 `main` データの取り込み

初回読み込み時に `ritsuzen-app-local-v2` が無く `ritsuzen-app-data` がある場合、**1回だけ変換して取り込む**。旧版のURLに新版をデプロイした場合、既存ユーザーの記録がそのまま引き継がれる。

変換規則:
- `competitions[]` → `competitions` マップ（`id` をキーに、残りを fields に）
- `currentCompetition` → 同じく `competitions` に入れ、`appState.competitionId` にその ID を書く。**旧版では進行中の大会は `competitions` に含まれていない**ため、この付け替えが必要
- `participantMasters[]` → `participantMasters` マップ
- 取り込み後も旧キーは**消さない**（切り戻せるようにする）

読み出し時は既存の `normalizeCompetition()` を通すので、旧スキーマの欠損フィールドはそこで埋まる。

### 5.3 購読の実装

`localStorage` には変更通知が無い（`storage` イベントは**他タブ**の変更でしか発火しない）。自タブの書き込みは自分で通知する。

```
subscribeCompetitions(cb) {
  this.listeners.add(cb);
  cb(現在のスナップショット);            // 初回スナップショットを同期的に流す
  return () => this.listeners.delete(cb);
}
```

**初回スナップショットは同期的に流す。** Firestore は非同期だが、ローカルは即座に返せる。こうすると `CompetitionContext.tsx:299` の `if (storageManager.isReady())` が最初から真になり、「データを読み込み中…」の一瞬のちらつきが出ない。

> ⚠️ これは `StorageManager.initialize()` の中で、`this.unsubscribers.push(...)` の引数評価中にコールバックが走ることを意味する。現行のコールバックはキャッシュと `readyFlags` と `notify()` にしか触らず、`unsubscribers` を読まないので安全。**この不変条件は `initialize()` を触るときに壊しやすいのでコメントで明示する。**

他タブの `storage` イベントも購読して同じ通知に合流させる。同一端末で2タブ開いても矛盾しない（現行の `persistentMultipleTabManager` と同じ狙い）。

### 5.4 書き込みの実装

すべて「読み出し → 変更 → `setItem`」。`Promise.resolve()` を返す（インターフェースに合わせるためで、実際は同期）。書き込み後に自タブのリスナーへ通知する。

**書き込み頻度についての判断。** `ScoreInput` は的中を1本入力するたびに `saveCurrentCompetition()` を呼ぶ（`CompetitionContext.tsx:315-320`）。単一キーのJSON blob方式では、そのたびに**全大会・全マスターの `JSON.parse` / `JSON.stringify`** が走る。大会が数十件に育つと1タップあたり数ミリ秒〜十数ミリ秒のコストになりうる。

それでも単一キー方式を採るのは、(a) 射会は年数回で、無料ユーザーが数十大会に達するのは数年後、(b) キーを大会ごとに分けると「全キーを走査して一覧を作る」処理が別に要り、`localStorage` の同期APIでは結局全件読みになる、ため。**実測で問題が出たら、`saveCurrentCompetition` のデバウンス（現行の `lastSavedJson` による重複排除の延長）で対処する**。キー分割は最後の手段とする。

**容量超過（`QuotaExceededError`）を握りつぶさない。** localStorage は 5MB 程度が上限で、大会が数十件を超えると現実的に当たりうる。現行の Firestore 版はこの心配が無いので、ローカル固有のエラー経路として `onError` に流し、`SyncStatusBar` 相当の場所に「端末の保存容量が上限に達しました。クラウド保存をご検討ください」と出す。**これは課金への自然な導線にもなる。**

---

## 6. `StorageManager` の改修

### 6.1 バックエンドの注入

```ts
class StorageManager {
  private backend: StorageBackend | null = null;

  /** バックエンドを与えて購読を開始する。切り替えるときは先に dispose() すること */
  initialize(backend: StorageBackend): void { ... }

  /** 現在のバックエンド種別。UI の出し分けに使う */
  getKind = (): StorageKind | null => this.backend?.kind ?? null;
}
```

`initialize()` に引数が増えるのが唯一のシグネチャ変更。呼び出しは `CompetitionContext.tsx:281` の1箇所のみ。

`getKind()` は `useStorage.ts` に薄いフックを足して公開する。

```ts
export const useStorageKind = (): StorageKind | null =>
  useSyncExternalStore(storageManager.subscribe, storageManager.getKind);
```

`getKind()` を生のまま呼んでも、`SyncStatusBar` / `CareerStats` は他のフックの `notify()` に便乗して再レンダーされるため**たまたま動く**。しかしそれは暗黙の前提で、kind だけを見るコンポーネントを後から作ると壊れる。最初からフックにしておく。

### 6.2 書き込みメソッドの書き換え

`track()` は今のまま使える。中身の Firestore 呼び出しをバックエンド経由に置き換えるだけ。

```ts
// Before
this.track(setDoc(doc(db, COMPETITIONS, id), fields), 'saveCompetitionToHistory');
// After
this.track(this.backend!.setCompetition(id, fields), 'saveCompetitionToHistory');
```

`saveCurrentCompetition()` / `finishCurrentCompetition()` / `deleteCompetition()` の「大会ドキュメントとポインタを順に書く」非同期の組み立て（と、`releaseCurrentCompetition()` がポインタを明示クリアしない理由）は**そのまま維持する**。ここは過去に整理した箇所で、バックエンドを変えても論理は同じ。

### 6.3 `dispose()`

現行の「購読解除＋全キャッシュ破棄」に加え、`this.backend.dispose()` を呼び、`this.backend = null` にする。

**書き込みメソッドのガードは `if (!this.backend) return;` では足りない。** `dispose()` → `initialize(newBackend)` と続けて呼んだ直後は「`backend` は非 null だが、まだ初回スナップショットが届いていない」状態になり、このガードを素通りする。そこに古い `state.competition` が流れ込むと、**別のバックエンドのデータを書き込む**ことになる（§7.2 の重大な経路）。

そのため、全書き込みメソッドの先頭を次のガードにする。

```ts
/**
 * 書き込み可能か。バックエンドが無い、または初回スナップショット待ちの間は書かない。
 *
 * 「初回スナップショット待ち」を弾くのが重要。バックエンド切り替えの直後に
 * 古い画面から保存が飛んでくると、切り替え前のデータを切り替え後の保存先に
 * 書き込んでしまう。ローカル⇄クラウドをまたぐため、これは上書きではなく
 * 「別のデータ領域への混入」になる。
 *
 * 書き込めるときは backend を返す。**複数段階の書き込みは、返された backend を
 * 最後まで使い回すこと。**
 */
private writableBackend(): StorageBackend | null {
  if (!this.isReady()) return null;
  return this.backend;
}
```

黙って無視し、例外は投げない。ログアウト直後に `CompetitionContext` の `useEffect` が最後の保存を投げてくるのは正常な経路であり、そこで throw すると画面が壊れるため。

**boolean を返すガードでは足りない。** `saveCurrentCompetition` / `finishCurrentCompetition` / `deleteCompetition` は「大会ドキュメントを書く → `appState` ポインタを書く」の2段階で、間に `await` が挟まる。ガードを入口で1回通すだけにして各段で `this.backend` を読み直すと、**1段目を待っている間に切り替わったバックエンドへ2段目が着地する**。しかも `setDoc()` は圏外だとサーバ確認が取れるまで解決しないため、この隙間は一瞬ではなく数分単位になりうる（体育館が主用途なので現実的なシナリオ）。だからガードは boolean ではなくバックエンドそのものを返し、操作の全段でそのローカル変数を使う。

同じ理由で、未送信件数のカウンタもセッションを見る。`dispose()` が `pendingWrites = 0` にした後で前セッションの書き込みが解決すると、`track()` の `finally` が**次のセッションの**件数を減らしてしまい、同期中インジケータが狂う。`dispose()` で通し番号（`sessionId`）を進め、`finally` で一致しなければ何もしない。

なお `LocalStorageBackend` は初回スナップショットを同期的に流す（§5.3）ので、ローカルへの切り替えでは `isReady()` が即座に真になり、このガードで待たされることは実質無い。

### 6.4 `getStorageInfo()`

`recomputeDerived()` の計算はそのまま使えるが、ローカルモードでは「使用量」の意味が変わる（実際にブラウザの容量を食っている）。`StorageInfo` に `kind` を足し、データ管理画面の表示文言を出し分ける。

---

## 7. バックエンドの選択と切り替え

### 7.1 選択ロジック

`AuthContext` の `status` から決める。

| `AuthStatus` | バックエンド | 画面 |
| --- | --- | --- |
| `loading` | なし | 「読み込み中…」 |
| `signedOut` | `LocalStorageBackend` | **アプリ本体（無料モード）** |
| `unauthorized` | `LocalStorageBackend` | アプリ本体＋「このアカウントは登録されていません」の通知 |
| `signedIn` | `FirestoreBackend` | アプリ本体（クラウドモード） |

**`App.tsx` の `AuthGate` は撤去する。** これが本改修で最も大きい振る舞いの変更で、未ログインでも `LoginScreen` ではなくアプリ本体が出るようになる。`LoginScreen` は「クラウド保存を使う」導線としてヘッダーやデータ管理画面から開く形に変える。

### 7.2 切り替え時の処理 ⚠️ 本改修で最も危険な箇所

**責務の置き場所を先に確定させる。**

- `AuthContext` は**認証状態だけ**を持つ。`storageManager` への依存（現在 `AuthContext.tsx:36, 43` の `dispose()` 2箇所）は**削除する**。
- バックエンドの生成・注入・切り替えは**すべて `CompetitionContext` が行う**。`AuthStatus` を読み、対応するバックエンドを作って `storageManager` に渡す。

#### なぜ慎重を要するのか

現在この経路のバグが起きないのは、`App.tsx:283-289` の `AuthGate` が `CompetitionProvider` ごとアンマウントし、React state もろとも消しているからにすぎない。`AuthGate` を撤去すると（§7.1）、**`CompetitionContext` は生き残ったまま保存先だけが入れ替わる**。

危険な具体列:

1. ユーザーがクラウドモードで `ScoreInput` を開いている（`state.competition` にクラウド上の大会、`state.loading` は `false`）
2. ログアウトする → バックエンドが `LocalStorageBackend` に切り替わる
3. **画面はまだ `ScoreInput` のまま**。`state.competition` は古いクラウドのデータ
4. ユーザーが的中を1本タップする → `updateShot` → 保存用 `useEffect`（`CompetitionContext.tsx:315-320`）が発火

この `useEffect` の依存は `[state.competition, state.loading]` **のみ**で、認証状態の変化では再発火しない。結果、クラウド上の大会が**ローカルストレージに書き込まれる**。逆向き（ローカル → クラウド）も同様に起こり、そちらは他団体のデータ領域への混入になる。

#### 対策

**バックエンド切り替えは、必ず React state のリセットを伴う1つの不可分な操作として扱う。** 順序が重要。

```
AuthStatus が変化したら:
  1. dispatch({ type: 'RESET_FOR_BACKEND_SWITCH' })   // competition: null, loading: true を同期的に
  2. storageManager.dispose()                          // 購読解除＋全キャッシュ破棄
  3. storageManager.initialize(newBackend)             // 新しい保存先で購読開始
  4. 初回スナップショット到着後に LOAD_COMPETITION      // 既存の初期化フローに合流
```

1 を**最初に、同期的に**行うのが肝。`loading: true` にした時点で保存用 `useEffect` は `if (state.loading) return;`（`CompetitionContext.tsx:316`）で止まり、`competition: null` にすることで古いデータが残らない。§6.3 の `writableBackend()` ガードは、それでもすり抜けたものに対する二重の防御。

`state.loading` が `true` の間は `App.tsx:103` の分岐により「データを読み込み中…」が出るため、切り替え中に古い画面が操作されることも無くなる。

#### 実装形

`CompetitionContext` の初期化 `useEffect`（現在 `[]` 固定、`CompetitionContext.tsx:280-311`）を `[authStatus]` 依存に変え、クリーンアップで `dispose()` する形にする。effect の本体先頭で 1 の dispatch を行う。`CompetitionProvider` が `AuthProvider` の内側にある必要があるが、これは現在の構造（`App.tsx:283-287`）のままで満たされる。

### 7.3 Firebase の遅延読み込み

`FirestoreBackend` を **`await import('./FirestoreBackend')` の動的 import にする**。

- `firebase` パッケージは初期バンドルとしては重い。無料ユーザーは Firebase を一切使わないので、ダウンロードさせる理由が無い
- `src/lib/firebase.ts` は環境変数が無いと throw する。動的 import にしておけば、**Firebase を設定せずにビルド・起動できる**（OSS として配る、ローカル開発でクラウドを触らない、といった選択肢が残る）

ただし `AuthContext` は `firebase/auth` を静的 import しているため、この効果を出し切るには認証側も遅延させる必要がある。**本改修では `FirestoreBackend` の動的 import だけ行い、`AuthContext` の遅延化は別途とする**（認証状態の復元は初回描画に間に合わせたいので、慎重に扱いたい）。

> **この動的 import は §10 のステップ3に含める（後回しにしない）。** `src/lib/firebase.ts:26-31` は読み込み時に環境変数不足で throw するため、静的 import のままだと `AuthGate` を撤去しても **Firebase 未設定の環境では依然として起動しない**。それでは §0.2 が謳う「ログイン不要で触れるURL」という価値が、ステップ3を終えても届かない。

---

## 8. UI の出し分け

変更が必要なコンポーネントは3つ。いずれも `useStorageKind()`（§6.1）で分岐する。

### 8.1 `SyncStatusBar.tsx`

`storageManager.getKind() === 'local'` のとき:
- オフライン表示（📴）を出さない。ローカル保存はオフラインでも完全に動くので、警告する理由が無い
- 「同期中…」を出さない。`hasPendingWrites` は常に false なので、実際には自動的にそうなる
- **容量超過エラーだけは出す**（5.4 参照）

### 8.2 `CareerStats.tsx` — 「見せるがロックする」

ローカルモードでも通算成績タブは**表示する**。ただし:

- 集計対象を**直近3大会に限定**する。`useAllCompetitions()` の結果を `date` の降順で3件に絞ってから `calculateCareerStats()` に渡す
- 見出しの注記を「集計対象: 直近3大会（**クラウド保存にすると全期間・全端末の記録が対象になります**）」に変える
- 4大会目以降が存在する場合のみ、下部にアップグレード導線を出す

**設計上の注意**: 制限は「タブを隠す」ではなく「集計範囲を狭める」で表現する。タブごと隠すと価値そのものを体験させられず、機能軸で切った意味が薄れる。逆に、**現に持っているデータを見せない形にはしない**（大会履歴やExcel出力は無料でも全件そのまま）。ロックするのは「横断集計」という付加価値だけで、ユーザーが入力した記録そのものは人質にしない。

> なお `CareerStats` は現在 `useAllCompetitions()` と `useAllParticipantMasters()` を直接呼んでいる。絞り込みはコンポーネント内で行い、フックやユーティリティ側には課金ロジックを漏らさない。

### 8.3 `data-manager/StorageInfo.tsx`

§6.4 で `StorageInfo` に `kind` を足すのに合わせ、表示文言を出し分ける。

- クラウド時: 現行のまま（「使用容量」はデータ量の目安）
- ローカル時: 「この端末に保存されています」を明示し、容量表示に上限（約5MB）との対比を添える。§5.4 の容量超過が近づいていることを事前に気付けるようにする

---

## 9. ファイル構成

```
src/lib/storage/
  StorageBackend.ts       # 型定義のみ（新規、約60行）
  FirestoreBackend.ts     # 現行の Firestore 部分を移設（新規、約150行）
  LocalStorageBackend.ts  # 新規（約180行）
  legacyMigration.ts      # 旧 main の localStorage 取り込み（新規、約50行）
src/utils/StorageManager.ts  # Firestore 依存を除去、backend 注入型に（約550行に微減）
src/hooks/useStorage.ts      # useStorageKind() を追加
```

**変更されるが新規ではないファイル**: `src/contexts/CompetitionContext.tsx`（バックエンド生成・切り替え）、`src/contexts/AuthContext.tsx`（`storageManager` 依存の削除）、`src/App.tsx`（`AuthGate` 撤去）、`src/components/SyncStatusBar.tsx`、`src/components/CareerStats.tsx`、`src/components/data-manager/StorageInfo.tsx`。

---

## 10. 実装手順

意図的に**段階ごとに動く状態を保つ**。

1. **`StorageBackend` 型と `FirestoreBackend` を作り、`StorageManager` を注入型に書き換える。** この時点ではバックエンドは Firestore 1種類のみで、`CompetitionContext` が常にそれを渡す。**外から見た挙動は完全に不変**。ここまでで動作確認できれば、抽象化そのものは正しい。
2. **`LocalStorageBackend` を追加する。** まだ UI からは選べない。開発時に手で差し替えて動作を見る。
3. **`AuthGate` を撤去し、認証状態でバックエンドを選ぶようにする。** ここで初めて挙動が変わる。この1ステップに次をすべて含める（分割すると中途半端に壊れた状態が残る）。
   - `AuthContext` から `storageManager` 依存を削除（§7.2）
   - `CompetitionContext` の切り替え処理と `RESET_FOR_BACKEND_SWITCH`（§7.2）
   - `writableBackend()` ガードの追加（§6.3）
   - **`FirestoreBackend` の動的 import 化（§7.3）** — これを入れないと Firebase 未設定で起動できないままで、ステップ3の目的を達成できない
4. **旧 `main` データの取り込みを追加する。**
5. **`SyncStatusBar` / `CareerStats` / `StorageInfo` の出し分けを入れる。**

ステップ1と3の間で必ず一度動作確認を挟むこと。1は「変わらないこと」の確認、3は「変わること」の確認で、性質が違う。

**ステップ3の確認は通信を遅くした状態でも行う**（Chrome DevTools のネットワークスロットリング）。§7.2 の混線は「クラウドの初回スナップショットが届く前に古い画面が操作される」という時間差で起きるため、高速な回線では踏めない。このリポジトリには自動テストが1件も無く、ここは手で確かめるしかない。

---

## 11. リスクと確認事項

| リスク | 内容 | 対策 |
| --- | --- | --- |
| **データの混線（表示）** | ログアウト後にクラウドのキャッシュが残り、無料モードで他人の記録が見える | `dispose()` の全キャッシュ破棄は現行のまま維持。ステップ3で往復テスト必須 |
| **データの混線（書き込み）** ⚠️ | 切り替え直後に古い `state.competition` が新しい保存先へ書き込まれる | §7.2 の state リセット＋§6.3 の `writableBackend()` ガードの二重防御。**本改修で最も重い設計上の負債** |
| **IndexedDB に残る前セッションのデータ** | `firebase.ts:46-48` の `persistentLocalCache` は `dispose()` では消えない。`clearIndexedDbPersistence()` の呼び出しはコードベースに存在しない | **本改修とは独立に存在する既存の懸念**。共用端末で別の許可済みアカウントに切り替えたとき何が見えるかを実機で確認する。必要ならログアウト時のキャッシュ消去を別途入れる |
| **再レンダー爆発** | ローカル実装が毎回新しい配列を返すと `useSyncExternalStore` が無限ループする | キャッシュ生成は `StorageManager` 側に残す設計になっているため構造的に防げている。バックエンドは「変更があった」と伝えるだけ |
| **初回スナップショットの同期発火** | `initialize()` 実行中にコールバックが再入する（5.3） | 現行コールバックは `unsubscribers` を読まない。コメントで不変条件を明示 |
| **localStorage 容量超過** | 大会が数十件を超えると `setItem` が落ちる | 5.4 のエラー通知。無言のデータ消失だけは絶対に避ける |
| **旧データ取り込みの破壊** | 変換にバグがあると既存ユーザーの記録が壊れる | 旧キーを消さない。取り込み前に自動で JSON エクスポートを促す案も検討 |
| **未ログイン公開の影響** | `AuthGate` 撤去で、アプリ本体が誰でも見えるようになる | データは各自の端末にしか無いので情報漏洩は無い。ただし自団体名の露出が残る（下記） |
| **自団体名のハードコード** | 他団体が使うURLに「立禅の会」が出る | 実在箇所は3つ: `excelExport.ts:494`（xlsxのファイル名）、`excelExport.ts:607`（csvのファイル名）、`LoginScreen.tsx:25`（「立禅の会で登録済みのアカウントに…」）。**出力ファイル名は大会名から作るべき**で、マルチテナント化を待たずに直せる |

---

## 12. 未決事項

- **ローカルモードでの通算成績の制限件数**。本書では直近3大会としたが、実運用（射会は年数回）だと3大会＝1年分以上になり、制限として緩い可能性がある。実データを見てから調整する。
- **`unauthorized` 状態の扱い**。現在は「許可リストに無いアカウント」を弾いているが、マルチテナント化までの過渡期には「ログインはできたが契約が無い」と同義になる。当面はローカルモードにフォールバックさせる案を採ったが、その旨をどう伝えるかの文言は未定。
- **旧 `main` の扱い**。一本化後に `ritsuzen-app.vercel.app` を新版に差し替えるのか、旧版を残すのか。差し替えるなら 5.2 の取り込みが必須になり、残すならデータ引き継ぎの導線が別途要る。
