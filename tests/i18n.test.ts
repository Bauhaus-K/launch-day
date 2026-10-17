import { describe, expect, it } from 'vitest';
import { dictionaryOf, interpolate, LOCALES, t } from '../src/i18n';
import { ko } from '../src/i18n/locales/ko';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('다국어 사전', () => {
  it('모든 언어가 같은 키와 같은 자리표시자를 가진다', () => {
    for (const { id } of LOCALES) {
      const dict = dictionaryOf(id);
      expect(Object.keys(dict).sort()).toEqual(Object.keys(ko).sort());
      for (const key of Object.keys(ko) as (keyof typeof ko)[]) {
        expect(placeholders(dict[key]), `${id}:${key}`).toEqual(placeholders(ko[key]));
      }
    }
  });

  it('빈 번역이 없다 (원래 빈 해설 제외)', () => {
    for (const { id } of LOCALES) {
      const dict = dictionaryOf(id);
      for (const key of Object.keys(ko) as (keyof typeof ko)[]) {
        if (ko[key] !== '') expect(dict[key].trim(), `${id}:${key}`).not.toBe('');
      }
    }
  });

  it('자리표시자를 채운다', () => {
    expect(interpolate('{a}와 {b}, {c}', { a: 1, b: 'x' })).toBe('1와 x, {c}');
    expect(t('msg.maxQPassed', { kpa: '20.9' })).toContain('20.9');
  });
});

/** 사용자에게 보이는 한글 문구가 사전 밖(코드)에 남아 있지 않은지 확인 */
describe('하드코딩 문구 감시', () => {
  // Vite가 소스 원문을 모아 준다 (node 타입 의존 없이)
  const sources = import.meta.glob('../src/**/*.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;
  const HANGUL_LITERAL = /(['"`])[^'"`]*[가-힣][^'"`]*\1/;

  it('i18n 폴더 밖의 문자열 리터럴에 한글이 없다 (주석·개발자용 오류 메시지 제외)', () => {
    const offenders: string[] = [];
    for (const [file, source] of Object.entries(sources)) {
      if (file.includes('/i18n/')) continue;
      source.split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '').trim();
        if (code.startsWith('*') || code.startsWith('/*') || code.includes('new Error(')) return;
        if (HANGUL_LITERAL.test(code)) offenders.push(`${file}:${i + 1}: ${code}`);
      });
    }
    expect(Object.keys(sources).length).toBeGreaterThan(30);
    expect(offenders).toEqual([]);
  });
});
