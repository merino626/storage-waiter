import { useStore } from '../store';
import { pt, type Dict, type Lang } from './pt';
import { en } from './en';

export type { Dict, Lang };
export { pt, en };

const DICTS: Record<Lang, Dict> = { pt, en };

const STORAGE_KEY = 'storagewaiter.lang';

export function loadStoredLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'en' ? 'en' : 'pt';
  } catch {
    return 'pt';
  }
}

export function persistLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // best-effort only — a private/locked-down profile just won't remember the choice
  }
}

/** Reactive dictionary for the current language, re-rendering on change. */
export function useT(): Dict {
  const lang = useStore((s) => s.lang);
  return DICTS[lang];
}

export function useLang(): Lang {
  return useStore((s) => s.lang);
}
