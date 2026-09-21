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
import { participantNameKey } from './participantName';

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
  /**
   * 直近期間の成績。キーは RECENT_PERIODS の key。
   * その期間に一度も引いていない人は、そのキー自体が入らない
   */
  recent: Record<string, RecentStat | undefined>;
}

/** 直近期間の成績。順位は付けず、参考情報として通算の隣に並べる */
export interface RecentStat {
  /** その期間の的中率（総的中 ÷ 総射数） */
  hitRate: number;
  /** その期間に矢を引いた大会の数。的中率の母数が分かるよう画面にも併記する */
  competitionsCount: number;
}

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
    const key = participantNameKey(name);
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
  const resolved = masterId ?? masterIdByName.get(participantNameKey(name));
  return resolved
    ? { key: `master:${resolved}`, masterId: resolved }
    : { key: `name:${participantNameKey(name)}` };
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
 * 「どちらが後の出場か」を比べるためのキー。
 * 同じ日に複数の大会がある場合は更新日時で決める。
 * 引数の配列の並び順に結果が左右されないよう、明示的に比較する。
 */
const buildSortKey = (competition: Competition): string =>
  `${competition.date}|${competition.updatedAt || competition.createdAt || ''}`;

/**
 * 渡された大会だけを走査して、参加者ごとの成績を積み上げる。
 *
 * 通算にも直近期間にも同じ処理を使う。直近期間の呼び出しでは順位は使わないが、
 * 名寄せキーを揃えるために同じ経路を通す必要がある。
 *
 * @param competitions 集計対象の大会（期間で絞った結果が渡ることがある）
 * @param masters 参加者マスター。氏名・段位の最新値を引くために使う
 * @param identitySource 名寄せの逆引き表を作る母集団。既定は集計対象そのもの
 *
 * `identitySource` を `competitions` と分けているのは、氏名→masterIdの逆引き表が
 * 「masterId付きで記録された過去の参加者」を橋渡しに使っているため。集計対象を
 * 期間や件数で絞ると、その橋渡しの記録が対象外に落ちて名寄せが切れ、同じ人が
 * 2行に割れる（例: マスターの氏名を訂正した後、訂正前の氏名でmasterId無しに
 * 手入力された記録が、期間内に橋渡しが無いと別人になる）。逆引き表だけは常に
 * 全大会から作れるよう、呼び出し側から未フィルタの配列を渡せるようにしてある。
 */
