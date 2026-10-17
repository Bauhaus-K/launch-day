/**
 * 관제 음성: 브라우저 내장 음성 합성(Web Speech API). 게임 언어의 음성이 없으면 조용히 생략한다.
 */
import { VOICE } from '../data/audio-config';
import { getLocale, LOCALES } from '../i18n';

export class VoiceAnnouncer {
  private voice: SpeechSynthesisVoice | null = null;
  private muted = false;
  private readonly synth: SpeechSynthesis | null;

  constructor() {
    this.synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    if (!this.synth) return;
    this.pickVoice();
    // 음성 목록은 비동기로 채워진다
    this.synth.addEventListener('voiceschanged', () => this.pickVoice());
  }

  private pickVoice(): void {
    const voices = this.synth?.getVoices() ?? [];
    // 게임 언어와 같은 언어의 음성만 쓴다 (다른 언어 음성으로 읽으면 알아듣기 어렵다)
    const lang = LOCALES.find((l) => l.id === getLocale())?.speechLang ?? getLocale();
    this.voice = voices.find((v) => v.lang.toLowerCase().startsWith(lang)) ?? null;
  }

  get available(): boolean {
    return this.voice !== null;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.synth?.cancel();
  }

  setPaused(paused: boolean): void {
    if (!this.synth) return;
    if (paused) this.synth.pause();
    else this.synth.resume();
  }

  /** interrupt가 true면 읽던 말을 끊고 바로 읽는다 (카운트다운 숫자 등) */
  say(text: string, interrupt = false): void {
    if (!this.synth || !this.voice || this.muted) return;
    if (interrupt) this.synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = this.voice;
    u.lang = this.voice.lang;
    u.rate = VOICE.rate;
    u.volume = VOICE.volume;
    this.synth.speak(u);
  }

  cancel(): void {
    this.synth?.cancel();
  }
}
