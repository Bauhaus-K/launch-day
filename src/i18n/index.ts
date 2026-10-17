/**
 * 다국어(i18n). 순수 데이터 + 현재 언어 상태만 다루며 DOM·Three.js에 의존하지 않는다.
 * 언어 변경은 메뉴에서만 하고, 바꾸면 페이지를 다시 그린다 (진행 중인 미션 문구가 섞이지 않게).
 */
import { en } from './locales/en';
import { ja } from './locales/ja';
import { ko, type MessageKey } from './locales/ko';

export type { MessageKey } from './locales/ko';

export type Locale = 'ko' | 'en' | 'ja';

export const LOCALES: readonly {
  readonly id: Locale;
  readonly nativeName: string;
  readonly speechLang: string;
}[] = [
  { id: 'ko', nativeName: '한국어', speechLang: 'ko' },
  { id: 'en', nativeName: 'English', speechLang: 'en' },
  { id: 'ja', nativeName: '日本語', speechLang: 'ja' },
];

/** 모든 언어 사전은 한국어 사전과 같은 키를 가져야 한다 (컴파일 시 확인) */
export type Dictionary = Record<MessageKey, string>;

const DICTIONARIES: Record<Locale, Dictionary> = { ko, en, ja };

export const LOCALE_STORAGE_KEY = 'launch-day:locale';

const isLocale = (v: unknown): v is Locale => v === 'ko' || v === 'en' || v === 'ja';

/** 저장된 설정 → 브라우저 언어 → 한국어 순으로 결정 */
function detectLocale(): Locale {
  try {
    const saved = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // 저장소 접근 불가 — 브라우저 언어로
  }
  const lang = globalThis.navigator?.language?.slice(0, 2).toLowerCase();
  return isLocale(lang) ? lang : 'ko';
}

let current: Locale = detectLocale();

export const getLocale = (): Locale => current;

/** 언어 변경 (저장 포함) */
export function setLocale(locale: Locale): void {
  current = locale;
  try {
    globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // 이번 세션에만 적용
  }
}

export type MessageParams = Readonly<Record<string, string | number>>;

/** {name} 자리표시자 채우기 */
export function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function t(key: MessageKey, params?: MessageParams): string {
  return interpolate(DICTIONARIES[current][key] ?? ko[key], params);
}

/** 테스트용: 특정 언어 사전 */
export const dictionaryOf = (locale: Locale): Dictionary => DICTIONARIES[locale];
