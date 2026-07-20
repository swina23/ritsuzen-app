/**
 * Firestore操作を抽象化するStorageManagerクラス
 *
 * 公開インターフェース(メソッド名・引数・戻り値の形)はlocalStorage版から変えていない。
 * 内部だけを「メモリキャッシュ + onSnapshot購読」に差し替えることで、
 * 呼び出し側の大半を無改修のまま Firestore に移行している。
 *
 *  - 読み取り: キャッシュから同期的に返す (購読が張られるまでは空)
 *  - 書き込み: Firestoreへ投げっぱなし。SDKがローカルキャッシュを即時更新し、
 *             オフライン中はIndexedDBにキューイングして復帰時に自動送信する。
 *
 * 読み取り系は useSyncExternalStore から使えるよう、返す配列・オブジェクトを
 * スナップショットごとに1回だけ作り直して参照を安定させている。
 */

import { Competition, ParticipantMaster } from '../types';
import { logStorageError } from './errorUtils';
import { normalizeCompetition } from './competitionMigration';
import { formatJapaneseDateTime, getTodayJapaneseDate } from './dateUtils';
import { db } from '../lib/firebase';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  writeBatch,
  increment,
} from 'firebase/firestore';

const COMPETITIONS = 'competitions';
const PARTICIPANT_MASTERS = 'participantMasters';
const APP_STATE = 'appState';
const CURRENT_DOC = 'current';

/** writeBatchの上限は500操作。余裕を持たせて分割する */
const BATCH_CHUNK_SIZE = 450;

export interface StorageInfo {
  size: string;
  itemCount: number;
  lastUpdated: string;
  totalSize: string;
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
};

export class StorageManager {
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
   * Firestore SDKが保持している未送信ミューテーションの有無。
   * pendingWrites はこのインスタンスが投げた書き込みしか数えられないため、
   * 「圏外で入力 → タブを閉じる → 開き直す」ケースを取りこぼす。
   * IndexedDBに残ったキューはこちらのメタデータでしか分からない。
   */
  private pendingFromMetadata = { competitions: false, masters: false, appState: false };

  /** 直前に保存した大会のJSON。同一内容の重複書き込みを避ける */
  private lastSavedJson: string | null = null;

  // === 初期化・購読 ===

  /**
   * Firestoreの購読を開始する。認証済みになってから1回だけ呼ぶこと。
   * 複数回呼ばれても2回目以降は何もしない。
   */
  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.unsubscribers.push(
      onSnapshot(
        collection(db, COMPETITIONS),
        { includeMetadataChanges: true },
        (snapshot) => {
          this.pendingFromMetadata.competitions = snapshot.metadata.hasPendingWrites;
          // メタデータだけが変わった通知では、キャッシュを作り直すと
          // 参照が変わって無駄な再レンダーを招くのでスキップする
          if (snapshot.docChanges().length > 0 || !this.readyFlags.competitions) {
            this.competitionsCache = snapshot.docs
              .map((d) =>
                normalizeCompetition({ ...(d.data() as Omit<Competition, 'id'>), id: d.id })
              )
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
      onSnapshot(
        collection(db, PARTICIPANT_MASTERS),
        { includeMetadataChanges: true },
        (snapshot) => {
          this.pendingFromMetadata.masters = snapshot.metadata.hasPendingWrites;
          if (snapshot.docChanges().length > 0 || !this.readyFlags.masters) {
            this.mastersCache = snapshot.docs.map((d) => ({
              ...(d.data() as Omit<ParticipantMaster, 'id'>),
              id: d.id,
            }));
            this.readyFlags.masters = true;
            this.recomputeDerived();
          }
          this.notify();
        },
        (error) => this.handleError(error, 'subscribeParticipantMasters')
      )
    );

    this.unsubscribers.push(
      onSnapshot(
        doc(db, APP_STATE, CURRENT_DOC),
        { includeMetadataChanges: true },
        (snapshot) => {
          this.pendingFromMetadata.appState = snapshot.metadata.hasPendingWrites;
          const competitionId = snapshot.data()?.competitionId;
          this.currentCompetitionId = typeof competitionId === 'string' ? competitionId : null;
          this.readyFlags.appState = true;
          this.recomputeDerived();
          this.notify();
        },
        (error) => this.handleError(error, 'subscribeAppState')
      )
    );
  }

  /** 3つの購読すべてが初回スナップショットを受け取ったか */
  isReady = (): boolean =>
    this.readyFlags.competitions && this.readyFlags.masters && this.readyFlags.appState;

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
    };
  }

