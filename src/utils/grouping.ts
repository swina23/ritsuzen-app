import { Participant } from '../types';

/**
 * 参加者を自動でグループ分けする
 */
export function applyAutoGrouping(
  participants: Participant[],
  groupSize: number
): Participant[] {
  return participants.map((p, index) => ({
    ...p,
    group: Math.floor(index / groupSize) + 1
  }));
}

/**
 * 参加者のグループを変更する
 */
export function moveParticipantToGroup(
  participants: Participant[],
  participantId: string,
  direction: 'up' | 'down'
): Participant[] {
  const targetParticipant = participants.find(p => p.id === participantId);
  if (!targetParticipant || !targetParticipant.group) {
    return participants;
  }

  const currentGroup = targetParticipant.group;
  const maxGroup = Math.max(...participants.map(p => p.group || 0));

  let newGroup = currentGroup;
  if (direction === 'up' && currentGroup > 1) {
    newGroup = currentGroup - 1;
  } else if (direction === 'down' && currentGroup < maxGroup) {
    newGroup = currentGroup + 1;
  }

  if (newGroup === currentGroup) {
    return participants; // 移動しない
  }

  return participants.map(p =>
    p.id === participantId ? { ...p, group: newGroup } : p
  );
}

/**
 * 全参加者のグループ設定をクリアする
 */
export function clearGrouping(participants: Participant[]): Participant[] {
  return participants.map(p => ({ ...p, group: undefined }));
}

/**
 * グループ情報を取得
 */
export function getGroupInfo(participants: Participant[]): {
  totalGroups: number;
  groupSizes: number[];
  hasGroups: boolean;
} {
  const hasGroups = participants.some(p => p.group !== undefined);

  if (!hasGroups) {
    return { totalGroups: 0, groupSizes: [], hasGroups: false };
  }

  const groups: { [key: number]: number } = {};
  participants.forEach(p => {
    if (p.group) {
      groups[p.group] = (groups[p.group] || 0) + 1;
    }
  });

  const groupNumbers = Object.keys(groups).map(Number).sort((a, b) => a - b);
  const groupSizes = groupNumbers.map(g => groups[g]);

  return {
    totalGroups: groupNumbers.length,
    groupSizes,
    hasGroups: true
  };
}

/**
 * グループごとに参加者を分類
 */
export function groupParticipants(participants: Participant[]): Participant[][] {
  const hasGroups = participants.some(p => p.group !== undefined);

  if (!hasGroups) {
    return [participants];
  }

  const groups: { [key: number]: Participant[] } = {};
  participants.forEach(p => {
    const groupNum = p.group || 1;
    if (!groups[groupNum]) {
      groups[groupNum] = [];
    }
    groups[groupNum].push(p);
  });

  return Object.keys(groups)
    .map(Number)
    .sort((a, b) => a - b)
    .map(g => groups[g]);
}
