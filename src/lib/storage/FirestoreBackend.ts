/**
 * Firestoreを保存先とするバックエンド
 *
 * StorageManager にあったFirestore依存(onSnapshot / setDoc / deleteDoc /
 * writeBatch / increment)をそのまま移設したもの。挙動は変えていない。
 *
 * このファイルは動的 import される (CompetitionContext を参照)。
 * クラウド保存はログインした人だけの機能なので、未ログインで使う分には
 * Firestore のコードを読み込む必要がない。
 */

import {
  collection,
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { requireDb } from '../firebase';
import type {
  CompetitionFields,
  MasterFields,
  Snapshot,
  StorageBackend,
  StorageKind,
  StoredDoc,
  Unsubscribe,
} from './StorageBackend';

const COMPETITIONS = 'competitions';
const PARTICIPANT_MASTERS = 'participantMasters';
const APP_STATE = 'appState';
const CURRENT_DOC = 'current';

/** writeBatchの上限は500操作。余裕を持たせて分割する */
const BATCH_CHUNK_SIZE = 450;

export class FirestoreBackend implements StorageBackend {
  readonly kind: StorageKind = 'cloud';

  /**
   * 生成時にFirestoreを掴む。環境変数が無ければここで throw し、
   * CompetitionContext 側で端末保存にフォールバックされる。
   */
  private readonly db = requireDb();

  private unsubscribers: Unsubscribe[] = [];

  // === 購読 ===

  subscribeCompetitions(
    onSnapshotCallback: (snapshot: Snapshot<CompetitionFields>) => void,
    onError: (error: unknown) => void
  ): Unsubscribe {
    return this.register(
      onSnapshot(
        collection(this.db, COMPETITIONS),
        { includeMetadataChanges: true },
        (snapshot) => {
          onSnapshotCallback({
            docs: snapshot.docs.map((d) => ({
              id: d.id,
              fields: d.data() as CompetitionFields,
            })),
            hasPendingWrites: snapshot.metadata.hasPendingWrites,
            hasDocChanges: snapshot.docChanges().length > 0,
          });
        },
        onError
      )
    );
  }

  subscribeParticipantMasters(
    onSnapshotCallback: (snapshot: Snapshot<MasterFields>) => void,
    onError: (error: unknown) => void
  ): Unsubscribe {
    return this.register(
      onSnapshot(
        collection(this.db, PARTICIPANT_MASTERS),
        { includeMetadataChanges: true },
        (snapshot) => {
          onSnapshotCallback({
            docs: snapshot.docs.map((d) => ({
              id: d.id,
              fields: d.data() as MasterFields,
            })),
            hasPendingWrites: snapshot.metadata.hasPendingWrites,
            hasDocChanges: snapshot.docChanges().length > 0,
          });
        },
        onError
      )
    );
  }

  subscribeAppState(
    onSnapshotCallback: (competitionId: string | null, hasPendingWrites: boolean) => void,
    onError: (error: unknown) => void
  ): Unsubscribe {
    return this.register(
      onSnapshot(
        doc(this.db, APP_STATE, CURRENT_DOC),
        { includeMetadataChanges: true },
        (snapshot) => {
          const competitionId = snapshot.data()?.competitionId;
          onSnapshotCallback(
            typeof competitionId === 'string' ? competitionId : null,
            snapshot.metadata.hasPendingWrites
          );
        },
        onError
      )
    );
  }

  // === 書き込み ===

  setCompetition(id: string, fields: CompetitionFields): Promise<void> {
    return setDoc(doc(this.db, COMPETITIONS, id), fields);
  }

  deleteCompetition(id: string): Promise<void> {
    return deleteDoc(doc(this.db, COMPETITIONS, id));
  }

  setAppState(competitionId: string | null): Promise<void> {
    return setDoc(doc(this.db, APP_STATE, CURRENT_DOC), { competitionId });
  }

  setParticipantMaster(id: string, fields: MasterFields): Promise<void> {
    return setDoc(doc(this.db, PARTICIPANT_MASTERS, id), fields);
  }

  mergeParticipantMaster(id: string, updates: Partial<MasterFields>): Promise<void> {
    return setDoc(doc(this.db, PARTICIPANT_MASTERS, id), updates, { merge: true });
  }

  deleteParticipantMaster(id: string): Promise<void> {
    return deleteDoc(doc(this.db, PARTICIPANT_MASTERS, id));
  }

  /** incrementセンチネルを使うので、複数端末から同時に呼ばれても取りこぼさない */
  incrementMasterUsage(id: string, lastUsed: string): Promise<void> {
    return setDoc(
      doc(this.db, PARTICIPANT_MASTERS, id),
      { usageCount: increment(1), lastUsed },
      { merge: true }
    );
  }

  /** writeBatchの上限を超えないよう分割してコミットする */
  async putParticipantMasters(masters: StoredDoc<MasterFields>[]): Promise<void> {
    for (let i = 0; i < masters.length; i += BATCH_CHUNK_SIZE) {
      const batch = writeBatch(this.db);
      masters.slice(i, i + BATCH_CHUNK_SIZE).forEach(({ id, fields }) => {
        batch.set(doc(this.db, PARTICIPANT_MASTERS, id), fields);
      });
      await batch.commit();
    }
  }

  dispose(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
  }

  /**
   * 購読解除関数を自前でも保持する。
   * StorageManager 側でも解除するが、dispose() が単独で呼ばれても
   * 購読が残らないようにしておく。
   */
  private register(unsubscribe: Unsubscribe): Unsubscribe {
    this.unsubscribers.push(unsubscribe);
    return () => {
      this.unsubscribers = this.unsubscribers.filter((u) => u !== unsubscribe);
      unsubscribe();
    };
  }
}
