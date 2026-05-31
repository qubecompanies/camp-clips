import { useStore } from '../state/store';
import { toast } from '../state/toastStore';
import type { Settings } from '../state/types';

// ============ TEMPLATES ============
// A template is a complete recipe — settings + theme overrides + intro/outro
// suggestions. Picking a template overwrites the relevant fields, then the
// user can still tweak individual settings.

interface PaletteOverride {
  primary: string;
  primaryHover: string;
  primaryDeep: string;
  secondary: string;
  secondaryHover: string;
}

export interface Template {
  id: string;
  name: string;
  tagline: string;
  settings: Partial<Settings>;
  paletteOverride: PaletteOverride | null;
  intro: { titleStyle: 'roman' | 'italic'; placeholder: string };
}

export const TEMPLATES: Record<string, Template> = {
  default: {
    id: 'default',
    name: 'Default',
    tagline: 'Brand default · balanced',
    settings: {
      photoDuration: 4,
      transitionDuration: 1.5,
      kenBurns: true,
      kenBurnsIntensity: 0.09,
      showLength: 'all',
      fillBehavior: 'loop',
    },
    paletteOverride: null, // use brand colors
    intro: { titleStyle: 'roman', placeholder: 'Event Title' },
  },
  camp: {
    id: 'camp',
    name: 'Camp Recap',
    tagline: 'Energetic · fast pacing',
    settings: {
      photoDuration: 3.5,
      transitionDuration: 1.2,
      kenBurns: true,
      kenBurnsIntensity: 0.18, // energetic
      showLength: 'music',
      fillBehavior: 'fit',
    },
    paletteOverride: null, // brand defaults work great for camp
    intro: { titleStyle: 'roman', placeholder: 'Stake Youth Camp 2026' },
  },
  reunion: {
    id: 'reunion',
    name: 'Family Reunion',
    tagline: 'Warm · medium pacing',
    settings: {
      photoDuration: 4.5,
      transitionDuration: 1.5,
      kenBurns: true,
      kenBurnsIntensity: 0.09,
      showLength: 'all',
      fillBehavior: 'loop',
    },
    // Warmer earth palette — terracotta / olive / cream
    paletteOverride: {
      primary: '#D2691E', // terracotta
      primaryHover: '#E07A30',
      primaryDeep: '#A4501A',
      secondary: '#556B2F', // dark olive
      secondaryHover: '#6F8B3F',
    },
    intro: { titleStyle: 'italic', placeholder: 'The Eakers · Summer 2026' },
  },
  wedding: {
    id: 'wedding',
    name: 'Wedding',
    tagline: 'Cinematic · subtle motion',
    settings: {
      photoDuration: 5,
      transitionDuration: 2,
      kenBurns: true,
      kenBurnsIntensity: 0.05, // subtle
      showLength: 'music',
      fillBehavior: 'fit',
    },
    // Blush / champagne / ivory palette
    paletteOverride: {
      primary: '#D4A574', // champagne gold
      primaryHover: '#E5BC8E',
      primaryDeep: '#A68253',
      secondary: '#C08081', // muted rose
      secondaryHover: '#D49899',
    },
    intro: { titleStyle: 'italic', placeholder: 'Sarah & Mark · June 2026' },
  },
};

// Write palette overrides to CSS custom properties on the root element.
// Passing null restores the brand defaults from the stylesheet.
export function applyPaletteOverride(override: PaletteOverride | null): void {
  const root = document.documentElement;
  const cssNames: Record<keyof PaletteOverride, string> = {
    primary: '--primary',
    primaryHover: '--primary-hover',
    primaryDeep: '--primary-deep',
    secondary: '--secondary',
    secondaryHover: '--secondary-hover',
  };
  (Object.keys(cssNames) as (keyof PaletteOverride)[]).forEach((k) => {
    if (override && override[k]) {
      root.style.setProperty(cssNames[k], override[k]);
    } else {
      root.style.removeProperty(cssNames[k]);
    }
  });
}

export function applyTemplate(id: string): void {
  const tpl = TEMPLATES[id];
  if (!tpl) return;

  // Apply settings overrides + record the template id; components re-render
  // off the store, so no manual UI sync is needed.
  useStore.getState().updateSettings({ ...tpl.settings, templateId: id });

  // Apply palette override (or clear it)
  applyPaletteOverride(tpl.paletteOverride);

  toast(`Template applied: ${tpl.name}.`, 'success');
}
