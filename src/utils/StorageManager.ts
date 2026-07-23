/**
 * 保存先を抽象化するStorageManagerクラス
 *
 * 公開インターフェース(メソッド名・引数・戻り値の形)はlocalStorage版から変えていない。
 * 内部だけを差し替えることで、呼び出し側の大半を無改修のまま移行してきた。
 * 今回はさらにその内側で、保存先そのもの(Firestore / localStorage)を
 * 実行時に差し替えられるようにしている。
 *
 *  - 読み取り: キャッシュから同期的に返す (購読が張られるまでは空)
 *  - 書き込み: StorageBackend へ投げっぱなし。完了は track() で数えるだけ
 *
 * バックエンドが持つのは「購読」と「書き込み」だけ。キャッシュ・派生値の計算・
 * 通知・ID採番・マスターの重複チェック・import/export はこのクラスに残し、
 * バックエンド間で共有する (ロジックを二重に持たない)。
 *
 * 読み取り系は useSyncExternalStore から使えるよう、返す配列・オブジェクトを
 * スナップショットごとに1回だけ作り直して参照を安定させている。
 */

import { Competition, ParticipantMaster } from '../types';
import { logStorageError } from './errorUtils';
import { normalizeCompetition } from './competitionMigration';
import { formatJapaneseDateTime, getTodayJapaneseDate } from './dateUtils';
import type {
  MasterFields,
  StorageBackend,
  StorageKind,
  StoredDoc,
} from '../lib/storage/StorageBackend';

export interface StorageInfo {
  size: string;
  itemCount: number;
  lastUpdated: string;
  totalSize: string;
  /** 保存先の種別。データ管理画面の文言を出し分けるために持つ */
  kind: StorageKind | null;
}

export interface ImportResult {
  success: boolean;
  imported?: number;
  error?: string;
}

const EMPTY_STORAGE_INFO: StorageInfo = {
  size: '0 KB',
  totalSize: '0 KB',
  itemCount: 0,
  lastUpdated: '-',
  kind: null,
};

export class StorageManager {
  // === 保存先 ===
  private backend: StorageBackend | null = null;

  // === キャッシュ (スナップショットのたびに作り直す) ===
  private competitionsCache: Competition[] = [];
  private historyCache: Competition[] = [];
  private mastersCache: ParticipantMaster[] = [];
  private activeMastersCache: ParticipantMaster[] = [];
  private storageInfoCache: StorageInfo = EMPTY_STORAGE_INFO;
  private currentCompetitionId: string | null = null;

  // === 購読・通知 ===
  private initialized = false;
  private readyFlags = { competitions: false, masters: false, appState: false };
  private listeners = new Set<() => void>();
  private errorListeners = new Set<(message: string) => void>();
  private unsubscribers: Array<() => void> = [];

  /** 未送信の書き込み数。オフライン中はここが減らないので同期インジケータに使う */
  private pendingWrites = 0;

  /**
   * 保存先を切り替えるたびに増える通し番号。
   * 切り替え前に投げた書き込みが後から解決したとき、それが「今のセッションの
   * 書き込み」ではないと判別するために使う。
   */
  private sessionId = 0;

  /**
   * バックエンドが保持している未送信ミューテーションの有無。
   * pendingWrites はこのインスタンスが投げた書き込みしか数えられないため、
   * 「圏外で入力 → タブを閉じる → 開き直す」ケースを取りこぼす。
   * IndexedDBに残ったキューはスナップショットのメタデータでしか分からない。
   * (ローカル保存では常に false)
   */
  private pendingFromMetadata = { competitions: false, masters: false, appState: false };

  /** 直前に保存した大会のJSON。同一内容の重複書き込みを避ける */
  private lastSavedJson: string | null = null;

  // === 初期化・購読 ===