  // === 書き込みの共通処理 ===

  /**
   * 書き込みPromiseを監視して未送信件数に反映する。
   * オフライン中はPromiseが解決しないため、その間は件数が減らない(＝同期中表示が続く)。
   */
  private track(promise: Promise<unknown>, operation: string): void {
    this.pendingWrites += 1;
    this.notify();
    promise
      .catch((error) => this.handleError(error, operation))
      .finally(() => {
        this.pendingWrites -= 1;
        this.notify();
      });
  }

  private handleError(error: unknown, operation: string): void {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`[StorageManager] ${operation} failed:`, err);
    logStorageError(err, operation, 'firestore');
    this.errorListeners.forEach((listener) =>
      listener('データの同期に失敗しました。通信状態を確認してください。')
    );
  }

  /** 未送信の書き込み数 (同期インジケータ用) */
  getPendingWriteCount = (): number => this.pendingWrites;

  /**
   * 未同期の書き込みが残っているか。
   * このセッションで投げた分と、前セッションからIndexedDBに残っている分の両方を見る。
   */
  hasPendingWrites = (): boolean =>
    this.pendingWrites > 0 ||
    this.pendingFromMetadata.competitions ||
    this.pendingFromMetadata.masters ||
    this.pendingFromMetadata.appState;

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  /** 現在の大会を指すポインタを更新する */
  private async setCurrentPointer(competitionId: string | null): Promise<void> {
    this.currentCompetitionId = competitionId;
    await setDoc(doc(db, APP_STATE, CURRENT_DOC), { competitionId });
  }

  // === 現在の大会管理 ===

  /**
   * 現在の大会を保存。null を渡すと「現在の大会なし」になり、
   * 未終了の大会だったdocumentは削除される(旧版のリセット挙動と同じ)。
   */
  saveCurrentCompetition(competition: Competition | null): void {
    if (!competition) {
      this.lastSavedJson = null;
      const current = this.loadCurrentCompetition();
      const shouldDelete = current !== null && current.status !== 'finished';
      const currentId = current?.id;
      this.track(
        (async () => {
          await this.setCurrentPointer(null);
          if (shouldDelete && currentId) {
            await deleteDoc(doc(db, COMPETITIONS, currentId));
          }
        })(),
        'saveCurrentCompetition'
      );
      return;
    }

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
        await setDoc(doc(db, COMPETITIONS, id), fields);
        if (needsPointerUpdate) {
          await this.setCurrentPointer(id);
        }
      })(),
      'saveCurrentCompetition'
    );
  }

  /** 現在の大会を読み込み */
  loadCurrentCompetition(): Competition | null {
    if (!this.currentCompetitionId) return null;
    return this.competitionsCache.find((c) => c.id === this.currentCompetitionId) ?? null;
  }

  // === 大会履歴管理 ===

  /**
   * 大会を保存する。localStorage版では履歴用の別枠に積んでいたが、
   * Firestoreでは大会はすべて competitions コレクションの1ドキュメントであり、
   * status と「現在の大会ポインタ」で区別する。件数の上限は設けていない
   * (通算的中率の集計に全大会が必要なため)。
   */
  saveCompetitionToHistory(competition: Competition): void {
    const { id, ...fields } = competition;
    this.track(setDoc(doc(db, COMPETITIONS, id), fields), 'saveCompetitionToHistory');
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

    const { id, ...fields } = newMaster;
    this.track(setDoc(doc(db, PARTICIPANT_MASTERS, id), fields), 'saveParticipantMaster');

    return newMaster;
  }

  updateParticipantMaster(masterId: string, updates: Partial<ParticipantMaster>): void {
    // idはドキュメントIDで表現するのでフィールドとしては書き込まない
    const fields = { ...updates };
    delete fields.id;
    this.track(
      setDoc(
        doc(db, PARTICIPANT_MASTERS, masterId),
        { ...fields, lastUsed: new Date().toISOString() },
        { merge: true }
      ),
      'updateParticipantMaster'
    );
  }

  /** 使用回数を+1する。incrementを使うので複数端末から同時に呼ばれても取りこぼさない */
  incrementMasterUsage(masterId: string): void {
    this.track(
      setDoc(
        doc(db, PARTICIPANT_MASTERS, masterId),
        { usageCount: increment(1), lastUsed: new Date().toISOString() },
        { merge: true }
      ),
      'incrementMasterUsage'
    );
  }

  deleteParticipantMaster(masterId: string): void {
    this.track(deleteDoc(doc(db, PARTICIPANT_MASTERS, masterId)), 'deleteParticipantMaster');
  }

  findMasterByName(name: string): ParticipantMaster | null {
    return this.activeMastersCache.find((master) => master.name === name) ?? null;
  }

  importParticipantMasters(importData: unknown): ImportResult {
    try {
      const payload = importData as { participantMasters?: unknown };
      if (!Array.isArray(payload?.participantMasters)) {
        return { success: false, error: 'Invalid import data format' };
      }

      const existingNames = new Set(this.mastersCache.map((m) => m.name));
      const now = new Date().toISOString();

      const newMasters: ParticipantMaster[] = payload.participantMasters
        .filter((master: ParticipantMaster) => {
          if (!master?.name || master.rank === undefined || master.rank === null) return false;
          if (existingNames.has(master.name)) return false;
          // 同一ファイル内に同名が複数あっても1件だけ取り込む
          existingNames.add(master.name);
          return true;
        })
        .map((master: ParticipantMaster) => ({
          ...master,
          id: this.generateId(),
          createdAt: now,
          isActive: master.isActive !== undefined ? master.isActive : true,
          usageCount: master.usageCount || 0,
          lastUsed: master.lastUsed || now,
        }));

      if (newMasters.length > 0) {
        this.track(
          this.commitInChunks(newMasters, (batch, master) => {
            const { id, ...fields } = master;
            batch.set(doc(db, PARTICIPANT_MASTERS, id), fields);
          }),
          'importParticipantMasters'
        );
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

  /** 全データを削除する。Firestore上のドキュメントも消えるため取り消せない */
  clearAllData(): void {
    const targets = [
      ...this.competitionsCache.map((c) => doc(db, COMPETITIONS, c.id)),
      ...this.mastersCache.map((m) => doc(db, PARTICIPANT_MASTERS, m.id)),
      doc(db, APP_STATE, CURRENT_DOC),
    ];

    this.lastSavedJson = null;
    this.currentCompetitionId = null;

    this.track(
      this.commitInChunks(targets, (batch, target) => batch.delete(target)),
      'clearAllData'
    );
  }

  /** writeBatchの上限を超えないよう分割してコミットする */
  private async commitInChunks<T>(
    items: T[],
    apply: (batch: ReturnType<typeof writeBatch>, item: T) => void
  ): Promise<void> {
    for (let i = 0; i < items.length; i += BATCH_CHUNK_SIZE) {
      const batch = writeBatch(db);
      items.slice(i, i + BATCH_CHUNK_SIZE).forEach((item) => apply(batch, item));
      await batch.commit();
    }
  }

  /**
   * 購読を解除し、キャッシュを完全に破棄する。
   * ログアウト時に必ず呼ぶこと。呼ばないと、共用端末で別のアカウントに
   * 切り替えたときに前の人の大会データがそのまま見えてしまう。
   */
  dispose(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
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
