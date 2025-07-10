/**
 * Shot状態表示・スタイリング用のユーティリティ関数
 */

/**
 * Shot状態を表示文字列に変換
 * @param hit - Shot状態 (true: 的中, false: 外れ, null/undefined: 未実施)
 * @returns 表示文字列 ('○', '×', '-')
 */
export const getShotDisplay = (hit: boolean | null | undefined): string => {
  if (hit === null || hit === undefined) return '-';
  return hit ? '○' : '×';
};

/**
 * Shot状態をCSSクラス名に変換
 * @param hit - Shot状態 (true: 的中, false: 外れ, null/undefined: 未実施)
 * @returns CSSクラス名 ('hit', 'miss', 'unshot')
 */
export const getShotClass = (hit: boolean | null | undefined): string => {
  if (hit === null || hit === undefined) return 'unshot';
  return hit ? 'hit' : 'miss';
};