const accumulateStats = (
  competitions: Competition[],
  masters: ParticipantMaster[],
  identitySource: Competition[]
): CareerStat[] => {
  const accumulators = new Map<string, Accumulator>();
  const masterIdByName = buildMasterIdByName(masters, identitySource);

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
      recent: {},
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

/**
 * 通算の隣に並べる直近期間。列を増やしたくなったらここに足す。
 *
 * 狙いは順位付けではなく、本人が自分の伸びに気づけること。通算的中率は
 * 長く積み上げるほど実力に近づく反面、最近の調子は埋もれてしまう。
 * 同じ行に通算と直近を並べれば「42% → 55%」と一目で読める。
 *
 * 期間を切り替える方式にしなかったのは、切り替えるたびに表が並び替わって
 * 自分の行を探し直すことになるうえ、その期間に出ていない人は行ごと
 * 消えてしまうため。列にすれば全員が残り、休んでいる人は「―」で分かる。
 *
 * 短い方を6ヶ月で止めているのは、立禅の会が月1回ペースだから。3ヶ月だと
 * 最大3大会にしかならず、数大会分の的中率は偶然の振れが大きくて
 * 成長と読み違えやすい。
 *
 * 「直近1年」は2026-09-21時点では見送り。当時の蓄積が21大会（約1年9ヶ月）で、
 * うち12大会が直近1年に入るため通算が実質「直近1年寄りの平均」になり、
 * 3列が独立した情報にならなかった。通算が3年分を超えた頃に再検討する。
 */
export const RECENT_PERIODS: { key: string; label: string; months: number }[] = [
  { key: 'm6', label: '直近6ヶ月', months: 6 },
];

/**
 * 日付文字列のNヶ月前を返す。
 *
 * 月末は丸める。3/31 の1ヶ月前は 2/31 になってしまうが、Date の自動繰り上げに
 * 任せると 3/3 とはみ出して「直近Nヶ月」がNヶ月に満たなくなるため、
 * その月の末日で止める（3/31 の1ヶ月前 → 2/28）。
 *
 * 大会日は YYYY-MM-DD の文字列で持っているので、タイムゾーンの影響を受けない
 * UTC 成分だけで計算し、結果も文字列に戻す。
 */
export const subtractMonths = (date: string, months: number): string => {
  const [year, month, day] = date.split('-').map(Number);
  // 月は 0 始まりで扱う。負になってもコンストラクタ側が年に繰り下げてくれる
  const target = new Date(Date.UTC(year, month - 1 - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));

  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(target.getUTCDate())}`;
};

/**
 * 直近Nヶ月に入る大会だけを残す。基準日のNヶ月前の同日を含む
 * （9/21 基準の6ヶ月なら 3/21 以降）。
 * 大会日が未設定のものは期間を判定できないので除く。
 */
export const filterCompetitionsByMonths = (
  competitions: Competition[],
  months: number,
  today: string
): Competition[] => {
  const start = subtractMonths(today, months);
  return competitions.filter((competition) => Boolean(competition.date) && competition.date >= start);
};

/**
 * 参加者ごとの通算成績を集計し、各行に直近期間の成績を添える。
 *
 * 順位は通算的中率だけで決める。直近期間は参考情報なので、
 * 出場数が少なくても伏せない（画面側で出場回数を併記して母数を見せる）。
 *
 * @param competitions 集計対象の大会
 * @param masters 参加者マスター。氏名・段位の最新値を引くために使う
 * @param today 直近期間の基準日（YYYY-MM-DD）。JSTの今日を渡す
 * @param identitySource 名寄せの逆引き表を作る母集団。既定は集計対象そのもの
 */
export const calculateCareerStats = (
  competitions: Competition[],
  masters: ParticipantMaster[],
  today: string,
  identitySource: Competition[] = competitions
): CareerStat[] => {
  const stats = accumulateStats(competitions, masters, identitySource);

  RECENT_PERIODS.forEach((period) => {
    // 逆引き表の母集団は通算と同じものを渡す。期間で絞った配列から作ると
    // 名寄せの橋渡しが落ちてキーが変わり、通算の行と突き合わせられなくなる
    const inPeriod = accumulateStats(
      filterCompetitionsByMonths(competitions, period.months, today),
      masters,
      identitySource
    );
    const byKey = new Map(inPeriod.map((stat) => [stat.key, stat]));
    stats.forEach((stat) => {
      const found = byKey.get(stat.key);
      if (!found) return;
      stat.recent[period.key] = {
        hitRate: found.hitRate,
        competitionsCount: found.competitionsCount,
      };
    });
  });

  return stats;
};

/** 的中率を「85.0%」の形式にする */
export const formatHitRate = (hitRate: number): string => `${(hitRate * 100).toFixed(1)}%`;

/**
 * 直近期間のセルの表示。「75.0% (6回)」のように出場回数を併記する。
 *
 * 回数を出すのは、1大会だけ出た人の75%と6大会出た人の75%が同じ顔で
 * 並ぶと誤読されるため。出場数が少ない行を隠す案もあったが、
 * 「最近来ていない」と気づくきっかけまで消えるのでこの形にしている。
 */
export const formatRecentStat = (recent: RecentStat | undefined): string =>
  recent ? `${formatHitRate(recent.hitRate)} (${recent.competitionsCount}回)` : '―';
