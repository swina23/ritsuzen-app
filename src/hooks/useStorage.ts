/**
 * StorageManagerのキャッシュをReactから購読するためのフック群
 *
 * useSyncExternalStore を使うことで、Firestoreのスナップショットが届いた瞬間に
 * 購読しているコンポーネントだけが再レンダーされる。
 * StorageManager側のゲッターは同じスナップショットに対して同じ参照を返すため、
 * 無限再レンダーにはならない。
 */

import { useSyncExternalStore } from 'react';
import { storageManager } from '../utils/StorageManager';
import { Competition, ParticipantMaster } from '../types';
import type { StorageInfo } from '../utils/StorageManager';
import type { StorageKind } from '../lib/storage/StorageBackend';

/**
 * 現在の保存先の種別。無料/有料の出し分けはこれで判断する。
 *
 * storageManager.getKind() を直接呼んでも、他のフックの通知に便乗して
 * たまたま再レンダーされることが多い。しかしそれは暗黙の前提なので、
 * 種別だけを見るコンポーネントのためにフックとして公開しておく。
 */
export const useStorageKind = (): StorageKind | null =>
  useSyncExternalStore(storageManager.subscribe, storageManager.getKind);

export const useCompetitionHistory = (): Competition[] =>
  useSyncExternalStore(storageManager.subscribe, storageManager.getCompetitionHistory);

export const useAllCompetitions = (): Competition[] =>
  useSyncExternalStore(storageManager.subscribe, storageManager.getAllCompetitions);

/** 有効な参加者マスターのみ */
export const useParticipantMasters = (): ParticipantMaster[] =>
  useSyncExternalStore(storageManager.subscribe, storageManager.getParticipantMasters);

/** 無効化済みを含むすべての参加者マスター */
export const useAllParticipantMasters = (): ParticipantMaster[] =>
  useSyncExternalStore(storageManager.subscribe, storageManager.getAllParticipantMasters);

export const useStorageInfo = (): StorageInfo =>
  useSyncExternalStore(storageManager.subscribe, storageManager.getStorageInfo);

/** 未同期の書き込みが残っているか (前セッションからの持ち越しも含む) */
export const useHasPendingWrites = (): boolean =>
  useSyncExternalStore(storageManager.subscribe, storageManager.hasPendingWrites);
