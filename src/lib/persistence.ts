import { useStore, selectPhotos } from '../state/store';
import { applyPaletteOverride, TEMPLATES } from './templates';
import { toast } from '../state/toastStore';
import type { ProjectFile } from '../state/types';

// ============ SAVE / LOAD PROJECT ============
// Projects store only metadata (names, order, included flags, settings) — never
// the photo/song binary data. On load, the user re-picks the same files and we
// reorder them to match. Ported from the prototype.

export function saveProject(): void {
  const state = useStore.getState();
  const { eventName, intro, outro, settings, songs } = state;
  const photos = selectPhotos(state);
  const project: ProjectFile = {
    schemaVersion: 1,
    eventName,
    intro,
    outro,
    settings,
    photoOrder: photos.map((p) => ({ name: p.name, included: p.included })),
    songOrder: songs.map((s) => ({ name: s.name, included: s.included })),
    savedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(eventName || 'camp-clips').replace(/[^a-z0-9-_]/gi, '_')}.campclips.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast('Project saved. Reload by picking the same photos and songs again.', 'success');
}

export async function loadProject(file: File): Promise<void> {
  try {
    const text = await file.text();
    const data = JSON.parse(text) as Partial<ProjectFile>;
    const state = useStore.getState();

    // Merge top-level fields + settings into the store
    state.replaceProject({
      eventName: data.eventName ?? state.eventName,
      intro: data.intro ?? state.intro,
      outro: data.outro ?? state.outro,
      settings: data.settings ?? state.settings,
    });

    // Re-apply the saved template's palette so theming matches what was saved
    const tplId = (data.settings && data.settings.templateId) || state.settings.templateId;
    const tpl = TEMPLATES[tplId] || TEMPLATES.default;
    applyPaletteOverride(tpl.paletteOverride);

    // Reorder existing photos/songs to match saved order + restore included flags.
    // Projects only persist photos; any session-only clips keep their order and
    // sit after the restored photos in the unified media list.
    if (data.photoOrder) {
      const orderMap = new Map(data.photoOrder.map((p, i) => [p.name, { i, included: p.included }]));
      useStore.setState((s) => {
        const photos = s.media.filter((m) => m.kind === 'photo');
        const clips = s.media.filter((m) => m.kind === 'clip');
        const restored = photos.map((p) => {
          const info = orderMap.get(p.name);
          return info ? { ...p, included: info.included } : p;
        });
        restored.sort((a, b) => (orderMap.get(a.name)?.i ?? 9999) - (orderMap.get(b.name)?.i ?? 9999));
        return { media: [...restored, ...clips] };
      });
    }
    if (data.songOrder) {
      const orderMap = new Map(data.songOrder.map((s, i) => [s.name, { i, included: s.included }]));
      useStore.setState((s) => {
        const songs = s.songs.map((song) => {
          const info = orderMap.get(song.name);
          return info ? { ...song, included: info.included } : song;
        });
        songs.sort((a, b) => (orderMap.get(a.name)?.i ?? 9999) - (orderMap.get(b.name)?.i ?? 9999));
        return { songs };
      });
    }

    toast('Project loaded.', 'success');
  } catch (err) {
    console.error(err);
    toast("That file doesn't look like a Camp Clips project.", 'error');
  }
}