  /**
   * バックエンドを与えて購読を開始する。認証状態が確定してから呼ぶこと。
   * 複数回呼ばれても2回目以降は何もしない。
   * 保存先を切り替えるときは、先に dispose() すること。
   *
   * ⚠️ 不変条件: 以下の購読コールバックは `this.unsubscribers` を読んではならない。
   * LocalStorageBackend は初回スナップショットを**同期的に**流すため、
   * `this.unsubscribers.push(...)` の引数を評価している最中にコールバックが走る。
   * 触ってよいのはキャッシュ・readyFlags・notify() までとする。
   */
  initialize(backend: StorageBackend): void {
    if (this.initialized) return;
    this.initialized = true;
    this.backend = backend;

    this.unsubscribers.push(
      backend.subscribeCompetitions(
        (snapshot) => {
          this.pendingFromMetadata.competitions = snapshot.hasPendingWrites;
          // メタデータだけが変わった通知では、キャッシュを作り直すと
          // 参照が変わって無駄な再レンダーを招くのでスキップする
          if (snapshot.hasDocChanges || !this.readyFlags.competitions) {
            this.competitionsCache = snapshot.docs
              .map((d) => normalizeCompetition({ ...d.fields, id: d.id }))
              .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
            this.readyFlags.competitions = true;
            this.recomputeDerived();
          }
          this.notify();
        },
        (error) => this.handleError(error, 'subscribeCompetitions')
      )
    );

    this.unsubscribers.push(
      backend.subscribeParticipantMasters(
        (snapshot) => {
          this.pendingFromMetadata.masters = snapshot.hasPendingWrites;
          if (snapshot.hasDocChanges || !this.readyFlags.masters) {
            this.mastersCache = snapshot.docs.map((d) => ({ ...d.fields, id: d.id }));
            this.readyFlags.masters = true;
            this.recomputeDerived();
          }
          this.notify();
        },
        (error) => this.handleError(error, 'subscribeParticipantMasters')
      )
    );

    this.unsubscribers.push(
      backend.subscribeAppState(
        (competitionId, hasPendingWrites) => {
          this.pendingFromMetadata.appState = hasPendingWrites;
          // 上の2つと同じ理由。クラウド保存では書き込みが確定した瞬間にも
          // 同じ内容で再通知が来るため、ポインタが動いていなければ作り直さない
          if (competitionId !== this.currentCompetitionId || !this.readyFlags.appState) {
            this.currentCompetitionId = competitionId;
            this.readyFlags.appState = true;
            this.recomputeDerived();
          }
          this.notify();
        },
        (error) => this.handleError(error, 'subscribeAppState')
      )
    );
  }

  /** 3つの購読すべてが初回スナップショットを受け取ったか */
  isReady = (): boolean =>
    this.readyFlags.competitions && this.readyFlags.masters && this.readyFlags.appState;

  /** 現在の保存先の種別。UIの出し分けに使う */
  getKind = (): StorageKind | null => this.backend?.kind ?? null;

  /** useSyncExternalStore用。データが変わるたびにコールバックが呼ばれる */
  subscribe = (callback: () => void): (() => void) => {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  };

  /** 同期エラーの通知を受け取る。App側でトーストを1つ出すために使う */
  onError = (callback: (message: string) => void): (() => void) => {
    this.errorListeners.add(callback);
    return () => {
      this.errorListeners.delete(callback);
    };
  };

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  /**
   * キャッシュから派生する値をまとめて作り直す。
   * useSyncExternalStore は参照が変わるたびに再レンダーするため、
   * ここで1回だけ作って以降は同じ参照を返し続ける必要がある。
   */
  private recomputeDerived(): void {
    // 大会履歴 = 「進行中の現在の大会」以外のすべて。
    // 終了済みの大会は現在の大会であっても履歴に載る(旧localStorage版と同じ挙動)。
    this.historyCache = this.competitionsCache.filter(
      (c) => c.status === 'finished' || c.id !== this.currentCompetitionId
    );
    this.activeMastersCache = this.mastersCache.filter((master) => master.isActive);

    const bytes = new Blob([
      JSON.stringify({
        competitions: this.competitionsCache,
        participantMasters: this.mastersCache,
      }),
    ]).size;
    const sizeKB = Math.round((bytes / 1024) * 100) / 100;
    const timestamps = [
      ...this.competitionsCache.map((c) => c.updatedAt),
      ...this.mastersCache.map((m) => m.lastUsed),
    ].filter((value): value is string => Boolean(value));
    const latest = timestamps.length > 0 ? timestamps.reduce((a, b) => (a > b ? a : b)) : null;

    this.storageInfoCache = {
      size: `${sizeKB} KB`,
      totalSize: `${sizeKB} KB`,
      itemCount: this.competitionsCache.length,
      lastUpdated: latest ? formatJapaneseDateTime(latest) : '-',
      kind: this.backend?.kind ?? null,
    };
  }

