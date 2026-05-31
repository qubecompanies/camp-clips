import { useStore } from '../state/store';
import { shuffle } from './utils';
import type { Photo, ShowLength } from '../state/types';

export function getIncludedPhotos(): Photo[] {
  return useStore.getState().photos.filter((p) => p.included);
}
export function getIncludedSongs() {
  return useStore.getState().songs.filter((s) => s.included);
}

export function totalIncludedSongSeconds(): number {
  return getIncludedSongs().reduce((sum, s) => sum + (s.duration || 0), 0);
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
  const target = mode === 'time' ? settings.timeLimitMin * 60 : totalIncludedSongSeconds();
  const budget = Math.max(perCost, target - introDur - outroDur);
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
