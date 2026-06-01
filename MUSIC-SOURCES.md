# Built-in music library — sourcing notes

This document accompanies the built-in music library infrastructure
(`public/music/manifest.json` + the "Browse Library" tab). It lists trusted
royalty-free sources and **candidate** tracks to consider bundling.

> ⚠️ **License caveat — read before shipping any track.**
> I am **not** verifying these licenses from memory, and the app does not assert
> that any license is valid. Every license label below is what the source
> *states* on its site. Before bundling a track into Camp Clips (which
> redistributes it to end users), **you must open the source link, confirm the
> current license terms, and confirm whether attribution is required.** Terms
> change, and some "free" tracks are free for streaming but not for
> redistribution. When in doubt, prefer CC0 / Public Domain or a license that
> explicitly permits redistribution in a downloadable app.

---

## How to add a track once you've verified it

1. Download the audio file (MP3 is fine; keep it reasonably sized).
2. Drop it under `public/music/<mood>/` — e.g. `public/music/upbeat/sunrise.mp3`.
   (Create the mood subfolder if it doesn't exist.)
3. Add an entry to the matching mood's `tracks` array in
   `public/music/manifest.json`:

   ```json
   {
     "id": "upbeat-sunrise",
     "title": "Sunrise",
     "artist": "Artist Name",
     "file": "upbeat/sunrise.mp3",
     "duration": 142,
     "source": "https://source-url-you-verified",
     "license": "CC0",
     "attribution": "Sunrise by Artist Name (CC0) — source-url"
   }
   ```

   - `id` must be unique across the whole manifest (prevents double-adds).
   - `license` is the label shown in the UI — copy it verbatim from the source.
   - `attribution` is the credit line shown/exported; fill it in **only if the
     license requires credit**. CC0 tracks can leave it blank.
   - `duration` is an optional hint for the list; the app re-reads the true
     duration on add, so an approximate value is fine.

The "Browse Library" tab already handles empty moods gracefully ("coming
soon"), so you can ship the infrastructure now and fill tracks in over time.

---

## Trusted sources (verify license per-track)

These are well-known, reputable catalogs for royalty-free / openly-licensed
music. Inclusion here is **not** a license guarantee — confirm each track.

| Source | URL | Typical licensing | Notes |
|---|---|---|---|
| **Free Music Archive** | https://freemusicarchive.org | Mix of CC0, CC-BY, CC-BY-SA | Filter by license; CC-BY needs attribution. |
| **ccMixter** | https://ccmixter.org | Creative Commons variants | Check each upload's specific CC license. |
| **Pixabay Music** | https://pixabay.com/music/ | Pixabay Content License (free, no attribution) | Confirm redistribution terms for bundled use. |
| **Incompetech (Kevin MacLeod)** | https://incompetech.com/music/royalty-free/ | CC-BY 4.0 (attribution required) | Huge catalog; attribution line provided per track. |
| **Bensound** | https://www.bensound.com | Free tier requires attribution; paid removes it | Verify the free-license redistribution clause. |
| **Chosic** | https://www.chosic.com/free-music/all/ | Aggregates CC sources | Each track links back to its original license. |
| **Musopen** | https://musopen.org | Public Domain / CC (classical) | Good for cinematic/reflective classical pieces. |
| **YouTube Audio Library** | https://studio.youtube.com (Audio Library) | "No attribution required" + "Attribution required" buckets | Download requires a Google account; check the per-track tag. |
| **Uppbeat** | https://uppbeat.io | Free with credit (free tier) | Free tier has monthly limits + required credit. |

**Safest default for a bundled app:** prefer **CC0 / Public Domain** (Pixabay,
Musopen public-domain, FMA's CC0 filter) so you avoid attribution-tracking
obligations entirely. If you use CC-BY (e.g. Incompetech), the app already has
an `attribution` field ready to surface the required credit.

---

## Candidate tracks by mood (TO VERIFY — none bundled yet)

I'm intentionally **not** pre-filling `manifest.json` with these, because I
can't confirm their licenses for you. Treat this as a shortlist to evaluate.
Pick the ones whose terms you've confirmed, then follow "How to add a track"
above.

### Upbeat
- Search Pixabay Music → "upbeat" / "happy" / "summer" (Pixabay Content License).
- Incompetech → "Carefree", "Wallpaper", "Life of Riley" (CC-BY 4.0, credit required).

### Cinematic
- Incompetech → "The Descent", "Heroic Age", "Impact Prelude" (CC-BY 4.0).
- Pixabay → "cinematic" / "epic" / "inspirational" tag.

### Warm
- FMA → CC0/CC-BY acoustic & folk (filter by license).
- Pixabay → "acoustic" / "ukulele" / "folk".

### Reflective
- Musopen → public-domain piano (e.g. Satie *Gymnopédie No. 1*, Debussy
  *Clair de Lune*) — confirm the *recording's* license, not just the composition.
- Pixabay → "ambient" / "calm" / "piano".

---

*Generated as part of P1.4. Update this file as tracks are vetted and added.*
