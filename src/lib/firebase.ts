import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

// これらの値は秘密情報ではなく、ビルド後のJSに埋め込まれて公開される。
// アクセス制御は Firestore Security Rules で行う。
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// 環境変数の設定漏れは起動時に気付けるようにする。
// (未設定のままだと認証が不可解な失敗をするため)
//
// ただしここで throw してはいけない。クラウド保存はログインした人だけの機能で、
// 未ログインならこの端末に保存する形で全機能が使える。読み込み時に throw すると
// Firebase 未設定の環境でアプリ自体が起動しなくなり、無料で使える前提が崩れる。
const missingKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

/** クラウド保存が使える環境か。false ならログイン機能ごと無効になる */
export const isFirebaseConfigured = missingKeys.length === 0;

if (!isFirebaseConfigured) {
  console.warn(
    `[firebase] 環境変数が設定されていないため、クラウド保存は無効です: ${missingKeys.join(', ')}\n` +
    '.env.local (ローカル) または Vercelの環境変数を確認してください。'
  );
}

export const firebaseApp = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;

/** 未設定の環境では null。利用側で null チェックすること */
export const auth = firebaseApp ? getAuth(firebaseApp) : null;

export const googleProvider = new GoogleAuthProvider();
// 共用端末で前回のアカウントに自動ログインせず、毎回選ばせる
googleProvider.setCustomParameters({ prompt: 'select_account' });

// IndexedDBへの永続キャッシュを有効化する。これにより
//  - 圏外でも読み取りはキャッシュから即座に返る
//  - 圏外中の書き込みはローカルに反映され、復帰時に自動送信される
//  - 同一端末で複数タブを開いても矛盾しない (persistentMultipleTabManager)
// ignoreUndefinedProperties は Participant.group のような任意フィールドが
// undefined のまま渡ってきても書き込みが落ちないようにするためのもの。
const db = firebaseApp
  ? initializeFirestore(firebaseApp, {
      ignoreUndefinedProperties: true,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  : null;

/**
 * Firestore への参照を得る。未設定の環境では throw する。
 *
 * 呼ぶのは FirestoreBackend だけで、それは動的 import された上に
 * ログイン成立時しか生成されない。つまりここが throw するのは
 * 環境変数が壊れているときだけで、CompetitionContext が受け止めて
 * 端末保存にフォールバックする。
 */
export const requireDb = () => {
  if (!db) {
    throw new Error('Firebaseの環境変数が設定されていないため、クラウド保存は利用できません');
  }
  return db;
};
