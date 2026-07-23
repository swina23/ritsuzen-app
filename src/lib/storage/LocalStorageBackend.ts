/**
 * この端末のlocalStorageを保存先とするバックエンド（無料モード）
 *
 * Firestoreのコレクション構造をそのまま写した形で1つのキーに入れる。
 * バックエンド間でデータを行き来させる（将来のローカル→クラウド吸い上げ）ときに
 * 変換が要らないため。
 *
 * localStorageには変更通知が無い（`storage` イベントは**他タブ**の変更でしか
 * 発火しない）ので、自タブの書き込みは自分でリスナーへ通知する。
 */

import { readLegacyStore } from './legacyMigration';
import type {
  CompetitionFields,
  MasterFields,
  Snapshot,
  StorageBackend,
  StorageKind,
  StoredDoc,
  Unsubscribe,
} from './StorageBackend';

export const LOCAL_STORAGE_KEY = 'ritsuzen-app-local-v2';

/**
 * localStorageに入れる形。旧版の `ritsuzen-app-data` とは構造が違うため、
 * 同じキーに新旧が混ざらないよう別キーにしている。
 */
export interface LocalStoreV2 {
  version: 2;
  competitions: Record<string, CompetitionFields>;
  participantMasters: Record<string, MasterFields>;
  appState: { competitionId: string | null };
}

const emptyStore = (): LocalStoreV2 => ({
  version: 2,
  competitions: {},
  participantMasters: {},
  appState: { competitionId: null },
});

/** マップを StoredDoc の配列に変換する */
const toDocs = <T>(map: Record<string, T>): StoredDoc<T>[] =>
  Object.entries(map).map(([id, fields]) => ({ id, fields }));

export class LocalStorageBackend implements StorageBackend {
  readonly kind: StorageKind = 'local';

  private store: LocalStoreV2 | null = null;

  private competitionListeners = new Set<(snapshot: Snapshot<CompetitionFields>) => void>();
  private masterListeners = new Set<(snapshot: Snapshot<MasterFields>) => void>();
  private appStateListeners = new Set<(competitionId: string | null, hasPendingWrites: boolean) => void>();

  private errorListeners = new Set<(error: unknown) => void>();

  /** 他タブでの変更を拾うためのハンドラ。dispose で必ず外す */
  private onStorageEvent = (event: StorageEvent): void => {
    if (event.key !== null && event.key !== LOCAL_STORAGE_KEY) return;
    // 他タブが書き換えたので、メモリ上の写しを捨てて読み直す
    this.store = null;
    this.emit();
  };

  constructor() {
    window.addEventListener('storage', this.onStorageEvent);
  }

  // === 購読 ===
  //
  // 初回スナップショットは**同期的に**流す。ローカルは即座に返せるので、
  // こうすると StorageManager.isReady() が initialize() 直後から真になり、
  // 「データを読み込み中…」の一瞬のちらつきが出ない。
  // (StorageManager 側の不変条件については initialize() のコメントを参照)

  subscribeCompetitions(
    onSnapshot: (snapshot: Snapshot<CompetitionFields>) => void,
    onError: (error: unknown) => void
  ): Unsubscribe {
    this.competitionListeners.add(onSnapshot);
    this.errorListeners.add(onError);
    onSnapshot(this.competitionSnapshot());
    return () => {
      this.competitionListeners.delete(onSnapshot);
      this.errorListeners.delete(onError);
    };
  }

  subscribeParticipantMasters(
    onSnapshot: (snapshot: Snapshot<MasterFields>) => void,
    onError: (error: unknown) => void
  ): Unsubscribe {
    this.masterListeners.add(onSnapshot);
    this.errorListeners.add(onError);
    onSnapshot(this.masterSnapshot());
    return () => {
      this.masterListeners.delete(onSnapshot);
      this.errorListeners.delete(onError);
    };
  }

  subscribeAppState(
    onSnapshot: (competitionId: string | null, hasPendingWrites: boolean) => void,
    onError: (error: unknown) => void
  ): Unsubscribe {
    this.appStateListeners.add(onSnapshot);
    this.errorListeners.add(onError);
    onSnapshot(this.load().appState.competitionId, false);
    return () => {
      this.appStateListeners.delete(onSnapshot);
      this.errorListeners.delete(onError);
    };
  }

  // === 書き込み ===

  setCompetition(id: string, fields: CompetitionFields): Promise<void> {
    return this.mutate((store) => {
      store.competitions[id] = fields;
    });
  }

  deleteCompetition(id: string): Promise<void> {
    return this.mutate((store) => {
      delete store.competitions[id];
    });
  }

  setAppState(competitionId: string | null): Promise<void> {
    return this.mutate((store) => {
      store.appState = { competitionId };
    });
  }

  setParticipantMaster(id: string, fields: MasterFields): Promise<void> {
    return this.mutate((store) => {
      store.participantMasters[id] = fields;
    });
  }

