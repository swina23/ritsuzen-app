/**
 * アプリの利用を許可するGoogleアカウントの一覧。
 *
 * ここでの判定は画面表示を切り替えるためのものであり、セキュリティの本体ではない。
 * データへのアクセス制御は Firestore Security Rules (firestore.rules) が行う。
 * メンバーを増減するときは、このファイルと firestore.rules の両方を更新すること。
 */
export const AUTHORIZED_EMAILS = [
  'tomo.the.slyb@gmail.com',
  'info.rituzen@gmail.com',
] as const;

export const isAuthorizedEmail = (email: string | null | undefined): boolean =>
  !!email && AUTHORIZED_EMAILS.includes(email.toLowerCase() as typeof AUTHORIZED_EMAILS[number]);
