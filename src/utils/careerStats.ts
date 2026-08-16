/**
 * 参加者の通算成績（全大会を横断した的中率）の集計
 *
 * 通算的中率は「各大会の的中率の平均」ではなく
 * 「全大会の的中合計 ÷ 全大会の射数合計」で出す。
 * 大会ごとに射数が違うため、単純平均だと射数の少ない大会の
 * 出来不出来が過大に効いてしまうため。
 *
 * 出場数が少ない人は順位を付けない。1回だけ出た人の的中率は
 * まぐれにも不調にも大きく振れるため、常連と同じ土俵で並べると
 * ランキングそのものが意味を持たなくなる。集計と表示からは外さない。
 * 本人が自分の記録を見られなくなってしまうため。
 */

import { Competition, ParticipantMaster } from '../types';

/** 順位を付ける最低出場数。これ未満は order=0（順位外）になる */
export const RANKING_MIN_COMPETITIONS = 3;

export interface CareerStat {
  /** 名寄せキー。masterIdがあればそれ、無ければ氏名から引いたmasterId、それも無ければ氏名 */
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
  /** 通算的中率の順位（同率は同順位）。順位外は0 */
  order: number;
  /** 順位を付ける対象か。falseなら出場数が足りず順位外 */
  ranked: boolean;
}

/**
 * 氏名の表記ゆれを吸収する。揃えるのは空白の有無と括弧の全角/半角だけ。
 * 「今村 (梨)」と「今村（梨）」は同じ人だが、「石川(桜)」と「石川」は別人なので、
 * これ以上は踏み込まない。
 */
// \s は全角スペース(U+3000)も含むので、半角・全角どちらの空白も落ちる
const normalizeName = (name: string): string =>
  name.replace(/\s/g, '').replace(/（/g, '(').replace(/）/g, ')');

/**
 * 氏名からmasterIdを引く表。同じ氏名のマスターが複数あるときは載せない
 * （どちらの人か決められないため、氏名キーのまま集計する）。
 *
 * マスターは無効化済みのものも渡ってくる。過去に出場した人を無効化しても
 * 通算成績には残るため、無効化を理由に除くと逆に名寄せが切れる。
 *
 * マスターの氏名だけでなく、masterIdが付いている過去の参加者の氏名も拾う。
 * マスターの氏名は後から訂正できる（表記ゆれの統一など）ので、訂正前の氏名で
 * 記録された参加者は現在のマスター名と一致しない。当時の氏名を残している
 * 参加者側からも引けるようにして、その分を取りこぼさないようにする。
 */
const buildMasterIdByName = (
  masters: ParticipantMaster[],
  competitions: Competition[]
): Map<string, string> => {
  const idsByName = new Map<string, Set<string>>();
  const register = (name: string, id: string): void => {
    const key = normalizeName(name);
    const ids = idsByName.get(key);
    if (ids) {
      ids.add(id);
    } else {
      idsByName.set(key, new Set([id]));
    }
  };

  masters.forEach((master) => register(master.name, master.id));
  competitions.forEach((competition) => {
    competition.participants.forEach((participant) => {
      if (participant.masterId) register(participant.name, participant.masterId);
    });
  });

  const resolved = new Map<string, string>();
  idsByName.forEach((ids, name) => {
    if (ids.size === 1) resolved.set(name, Array.from(ids)[0]);
  });
  return resolved;
};

/**
 * 名寄せキー。masterIdがあればそれ、無ければ氏名からマスターを引き、
 * それも無ければ氏名そのもの。
 *
 * masterIdが無いのは「マスターに保存」せず手入力した参加者と、旧アプリから
 * 移行したときにマスターと紐付かなかった大会の参加者。後者はその人が後から
 * マスターに登録されると、過去分（氏名キー）と以降の分（masterIdキー）が
 * 別人として2行に割れてしまう。2026-08-16の稽古で実際にこれが起きた
 * （田中(紀)・岡田・成田）。
 *
 * 氏名からの逆引きは一度削除した処理で、同姓同名の別人を統合してしまう危険が
 * あるのは変わらない。それでも戻したのは、①アプリは同名のマスターを2件作らせない
 * ので、氏名が一致する相手は「その人自身」である公算が高い、②同姓同名の別人が
 * 混ざる害より、同じ人の記録が黙って2行に割れる害の方が現に起きていて大きい、
 * という判断による。念のため、同名マスターが複数あるときは寄せない。
 */
const resolveIdentity = (
  masterId: string | undefined,
  name: string,
  masterIdByName: Map<string, string>
): { key: string; masterId?: string } => {
  const resolved = masterId ?? masterIdByName.get(normalizeName(name));
  return resolved
    ? { key: `master:${resolved}`, masterId: resolved }
    : { key: `name:${normalizeName(name)}` };
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
  const masterIdByName = buildMasterIdByName(masters, competitions);

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

      // 氏名から引けたmasterIdもここで確定する。マスター側の氏名・段位を最新として
      // 表示するのは、参加者にmasterIdが焼き付いている場合と同じでよい
      const { key, masterId } = resolveIdentity(
        participant.masterId,
        participant.name,
        masterIdByName
      );
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
      ranked: acc.competitionIds.size >= RANKING_MIN_COMPETITIONS,
    };
  });

  // 的中率が同じなら射数の多い方を上に（母数が多い方が信頼できるため）
  const byHitRate = (a: CareerStat, b: CareerStat): number => {
    if (b.hitRate !== a.hitRate) return b.hitRate - a.hitRate;
    if (b.totalShots !== a.totalShots) return b.totalShots - a.totalShots;
    return a.name.localeCompare(b.name, 'ja');
  };
  // 順位外は的中率に関係なく末尾へまとめる
  stats.sort((a, b) => (a.ranked !== b.ranked ? (a.ranked ? -1 : 1) : byHitRate(a, b)));

  // 同率は同順位にする（例: 1位・1位・3位）
  const ranked = stats.filter((stat) => stat.ranked);
  ranked.forEach((stat, index) => {
    const previous = ranked[index - 1];
    stat.order = previous && previous.hitRate === stat.hitRate ? previous.order : index + 1;
  });

  return stats;
};

/** 的中率を「85.0%」の形式にする */
export const formatHitRate = (hitRate: number): string => `${(hitRate * 100).toFixed(1)}%`;
