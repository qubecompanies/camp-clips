import { useStore, selectPhotos } from '../state/store';
import { shuffle } from './utils';
import type { Photo, ShowLength, SectionCard } from '../state/types';

// Fade-out length (seconds) we play on the outgoing photo before a section card.
// Matches the outro's fade-out so the timing math stays honest.
const SECTION_FADE = 0.8;

export function getIncludedPhotos(): Photo[] {
  return selectPhotos(useStore.getState()).filter((p) => p.included);
}
export function getIncludedSongs() {
  return useStore.getState().songs.filter((s) => s.included);
}

export function totalIncludedSongSeconds(): number {
  return getIncludedSongs().reduce((sum, s) => sum + (s.duration || 0), 0);
}

// ===== SECTION CARDS =====
// Section cards only render in LINEAR playback: not shuffled and not looped.
// (Shuffling scrambles the anchor order; looping repeats photos, which would
// repeat or misplace a card.) These helpers return the cards that will actually
// show for a given run, so playback/export/time-math all agree.
export function sectionsForList(list: Photo[], looped: boolean): SectionCard[] {
  const { sections, settings } = useStore.getState();
  if (!sections.length || settings.shuffleOnPlay || looped) return [];
  const ids = new Set(list.map((p) => p.id));
  return sections.filter((c) => ids.has(c.beforePhotoId));
}

export function sectionMap(list: Photo[], looped: boolean): Map<string, SectionCard> {
  const m = new Map<string, SectionCard>();
  for (const c of sectionsForList(list, looped)) {
    if (!m.has(c.beforePhotoId)) m.set(c.beforePhotoId, c);
  }
  return m;
}

// Seconds the active section cards add to a run (card hold + its lead-in fade).
export function sectionTimeForList(list: Photo[], looped: boolean): number {
  const cards = sectionsForList(list, looped);
  return cards.reduce((sum, c) => sum + c.duration + SECTION_FADE, 0);
}

export interface Plan {
  count: number;
  hold: number;
  looped: boolean;
  mode: ShowLength;
  budget: number | null;
  fitted?: boolean;
}

// Determine how many photos to show and how long each is held, based on the
// stop condition. Deterministic (no randomness) so it can drive the stats
// readout. buildPlaybackList() does the actual shuffling/looping.
export function computePlan(): Plan {
  const { settings, intro, outro } = useStore.getState();
  const P = getIncludedPhotos().length;
  const trans = settings.transitionDuration;
  const baseHold = settings.photoDuration;
  const perCost = baseHold + trans;
  const mode = settings.showLength;

  if (mode === 'all' || P === 0) {
    return { count: P, hold: baseHold, looped: false, mode, budget: null };
  }

  const introDur = intro.title ? intro.duration : 0;
  const outroDur = outro.title ? outro.duration : 0;
  // Section cards eat into the photo budget too (only when they'll actually
  // render — i.e. linear playback). Carve their time out alongside intro/outro.
  const includedIds = new Set(getIncludedPhotos().map((p) => p.id));
  const sectionDur = settings.shuffleOnPlay
    ? 0
    : useStore
        .getState()
        .sections.filter((c) => includedIds.has(c.beforePhotoId))
        .reduce((sum, c) => sum + c.duration + 0.8, 0);
  const target = mode === 'time' ? settings.timeLimitMin * 60 : totalIncludedSongSeconds();
  const budget = Math.max(perCost, target - introDur - outroDur - sectionDur);
  const naturalTime = P * perCost;

  if (budget >= naturalTime) {
    // Fewer photos than the time needs
    if (settings.fillBehavior === 'stretch') {
      return { count: P, hold: Math.max(0.8, budget / P - trans), looped: false, mode, budget };
    }
    const slots = Math.max(1, Math.round(budget / perCost));
    return { count: slots, hold: baseHold, looped: true, mode, budget };
  }
  // More photos than fit
  if (settings.fillBehavior === 'fit') {
    // Fit-all-photos mode: shorten per-photo duration so all photos show in budget
    const newHold = Math.max(0.8, budget / P - trans);
    return { count: P, hold: newHold, looped: false, mode, budget, fitted: true };
  }
  // Default: show a random subset that fits
  const slots = Math.max(1, Math.floor(budget / perCost));
  return { count: slots, hold: baseHold, looped: false, mode, budget };
}

export interface PlanDescription {
  tone: 'info' | 'warn';
  text: string;
  showFitButton?: boolean;
}

// Human-readable description of the current plan — drives the "photo budget"
// live readout in Settings.
export function describePlan(): PlanDescription | null {
  const { settings } = useStore.getState();
  const P = getIncludedPhotos().length;
  const plan = computePlan();
  if (P === 0) return null;
  if (plan.mode === 'all') return null;

  const songs = getIncludedSongs().length;
  if (plan.mode === 'music' && songs === 0) {
    return { tone: 'warn', text: 'Add songs first — match-music needs music to set the length.' };
  }

  const budgetSec = plan.budget;
  const budgetTxt = budgetSec ? fmt(budgetSec) : '0:00';
  const baseHold = settings.photoDuration;

  if (plan.fitted) {
    return {
      tone: 'info',
      text: `Fitting all ${P} photos into ${budgetTxt} — each shows for ${plan.hold.toFixed(1)}s.`,
    };
  }
  if (plan.looped) {
    return {
      tone: 'info',
      text: `${P} photo${P === 1 ? '' : 's'} loop${P === 1 ? 's' : ''} to fill ${budgetTxt} at ${baseHold}s each.`,
    };
  }
  if (plan.count < P) {
    // Too many — currently dropping
    const skipping = P - plan.count;
    return {
      tone: 'warn',
      text: `Music fits ${plan.count} photos at ${baseHold}s each. ${skipping} will be skipped — tap "Fit all photos" to include them all.`,
      showFitButton: true,
    };
  }
  return {
    tone: 'info',
    text: `All ${P} photos fit in ${budgetTxt}.`,
  };
}

// local copy of fmtTime to avoid circular help (kept identical)
function fmt(s: number): string {
  if (!isFinite(s)) return '--:--';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}

// Build the actual ordered photo list for one play/export run.
export function buildPlaybackList(): { list: Photo[]; hold: number } {
  const { settings } = useStore.getState();
  const base = getIncludedPhotos();
  const plan = computePlan();
  const doShuffle = settings.shuffleOnPlay;

  if (plan.looped && plan.count > base.length) {
    // Repeat the pool (reshuffled each pass) until we fill the slots
    const list: Photo[] = [];
    while (list.length < plan.count) {
      const chunk = doShuffle ? shuffle(base.slice()) : base.slice();
      for (const p of chunk) {
        if (list.length < plan.count) list.push(p);
      }
    }
    return { list, hold: plan.hold };
  }

  const pool = doShuffle ? shuffle(base.slice()) : base.slice();
  return { list: pool.slice(0, plan.count), hold: plan.hold };
}
