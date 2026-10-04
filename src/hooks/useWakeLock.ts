import { useEffect } from 'react';

/**
 * active の間、画面が暗くならないようにする（Screen Wake Lock API）。
 *
 * 計測中に iPad の画面が消えると、残り時間を見落としてしまう。
 * タブを切り替えたり画面を消したりするとブラウザが自動で解除するので、
 * 画面に戻ってきたときに取り直す。未対応のブラウザでは何もしない。
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    // 取得待ちの間に画面へ戻るイベントが来ても、二重に取らない（先に取ったロックが手放されず残るため）
    let pending = false;

    const request = async () => {
      if (pending) return;
      pending = true;
      try {
        const acquired = await navigator.wakeLock.request('screen');
        // 取得を待つ間に計測が終わっていたら、すぐ手放す
        if (cancelled) {
          acquired.release().catch(() => {});
          return;
        }
        sentinel = acquired;
      } catch (error) {
        // 省電力モードなどで断られることがある。計時自体は続けられるので握りつぶす
        console.warn('[useWakeLock] 画面の消灯を止められませんでした:', error);
      } finally {
        pending = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && (sentinel === null || sentinel.released)) {
        request();
      }
    };

    request();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      sentinel?.release().catch(() => {});
    };
  }, [active]);
}