  mergeParticipantMaster(id: string, updates: Partial<MasterFields>): Promise<void> {
    return this.mutate((store) => {
      const existing = store.participantMasters[id];
      if (!existing) return;
      store.participantMasters[id] = { ...existing, ...updates };
    });
  }

  deleteParticipantMaster(id: string): Promise<void> {
    return this.mutate((store) => {
      delete store.participantMasters[id];
    });
  }

  /**
   * 使用回数を+1する。
   *
   * Firestore実装は increment() センチネルでアトミックに加算するが、
   * ローカルは read-modify-write で代替する。同一端末で2タブ開いて同時に
   * 呼ばれると一方の加算が失われるが、usageCount は v1.6.0 で画面表示を
   * やめており（値だけ持ち続けている）、ずれても実害が無い。
   * **使用回数を再び表示する・並び順に使う場合はここを見直すこと。**
   */
  incrementMasterUsage(id: string, lastUsed: string): Promise<void> {
    return this.mutate((store) => {
      const existing = store.participantMasters[id];
      if (!existing) return;
      store.participantMasters[id] = {
        ...existing,
        usageCount: (existing.usageCount || 0) + 1,
        lastUsed,
      };
    });
  }

  /** 一括書き込み。localStorageは1回の setItem で済むので分割しない */
  putParticipantMasters(masters: StoredDoc<MasterFields>[]): Promise<void> {
    return this.mutate((store) => {
      masters.forEach(({ id, fields }) => {
        store.participantMasters[id] = fields;
      });
    });
  }

  dispose(): void {
    window.removeEventListener('storage', this.onStorageEvent);
    this.competitionListeners.clear();
    this.masterListeners.clear();
    this.appStateListeners.clear();
    this.errorListeners.clear();
    this.store = null;
  }

  // === 内部 ===

  /**
   * localStorageから読み込む（初回のみ。以降はメモリ上の写しを使う）。
   * v2のデータが無ければ、旧版(main)のデータを1回だけ変換して取り込む。
   */
  private load(): LocalStoreV2 {
    if (this.store) return this.store;

    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<LocalStoreV2>;
        this.store = {
          version: 2,
          competitions: parsed.competitions ?? {},
          participantMasters: parsed.participantMasters ?? {},
          appState: { competitionId: parsed.appState?.competitionId ?? null },
        };
        return this.store;
      }
    } catch (error) {
      // 壊れたJSONで起動不能にはしない。空で始めつつ、原因は通知する。
      console.error('[LocalStorageBackend] 保存データの読み込みに失敗しました:', error);
      this.reportError(error);
      this.store = emptyStore();
      return this.store;
    }

    // 旧版のデータがあれば引き継ぐ。旧キーは残すので切り戻せる。
    const legacy = readLegacyStore();
    if (legacy) {
      this.store = legacy;
      this.persistQuietly(legacy);
      return this.store;
    }

    this.store = emptyStore();
    return this.store;
  }

  /**
   * 変更を適用し、保存して、リスナーに通知する。
   *
   * 保存に失敗（容量超過など）してもメモリ上の写しは巻き戻さない。
   * 大会の入力中に画面が前の状態へ戻る方が混乱が大きいため、
   * その場の表示は保ったままエラーを通知し、判断を利用者に委ねる。
   */
  private mutate(apply: (store: LocalStoreV2) => void): Promise<void> {
    const store = this.load();
    apply(store);

    let failure: unknown = null;
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(store));
    } catch (error) {
      failure = error;
    }

    this.emit();
    return failure ? Promise.reject(failure) : Promise.resolve();
  }

  /** 取り込み時など、失敗しても処理を続ける保存 */
  private persistQuietly(store: LocalStoreV2): void {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(store));
    } catch (error) {
      console.error('[LocalStorageBackend] 保存に失敗しました:', error);
      this.reportError(error);
    }
  }

  private reportError(error: unknown): void {
    this.errorListeners.forEach((listener) => listener(error));
  }

  private competitionSnapshot(): Snapshot<CompetitionFields> {
    return {
      docs: toDocs(this.load().competitions),
      hasPendingWrites: false,
      hasDocChanges: true,
    };
  }

  private masterSnapshot(): Snapshot<MasterFields> {
    return {
      docs: toDocs(this.load().participantMasters),
      hasPendingWrites: false,
      hasDocChanges: true,
    };
  }

  /** 3種類すべてのリスナーに現在の状態を流す */
  private emit(): void {
    const competitions = this.competitionSnapshot();
    this.competitionListeners.forEach((listener) => listener(competitions));

    const masters = this.masterSnapshot();
    this.masterListeners.forEach((listener) => listener(masters));

    const competitionId = this.load().appState.competitionId;
    this.appStateListeners.forEach((listener) => listener(competitionId, false));
  }
}