  // === 書き込みの共通処理 ===

  /**
   * 書き込み可能か。バックエンドが無い、または初回スナップショット待ちの間は書かない。
   *
   * 「初回スナップショット待ち」を弾くのが重要。保存先の切り替え直後に
   * 古い画面から保存が飛んでくると、切り替え前のデータを切り替え後の保存先に
   * 書き込んでしまう。ローカル⇄クラウドをまたぐため、これは単なる上書きではなく
   * 「別のデータ領域への混入」になる。
   *
   * 黙って無視し、例外は投げない。ログアウト直後に CompetitionContext の
   * useEffect が最後の保存を投げてくるのは正常な経路であり、
   * そこで throw すると画面が壊れるため。
   *
   * 書き込めるときは backend を返す。**複数段階の書き込みは、返された
   * backend を最後まで使い回すこと。** await を挟むと、その間にログイン・
   * ログアウトで this.backend が別物に差し替わっている可能性がある。
   * 圏外では setDoc の Promise が通信復帰まで解決しないため、この隙間は
   * 一瞬ではなく数分単位になりうる。
   */
  private writableBackend(): StorageBackend | null {
    if (!this.isReady()) return null;
    return this.backend;
  }

  /**
   * 書き込みPromiseを監視して未送信件数に反映する。
   * オフライン中はPromiseが解決しないため、その間は件数が減らない(＝同期中表示が続く)。
   *
   * 保存先が切り替わった後に前の書き込みが解決することがある。その分を
   * 新しいセッションの件数から引くと同期中表示が狂うため、セッションを見て弾く。
   */
  private track(promise: Promise<unknown>, operation: string): void {
    const session = this.sessionId;
    this.pendingWrites += 1;
    this.notify();
    promise
      .catch((error) => this.handleError(error, operation))
      .finally(() => {
        if (session !== this.sessionId) return;
        this.pendingWrites -= 1;
        this.notify();
      });
  }

