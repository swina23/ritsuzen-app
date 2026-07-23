/**
 * 保存先(バックエンド)の抽象インターフェース
 *
 * StorageManager から「購読」と「書き込み」だけを切り出したもの。
 * キャッシュ・派生値の計算・通知・ID採番・import/export は StorageManager 側に残し、
 * バックエンド間で共有する。ロジックを二重に持たないことが最優先。
 *
 * バックエンドは plain なレコードしか扱わない。normalizeCompetition() の適用、
 * id フィールドの剥がし方、履歴の絞り込みといったドメイン知識は持ち込まない。
 */

import { Competition, ParticipantMaster } from '../../types';

/** UIの出し分けに使う保存先の種別 */
export type StorageKind = 'cloud' | 'local';

/**
 * ドキュメント本体のフィールド。
 * idはドキュメントIDで表現し、フィールドとしては書き込まない
 * ——という規約を型で固定している。
 */
export type CompetitionFields = Omit<Competition, 'id'>;
export type MasterFields = Omit<ParticipantMaster, 'id'>;

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
   * Firestoreはメタデータのみの変更通知を送ってくるため、これが無いと
   * 参照が変わって無駄な再レンダーを招く。ローカル実装は常に true。
   */
  hasDocChanges: boolean;
}

export type Unsubscribe = () => void;

export interface StorageBackend {
  /** UIの出し分けに使う */
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

  // === 書き込み (すべてPromiseを返す。呼び出し側で track する) ===

  setCompetition(id: string, fields: CompetitionFields): Promise<void>;
  deleteCompetition(id: string): Promise<void>;
  setAppState(competitionId: string | null): Promise<void>;

  setParticipantMaster(id: string, fields: MasterFields): Promise<void>;
  /** 部分更新。既存フィールドは保持する */
  mergeParticipantMaster(id: string, updates: Partial<MasterFields>): Promise<void>;
  deleteParticipantMaster(id: string): Promise<void>;
  /** usageCount を +1 し lastUsed を更新する。アトミック性の担保は実装に委ねる */
  incrementMasterUsage(id: string, lastUsed: string): Promise<void>;

  /** 複数マスターの一括書き込み (インポート用) */
  putParticipantMasters(masters: StoredDoc<MasterFields>[]): Promise<void>;

  /** 購読の後片付け。キャッシュ破棄は StorageManager 側の責務 */
  dispose(): void;
}
