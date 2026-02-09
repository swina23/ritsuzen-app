import { Participant, ParticipantRecord } from '../types';
import { groupParticipants } from './grouping';

/**
 * 特定の立でのグループ内の射順を取得（ローテーション考慮）
 */
function getShootingOrderForGroup(
  groupParticipants: Participant[],
  roundNumber: number,
  enableRotation: boolean = true
): Participant[] {
  // ローテーション無効時は元の順序を返す
  if (!enableRotation) {
    return [...groupParticipants];
  }

  const startIndex = (roundNumber - 1) % groupParticipants.length;
  const order: Participant[] = [];

  for (let i = 0; i < groupParticipants.length; i++) {
    order.push(groupParticipants[(startIndex + i) % groupParticipants.length]);
  }

  return order;
}

/**
 * 特定の立での全体の射順を取得（全グループ結合）
 */
export function getShootingOrderForRound(
  participants: Participant[],
  roundNumber: number,
  enableRotation: boolean = true
): Participant[] {
  const groups = groupParticipants(participants);
  let fullOrder: Participant[] = [];

  groups.forEach(groupParticipants => {
    fullOrder = fullOrder.concat(
      getShootingOrderForGroup(groupParticipants, roundNumber, enableRotation)
    );
  });

  return fullOrder;
}

/**
 * 次に入力すべき射手と射を特定
 */
export function findNextShot(
  participants: Participant[],
  records: ParticipantRecord[],
  roundNumber: number,
  enableRotation: boolean = true
): {
  participantId: string;
  shotIndex: number;
  group?: number;
} | null {
  const shootingOrder = getShootingOrderForRound(participants, roundNumber, enableRotation);
  const groups = groupParticipants(participants);

  // 各グループごとに処理
  for (const groupParticipants of groups) {
    // このグループの射順を取得
    const groupShootingOrder = getShootingOrderForGroup(groupParticipants, roundNumber, enableRotation);

    // 各射（1射目、2射目、3射目、4射目）ごとに処理
    for (let shotIndex = 0; shotIndex < 4; shotIndex++) {
      // その射について、グループ内の全員を射順通りにチェック
      for (const participant of groupShootingOrder) {
        const record = records.find(r => r.participantId === participant.id);
        if (!record) continue;

        const round = record.rounds.find(r => r.roundNumber === roundNumber);
        if (!round) continue;

        // この射が未入力なら、それが次の射
        if (round.shots[shotIndex].hit === null) {
          return {
            participantId: participant.id,
            shotIndex,
            group: participant.group
          };
        }
      }
    }
  }

  return null; // 全員入力済み
}

/**
 * グループごとの射順情報を取得
 */
export function getGroupShootingOrders(
  participants: Participant[],
  roundNumber: number,
  enableRotation: boolean = true
): Array<{ groupNumber: number; order: Participant[] }> {
  const groups = groupParticipants(participants);

  return groups.map((groupParticipants, index) => ({
    groupNumber: groupParticipants[0]?.group || index + 1,
    order: getShootingOrderForGroup(groupParticipants, roundNumber, enableRotation)
  }));
}