  private handleError(error: unknown, operation: string): void {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`[StorageManager] ${operation} failed:`, err);
    logStorageError(err, operation, this.backend?.kind ?? 'unknown');
    this.errorListeners.forEach((listener) => listener(this.describeError(err)));
  }

  /**
   * エラーを利用者向けの文言にする。
   * ローカル保存の容量超過だけは対処が「通信を確認する」ではないため区別する。
   * 無言でデータが消えるのが最悪なので、必ず画面に出す。
   */
  private describeError(error: Error): string {
    if (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      return 'この端末の保存容量が上限に達しました。古い大会を削除するか、クラウド保存をご検討ください。';
    }
    if (this.backend?.kind === 'local') {
      return 'データの保存に失敗しました。ブラウザの設定をご確認ください。';
    }
    return 'データの同期に失敗しました。通信状態を確認してください。';
  }

  /** 未送信の書き込み数 (同期インジケータ用) */
  getPendingWriteCount = (): number => this.pendingWrites;

  /**
   * 未同期の書き込みが残っているか。
   * このセッションで投げた分と、前セッションから持ち越された分の両方を見る。
   */
  hasPendingWrites = (): boolean =>
    this.pendingWrites > 0 ||
    this.pendingFromMetadata.competitions ||
    this.pendingFromMetadata.masters ||
    this.pendingFromMetadata.appState;

  /** 同一ミリ秒に採番されたID同士の順序を決めるための連番 */
  private idSequence = 0;

  /**
   * IDを採番する。
   *
   * マスター一覧はID順（＝登録順）で並べるため、IDは必ず採番した順に並ぶ必要がある。
   * ところがDate.now()だけだと、一括インポートのように同期ループで連続採番したとき
   * 全件が同じミリ秒になり、残るランダム部分で順序が決まってしまう。
   * 旧アプリからの移行はこの経路を通るため、連番を挟んで採番順を保証する。
   *
   * 連番は36進4桁に揃える。桁数が揃っていないと辞書順が数値順とずれるため。
   * 4桁で足りなくなるのは1セッションで約168万件を採番した場合で、到達しない。
   */
  private generateId(): string {
    const sequence = (this.idSequence++).toString(36).padStart(4, '0');
    return `${Date.now()}-${sequence}-${Math.random().toString(36).slice(2, 11)}`;
  }

  // === 現在の大会管理 ===

  /** 進行中の大会を保存する。終了させるときは finishCurrentCompetition を使う */
  saveCurrentCompetition(competition: Competition): void {
    const backend = this.writableBackend();
    if (!backend) return;

    const json = JSON.stringify(competition);
    if (json === this.lastSavedJson) return;
    this.lastSavedJson = json;

    const { id, ...fields } = competition;
    const needsPointerUpdate = this.currentCompetitionId !== id;
    if (needsPointerUpdate) {
      // 楽観的に更新しておき、連続保存でポインタを何度も書かないようにする
      this.currentCompetitionId = id;
    }

    this.track(
      (async () => {
        await backend.setCompetition(id, fields);
        if (needsPointerUpdate) {
          await backend.setAppState(id);
        }
      })(),
      'saveCurrentCompetition'
    );
  }

  /**
   * 大会を終了状態で保存し、「現在の大会」ポインタを外す。
   * ドキュメントは残るので、履歴・通算成績からは今まで通り参照できる。
   *
   * 大会を途中で破棄する手段は用意していない。破棄したい場合も一度終了させ、
   * データ管理画面から deleteCompetition する。
   */
  finishCurrentCompetition(competition: Competition): void {
    const backend = this.writableBackend();
    if (!backend) return;

    this.lastSavedJson = null;
    this.currentCompetitionId = null;

    const { id, ...fields } = competition;
    this.track(
      (async () => {
        await backend.setCompetition(id, fields);
        await backend.setAppState(null);
      })(),
      'finishCurrentCompetition'
    );
  }

  /**
   * 「現在の大会」ポインタだけを外す。大会ドキュメントには触れない。
   * 旧版が残した「終了済みなのに現在の大会のまま」の状態を直すために使う。
   */
  releaseCurrentCompetition(): void {
    const backend = this.writableBackend();
    if (!backend) return;
    if (!this.currentCompetitionId) return;
    this.lastSavedJson = null;
    this.currentCompetitionId = null;
    this.track(backend.setAppState(null), 'releaseCurrentCompetition');
  }

  /** 現在の大会を読み込み */
  loadCurrentCompetition(): Competition | null {
    if (!this.currentCompetitionId) return null;
    return this.competitionsCache.find((c) => c.id === this.currentCompetitionId) ?? null;
  }

  // === 大会履歴管理 ===

  /**
   * 大会を保存する。localStorage版では履歴用の別枠に積んでいたが、
   * 現在は大会をすべて1つのコレクション(ローカル保存では1つのマップ)に入れ、
   * status と「現在の大会ポインタ」で区別する。件数の上限は設けていない
   * (通算的中率の集計に全大会が必要なため)。
   */
  saveCompetitionToHistory(competition: Competition): void {
    const backend = this.writableBackend();
    if (!backend) return;
    const { id, ...fields } = competition;
    this.track(backend.setCompetition(id, fields), 'saveCompetitionToHistory');
  }

  /**
   * 大会を1件削除する。テスト用に作った大会を残したくない場合に使う。
   *
   * 削除した大会の的中数は通算成績から外れる。通算は全大会から都度集計しているため、
   * ここでドキュメントを消すだけで自動的にそうなる。
   *
   * 終了済みの大会でも「現在の大会」ポインタが指したままのことがあるため
   * (recomputeDerived のコメント参照)、自分が指されていたらポインタも外す。
   * 外さないと存在しないドキュメントを指したままになる。
   */
  deleteCompetition(competitionId: string): void {
    const backend = this.writableBackend();
    if (!backend) return;

    const isCurrent = this.currentCompetitionId === competitionId;
    if (isCurrent) {
      this.lastSavedJson = null;
      this.currentCompetitionId = null;
    }

    this.track(
      (async () => {
        if (isCurrent) {
          await backend.setAppState(null);
        }
        await backend.deleteCompetition(competitionId);
      })(),
      'deleteCompetition'
    );
  }

  getCompetitionHistory = (): Competition[] => this.historyCache;

  /** 全大会を取得 (現在の大会を含む)。通算集計はこちらを使う */
  getAllCompetitions = (): Competition[] => this.competitionsCache;

  getCompetitionById(id: string): Competition | null {
    return this.competitionsCache.find((c) => c.id === id) ?? null;
  }

  // === 参加者マスター管理 ===

  getParticipantMasters = (): ParticipantMaster[] => this.activeMastersCache;

  getAllParticipantMasters = (): ParticipantMaster[] => this.mastersCache;

  /**
   * 参加者マスターを保存。IDはクライアント側で採番するため、
   * 書き込みの完了を待たずに新しいマスターを同期的に返せる。
   */
  saveParticipantMaster(master: Omit<ParticipantMaster, 'id' | 'createdAt'>): ParticipantMaster {
    const newMaster: ParticipantMaster = {
      ...master,
      id: this.generateId(),
      createdAt: new Date().toISOString(),
    };

    const backend = this.writableBackend();
    if (backend) {
      const { id, ...fields } = newMaster;
      this.track(backend.setParticipantMaster(id, fields), 'saveParticipantMaster');
    }

    return newMaster;
  }

  /**
   * マスターの内容を書き換える（無効化/有効化、氏名・段位の訂正）。
   *
   * lastUsedは更新しない。「最後に大会で使った日時」という意味の値であり、
   * 無効化や改名は使用ではないため。以前はここで現在時刻を書いていたが、
   * 一覧が使用回数→最終使用日時の順に並ぶため、無効化するとその行が
   * 上に飛んで別の人を押してしまう不具合になっていた。
   * 使用としてのカウントは incrementMasterUsage が担当する。
   */
  updateParticipantMaster(masterId: string, updates: Partial<ParticipantMaster>): void {
    const backend = this.writableBackend();
    if (!backend) return;
    // idはドキュメントIDで表現するのでフィールドとしては書き込まない
    const fields: Partial<ParticipantMaster> = { ...updates };
    delete fields.id;
    this.track(
      backend.mergeParticipantMaster(masterId, fields),
      'updateParticipantMaster'
    );
  }

  /** 使用回数を+1する */
  incrementMasterUsage(masterId: string): void {
    const backend = this.writableBackend();
    if (!backend) return;
    this.track(
      backend.incrementMasterUsage(masterId, new Date().toISOString()),
      'incrementMasterUsage'
    );
  }

  /**
   * マスターを完全に削除する。**UIからは意図的に呼んでいない。**
   *
   * 削除しても過去の大会の記録にはmasterIdが残るため、同じ人を登録し直すと
   * 別IDが振られ、通算成績がその人の中で2行に割れてしまう。
   * 一覧から消したいだけなら isActive=false（無効化）を使うこと。
   * 無効化ならIDが残るので、再登録時に元のマスターが有効に戻り成績が繋がる。
   */
  deleteParticipantMaster(masterId: string): void {
    const backend = this.writableBackend();
    if (!backend) return;
    this.track(backend.deleteParticipantMaster(masterId), 'deleteParticipantMaster');
  }

  /**
   * 氏名からマスターを探す。無効化済み(isActive=false)のマスターも対象にする。
   * 有効なものだけを見ると、一度無効化した人を再登録したときに同名のマスターが
   * もう1件できてしまい、同一人物の通算成績がmasterIdごとに割れるため。
   *
   * 比較は前後の空白を落として行う。空白付きで保存された古いデータが
   * 残っていても、見た目が同じなら同じ人として引き当てるため。
   */
  findMasterByName(name: string): ParticipantMaster | null {
    const target = name.trim();
    return this.mastersCache.find((master) => master.name.trim() === target) ?? null;
  }

  importParticipantMasters(importData: unknown): ImportResult {
    const backend = this.writableBackend();
    if (!backend) {
      return { success: false, error: 'データの読み込みが完了していません。少し待ってからお試しください' };
    }

    try {
      const payload = importData as { participantMasters?: unknown };
      if (!Array.isArray(payload?.participantMasters)) {
        return { success: false, error: 'Invalid import data format' };
      }

      // 氏名は前後の空白を落として比較・保存する。
      // 空白付きのまま取り込むと見た目が同じ別マスターが2件並び、
      // 一覧でどちらを選んだかで通算成績が2行に割れてしまうため。
      const existingNames = new Set(this.mastersCache.map((m) => m.name.trim()));
      const now = new Date().toISOString();

      const newMasters: ParticipantMaster[] = payload.participantMasters
        .filter((master: ParticipantMaster) => {
          if (!master?.name?.trim() || master.rank === undefined || master.rank === null) return false;
          if (existingNames.has(master.name.trim())) return false;
          // 同一ファイル内に同名が複数あっても1件だけ取り込む
          existingNames.add(master.name.trim());
          return true;
        })
        .map((master: ParticipantMaster) => ({
          ...master,
          name: master.name.trim(),
          id: this.generateId(),
          createdAt: now,
          isActive: master.isActive !== undefined ? master.isActive : true,
          usageCount: master.usageCount || 0,
          lastUsed: master.lastUsed || now,
        }));

      if (newMasters.length > 0) {
        const docs: StoredDoc<MasterFields>[] = newMasters.map(({ id, ...fields }) => ({
          id,
          fields,
        }));
        this.track(backend.putParticipantMasters(docs), 'importParticipantMasters');
      }

      return { success: true, imported: newMasters.length };
    } catch (error) {
      this.handleError(error, 'importParticipantMasters');
      return { success: false, error: 'インポートに失敗しました' };
    }
  }

  // === エクスポート機能 ===

  exportParticipantMasters(): void {
    try {
      const exportData = {
        participantMasters: this.mastersCache,
        exportedAt: new Date().toISOString(),
        version: '1.0',
      };

      this.downloadAsFile(
        JSON.stringify(exportData, null, 2),
        `参加者マスター_${getTodayJapaneseDate()}.json`,
        'application/json'
      );
    } catch (error) {
      console.error('Failed to export participant masters:', error);
      throw new Error('エクスポートに失敗しました');
    }
  }

  // === ユーティリティ ===

  getStorageInfo = (): StorageInfo => this.storageInfoCache;

  /**
   * 購読を解除し、キャッシュを完全に破棄する。
   * 保存先を切り替えるとき(ログイン・ログアウト)に必ず呼ぶこと。呼ばないと、
   * 共用端末で別のアカウントに切り替えたときに前の人の大会データが見えてしまう。
   */
  dispose(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.backend?.dispose();
    this.backend = null;
    this.initialized = false;
    this.readyFlags = { competitions: false, masters: false, appState: false };
    this.pendingFromMetadata = { competitions: false, masters: false, appState: false };
    this.competitionsCache = [];
    this.historyCache = [];
    this.mastersCache = [];
    this.activeMastersCache = [];
    this.storageInfoCache = EMPTY_STORAGE_INFO;
    this.currentCompetitionId = null;
    this.lastSavedJson = null;
    this.pendingWrites = 0;
    // 進行中の書き込みが後から解決しても、次のセッションの件数を減らさないようにする
    this.sessionId += 1;
    // 購読中のコンポーネントを空の状態で描き直させる
    this.notify();
  }

  private downloadAsFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// シングルトンインスタンスをエクスポート
export const storageManager = new StorageManager();
