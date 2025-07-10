/**
 * 一意IDの生成ユーティリティ
 */

import { ID_PREFIXES } from './constants';

/**
 * 一意のIDを生成する
 * @param prefix - ID接頭辞
 * @returns 一意ID
 */
export const generateUniqueId = (prefix: keyof typeof ID_PREFIXES = 'PARTICIPANT'): string => {
  const timestamp = Date.now();
  const random1 = Math.random().toString(36).substr(2, 9);
  const random2 = Math.random().toString(36).substr(2, 9);
  const counter = Math.floor(Math.random() * 1000000);
  
  return `${ID_PREFIXES[prefix]}-${timestamp}-${random1}-${random2}-${counter}`;
};

/**
 * 大会用のIDを生成する
 * @returns 大会ID
 */
export const generateCompetitionId = (): string => {
  return generateUniqueId('COMPETITION');
};

/**
 * 参加者用のIDを生成する
 * @returns 参加者ID
 */
export const generateParticipantId = (): string => {
  return generateUniqueId('PARTICIPANT');
};

/**
 * マスター用のIDを生成する
 * @returns マスターID
 */
export const generateMasterId = (): string => {
  return generateUniqueId('MASTER');
};