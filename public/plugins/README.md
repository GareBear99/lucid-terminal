# Plugin voice recordings

Plugins have voice recordings all throughout (Gary, 2026-11-07
~02:54 PST): every plugin, on every page/view, explaining what you
are looking at. Each recording is synthesized in Lily's voice.
The voice reads the EXACT words below — no paraphrase, no extra
words. The button on the plugin's page plays it, never auto-play.

## Files

| File | Page | Duration |
| --- | --- | --- |
| `synth-main.mp3` | Synth view | ~22s |
| `devices-explanation.mp3` | Devices tab (Settings) — the one good one | ~31s |
| `persona-plex-view.mp3` | Persona Plex view | ~27s |
| `modules-main.mp3` | Modules tab (Settings) | ~30s |
| `plugins-explanation.mp3` | Plugins tab (Settings) — the flagship | ~32s |

Already voiced elsewhere (not in this folder): the Forge
(`public/forge/*.mp3` — main, dual-unison, tail-generator,
explanation), the add-ons (`public/addons/*.mp3`), the Segments
categories (`public/segments/*.mp3`), Settings Permissions
(`public/settings/permissions-explanation.mp3`). The AI panel is
owned by the AI-panel unmount work — its voice follows that
remount.

## Exact scripts

### synth-main.mp3 — Synth view

> This is the Synth. The shell on the left is the Matrix Synth,
> version 67. The thinker lives in the eye. The inspector on the
> right shows the shell state, the seed, and the mounted
> embodiment. Lucifer is mounted here first. Reseed shuffles the
> thinker. The Neural Synth has eight categories, bound to the
> seed. Pick a Homunculus colour to set the theme.

### devices-explanation.mp3 — Devices tab (the one good one)

> This is Devices. Lucid detects what's connected to this Mac —
> USB devices, Android devices, and this Mac itself. Detection
> only. It never controls a device, and it never talks to one. USB
> comes from system profiler. Android comes from A D B. This Mac
> shows up as the host. Press Refresh to scan again. Android
> Connect is installed automatically with Devices — it's how
> Android devices are detected. If nothing shows up, connect a
> device and press Refresh.

### persona-plex-view.mp3 — Persona Plex view

> This is Persona Plex. One plex embodiment, personas inside. The
> roster starts from your existing souls. Custom personas are added
> below. Everything is local, no servers. The Speak toggle turns
> on right-click Speak in A I chat, read aloud in the active
> persona's voice. Voices and options also live in the
> Forge-to-Persona Plex segment, in Modules, Segments. A voice
> picked there is the same voice here.

### modules-main.mp3 — Modules tab

> This is Modules. Modules is an anchored plugin, built in, always
> present, no install step, no toolbar button. It is the container
> for Segments. The starship's segments appear here when a starship
> is detected. The computer-control segment lives here too —
> pre-installed, agent-only, with a lock switch. Segments is
> installed automatically with Modules. Nothing here needs
> installing. It is all built in.

### plugins-explanation.mp3 — Plugins tab (the flagship)

> This is Plugins. Core plugins are built in and always installed
> — Synth, Help, A I Chat, and Forge. The toggles put a plugin's
> button on the icon bar. Lucifer A I is the plugin itself — Synth
> and Help are its surfaces, and turning it off removes them. A I
> Chat is its own plugin now, and it stays. Devices and Modules
> are anchored plugins, built in too. Add-ons install below —
> installing just switches one on, it is already built in. An
> installed add-on gets a Settings button.

## Wiring

`src/lib/pluginVoice.ts` maps a voice id to its path
(`./plugins/<id>.mp3`). `src/components/PluginVoiceButton.tsx`
is the play/pause toggle used on each plugin page. The Devices
button is `src/components/Settings/DevicesVoiceButton.tsx` — wire
it into the Devices tab in SettingsPanel.tsx with one import and
`<DevicesVoiceButton />` next to "Detected devices". The Plugins
button is `src/components/Settings/PluginsVoiceButton.tsx` — wire
it into the Plugins tab in SettingsPanel.tsx with one import and
`<PluginsVoiceButton />` next to "Core plugins".
