/**
 * 参加者の通算成績（全大会を横断した的中率）の集計
 *
 * 通算的中率は「各大会の的中率の平均」ではなく
 * 「全大会の的中合計 ÷ 全大会の射数合計」で出す。
 * 大会ごとに射数が違うため、単純平均だと射数の少ない大会の
 * 出来不出来が過大に効いてしまうため。
 */

import { Competition, ParticipantMaster } from '../types';

export interface CareerStat {
  /** 名寄せキー。masterIdがあればそれ、無ければ氏名 */
  key: string;
  name: string;
  rank: number;
  /** 実際に矢を引いた大会の数 */
  competitionsCount: number;
  /** 実際に引いた射数の合計（未入力の矢は数えない） */
  totalShots: number;
  totalHits: number;
  /** totalHits / totalShots。射数0なら0 */
  hitRate: number;
  /** 通算的中率の順位（同率は同順位） */
  order: number;
}

/** masterIdが無い参加者は氏名で名寄せする（旧データや「マスターに保存」しなかった手入力分） */
const buildKey = (masterId: string | undefined, name: string): string =>
  masterId ? `master:${masterId}` : `name:${name}`;

/**
 * 「氏名 → masterId」の対応表を作る。
 *
 * 同じ人でも、masterId紐付けを導入する前に記録した大会や旧アプリから移行した
 * データにはmasterIdが無い。キーがmaster:xxxとname:xxxに割れると同じ人が
 * 2行に分かれてしまうため、氏名が一致するならmasterId側へ寄せる。
 *
 * ただし同じ氏名に複数のmasterIdがぶら下がる場合（同姓同名がマスターに2件ある等）は
 * 寄せ先を決められないので対応表から除外し、氏名キーのまま別行として残す。
 * 別人を勝手に統合してしまう方が害が大きいため、安全側に倒す。
 */
const buildMasterIdByName = (
  competitions: Competition[],
  masters: ParticipantMaster[]
): Map<string, string> => {
  const candidates = new Map<string, Set<string>>();

  const register = (name: string, masterId: string): void => {
    const ids = candidates.get(name) ?? new Set<string>();
    ids.add(masterId);
    candidates.set(name, ids);
  };

  // マスター一覧と、実際の大会参加者の両方から拾う。
  // マスター管理画面で登録しただけでまだ出場していない人も対象にするため
  masters.forEach((master) => register(master.name, master.id));
  competitions.forEach((competition) => {
    competition.participants.forEach((participant) => {
      if (participant.masterId) register(participant.name, participant.masterId);
    });
  });

  const resolved = new Map<string, string>();
  candidates.forEach((ids, name) => {
    if (ids.size === 1) resolved.set(name, ids.values().next().value!);
  });
  return resolved;
};

interface Accumulator {
  key: string;
  masterId?: string;
  /** 最後に出場した大会での氏名・段位。マスターが引けないときの表示に使う */
  latestName: string;
  latestRank: number;
  /** 「どれが最後の出場か」の比較用キー。同日開催が複数あるときの決着に使う */
  latestSortKey: string;
  competitionIds: Set<string>;
  totalShots: number;
  totalHits: number;
}

/**
 * 全大会から参加者ごとの通算成績を集計する。
 *
 * @param competitions 保存済みの全大会（開催中のものを含む）
 * @param masters 参加者マスター。氏名・段位の最新値を引くために使う
 */
/**
 * 「どちらが後の出場か」を比べるためのキー。
 * 同じ日に複数の大会がある場合は更新日時で決める。
 * 引数の配列の並び順に結果が左右されないよう、明示的に比較する。
 */
const buildSortKey = (competition: Competition): string =>
  `${competition.date}|${competition.updatedAt || competition.createdAt || ''}`;

export const calculateCareerStats = (
  competitions: Competition[],
  masters: ParticipantMaster[]
): CareerStat[] => {
  const accumulators = new Map<string, Accumulator>();
  const masterIdByName = buildMasterIdByName(competitions, masters);

  competitions.forEach((competition) => {
    const sortKey = buildSortKey(competition);

    competition.participants.forEach((participant) => {
      const record = competition.records.find((r) => r.participantId === participant.id);
      if (!record) return;

      // 保存済みのtotalHits/hitRateは古い計算式のまま残っている可能性があるため、
      // 矢の記録そのものから数え直す
      let shots = 0;
      let hits = 0;
      record.rounds.forEach((round) => {
        round.shots.forEach((shot) => {
          if (shot.hit === null) return;
          shots += 1;
          if (shot.hit) hits += 1;
        });
      });

      // 登録だけして一射もしていない人は出場としてカウントしない
      if (shots === 0) return;

      // masterIdが無い記録も、同じ氏名のmasterIdが一意に決まるならそちらへ寄せる
      const masterId = participant.masterId ?? masterIdByName.get(participant.name);
      const key = buildKey(masterId, participant.name);
      const existing = accumulators.get(key);

      if (!existing) {
        accumulators.set(key, {
          key,
          masterId,
          latestName: participant.name,
          latestRank: participant.rank,
          latestSortKey: sortKey,
          competitionIds: new Set([competition.id]),
          totalShots: shots,
          totalHits: hits,
        });
        return;
      }

      // 同じ人が同一大会に二重登録されていても出場数は1と数える
      existing.competitionIds.add(competition.id);
      existing.totalShots += shots;
      existing.totalHits += hits;

      if (sortKey > existing.latestSortKey) {
        existing.latestSortKey = sortKey;
        existing.latestName = participant.name;
        existing.latestRank = participant.rank;
      }
    });
  });

  const masterById = new Map(masters.map((master) => [master.id, master]));

  const stats = Array.from(accumulators.values()).map((acc) => {
    // マスターが残っていればそちらが最新の氏名・段位。
    // 削除されている場合もあるので、必ず大会側の値にフォールバックする
    const master = acc.masterId ? masterById.get(acc.masterId) : undefined;
    return {
      key: acc.key,
      name: master?.name ?? acc.latestName,
      rank: master?.rank ?? acc.latestRank,
      competitionsCount: acc.competitionIds.size,
      totalShots: acc.totalShots,
      totalHits: acc.totalHits,
      hitRate: acc.totalShots > 0 ? acc.totalHits / acc.totalShots : 0,
      order: 0,
    };
  });

  // 的中率が同じなら射数の多い方を上に（母数が多い方が信頼できるため）
  stats.sort((a, b) => {
    if (b.hitRate !== a.hitRate) return b.hitRate - a.hitRate;
    if (b.totalShots !== a.totalShots) return b.totalShots - a.totalShots;
    return a.name.localeCompare(b.name, 'ja');
  });

  // 同率は同順位にする（例: 1位・1位・3位）
  stats.forEach((stat, index) => {
    const previous = stats[index - 1];
    stat.order = previous && previous.hitRate === stat.hitRate ? previous.order : index + 1;
  });

  return stats;
};

/** 的中率を「85.0%」の形式にする */
export const formatHitRate = (hitRate: number): string => `${(hitRate * 100).toFixed(1)}%`;
