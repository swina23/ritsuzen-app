/**
 * 旧版(main / v1.1系)のlocalStorageデータを新形式に取り込む
 *
 * 旧版はキー `ritsuzen-app-data` に
 *   { currentCompetition, competitions[], participantMasters[], lastUpdated }
 * という形で保存していた。**進行中の大会は competitions[] に含まれず別枠**にある。
 * 現行は「全大会を1つのマップに入れ、ポインタで現在の大会を指す」構造なので、
 * その付け替えが必要になる。
 *
 * 旧キーは取り込み後も**消さない**。変換にバグがあったときに切り戻せるようにする。
 * (欠損フィールドの補完は読み出し側の normalizeCompetition が行うため、ここではしない)
 */

import type { Competition, ParticipantMaster } from '../../types';
import type { LocalStoreV2 } from './LocalStorageBackend';

export const LEGACY_STORAGE_KEY = 'ritsuzen-app-data';

interface LegacyStorageData {
  currentCompetition?: Competition | null;
  competitions?: Competition[];
  participantMasters?: ParticipantMaster[];
}

/**
 * 旧形式のデータがあれば新形式に変換して返す。無ければ null。
 * 読み取りに失敗しても例外は投げない(取り込めないだけで、新規利用としては成立する)。
 */
export const readLegacyStore = (): LocalStoreV2 | null => {
  let parsed: LegacyStorageData;
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    parsed = JSON.parse(raw) as LegacyStorageData;
  } catch (error) {
    console.error('[legacyMigration] 旧データの読み込みに失敗しました:', error);
    return null;
  }

  const competitions: LocalStoreV2['competitions'] = {};
  const participantMasters: LocalStoreV2['participantMasters'] = {};

  const put = (competition: Competition | null | undefined): string | null => {
    if (!competition?.id) return null;
    const { id, ...fields } = competition;
    competitions[id] = fields;
    return id;
  };

  (Array.isArray(parsed.competitions) ? parsed.competitions : []).forEach(put);

  // 旧版の進行中の大会は competitions[] の外にあるので、ここで合流させて
  // ポインタで指す。これをしないと進行中の記録が丸ごと失われる。
  const currentCompetitionId = put(parsed.currentCompetition);

  (Array.isArray(parsed.participantMasters) ? parsed.participantMasters : []).forEach((master) => {
    if (!master?.id) return;
    const { id, ...fields } = master;
    participantMasters[id] = fields;
  });

  return {
    version: 2,
    competitions,
    participantMasters,
    appState: { competitionId: currentCompetitionId },
  };
};
