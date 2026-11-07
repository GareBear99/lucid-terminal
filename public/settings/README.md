# Settings voice recordings

Settings tabs have flagship voice recordings (Gary, 2026-11-07
~05:38 PST): the Appearance and Customization tabs each get one
flagship recording, like the Devices flagship — a single main
explanation of what the tab is, and how it differs from the other
one, so a user never confuses them. Each recording is synthesized
in Lily's voice. The voice reads the EXACT words below — no
paraphrase, no extra words. The button on the tab plays it, never
auto-play.

## Files

| File | Tab | Duration |
| --- | --- | --- |
| `permissions-explanation.mp3` | Permissions tab (Settings) | ~90s |
| `appearance-explanation.mp3` | Appearance tab (Settings) — flagship | ~34s |
| `customization-explanation.mp3` | Customization tab (Settings) — flagship | ~34s |

Already voiced elsewhere (not in this folder): the plugins
(`public/plugins/*.mp3` — Synth, Devices flagship, Persona Plex,
Modules, Plugins flagship), the Forge
(`public/forge/*.mp3` — main, dual-unison, tail-generator,
explanation), the add-ons (`public/addons/*.mp3`), the Segments
categories (`public/segments/*.mp3`).

## The difference, in one line

Appearance is how Lucid **looks** (theme + font, the surface).
Customization is how Lucid **behaves and what it shows**
(processing animation, Sentinel face gaze, validation display,
token display). Each recording says so, so the two tabs are never
confused.

## Exact scripts

### appearance-explanation.mp3 — Appearance tab

> This is Appearance. Appearance is how Lucid looks. Pick a theme
> — the colours of everything you see — or make your own custom
> theme. Then pick the terminal font: the family and the size. That
> is all this tab does: the surface, what your eyes meet. It is
> not Customization. Customization is how Lucid behaves and what it
> shows — the processing animation, how closely the Sentinel face
> watches your cursor, validation steps, token statistics. Looks
> live here. Behaviour lives in Customization.

### customization-explanation.mp3 — Customization tab

> This is Customization. Customization is how Lucid behaves and
> what it shows. The processing animation. How closely the
> Sentinel face watches your cursor — low and its eyes wander and
> only glance; high and they track it closely and lock on. Whether
> validation steps show, and whether finished ones collapse away.
> Whether token statistics and efficiency indicators show. That is
> all this tab does: behaviour, not looks. Looks live in
> Appearance — the theme and the font. Behaviour lives here.

## Wiring

`src/lib/settingsVoice.ts` maps a voice id to its path
(`./settings/<id>.mp3`). `src/components/PluginVoiceButton.tsx`
is the play/pause toggle used on each tab. The Appearance button
is `src/components/Settings/AppearanceVoiceButton.tsx` — wire it
into the Appearance tab in SettingsPanel.tsx with one import and
`<AppearanceVoiceButton />` next to "Theme". The Customization
button is
`src/components/Settings/CustomizationVoiceButton.tsx` — wire it
into the Customization tab with one import and
`<CustomizationVoiceButton />` next to "Processing Animation".
