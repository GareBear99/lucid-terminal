# Phone streaming — Phase 0 spike

Date: 2026-11-05. Status: built in the repo, NOT verified on the Mac.
No commit, no push, no deploy from this pass.

## What it is

scrcpy-server H.264 over adb + WebCodecs decode, owned by Electron
main. No standalone server, no relay. Local emulator / USB only.
The browser's Phone quick tab still points at the standalone server
(`http://127.0.0.1:8090`) as the fallback — that path is untouched.

## Where the code lives

- `src/phone/streaming.ts` — pure shared logic: GPU gate, two-entry
  Phone button, capacity caps, STALE badge, scrcpy wire format
  (raw Annex B, 32-byte touch messages), server launch args,
  streaming metrics. No Electron / DOM / Node imports.
- `electron/services/scrcpy.ts` — session manager + device registry:
  adb resolution, jar push, reverse tunnel, server spawn, video +
  control sockets, access-unit grouping, reconnect with backoff,
  1-internal / 99-external caps enforced in code.
- `electron/ipc/android.ts` — IPC wiring only. **Not imported by
  `electron/main.ts` yet** — the coordinator wires one line in
  `app.whenReady`, next to the browser handlers:
  `setupAndroidHandlers(ipcMain, () => mainWindow);`
- `src/stores/phoneStore.ts` — renderer state: gate, add-on
  installed flag, active internal serial, metrics.
- `src/components/Phone/PhoneView.tsx` — canvas + VideoDecoder
  (`prefer-hardware`), STALE badge, metrics line, pointer -> touch.
- `src/components/Browser/BrowserPanel.tsx` — the two Phone entries
  (`PhoneQuickTabs`): `Phone — External` always, `Android — Installed`
  only when the add-on is installed, greyed out with its hover reason
  when the GPU gate is closed. Clicking the internal entry streams
  the first connected adb device.
- `electron/ipc/browser.ts` — the mitigation: `backgroundThrottling:
  false` on the phone BrowserView, so its timers keep running when
  the panel switches to the AI Chat tab.
- `electron/preload.ts` + `src/types/index.ts` — the `android`
  namespace on `window.lucidAPI`.
- `src/stores/browserStore.ts` — QUICK_TABS only: the Phone entry is
  now the external one (`phone-external`, `Phone — External`).

## The GPU gate (Lucid-internal only)

Main checks the real capability: `app.getGPUFeatureStatus()`
(`video_decode` must read hardware-enabled) plus
`app.getGPUInfo('complete')` (no SwiftShader/llvmpipe/software
renderer). The renderer falls back to
`navigator.mediaCapabilities.decodingInfo()` for H.264 when the IPC
is absent. The gate applies ONLY to the in-app (internal) entry.
The external entry, the emulator, and the standalone server never
consult it. When closed, the internal button is disabled with the
hover reason on the button itself:
"Phone streaming needs hardware video decoding — no GPU detected".
The Mac has a GPU, so the gate must read ENABLED there — if it
reads closed on the Mac, that is a bug in the check, not in the Mac.

## Capacity

1 loaded internal, 99 external, 100 total — enforced in
`PhoneRegistry`, not just in the UI. The UI surfaces the counts
(`android:getCapacity` returns the summary, e.g.
"1 internal loaded, 3/99 external connected"). The single internal
instance gets the full-rate stream; externals are control-only /
thumbnails per the research report (not built in this spike).

## The jar (open item)

The pinned scrcpy-server 2.4 jar is NOT bundled yet — Gary has not
answered whether it ships inside Lucid or downloads on first use.
`ScrcpySession.start()` fails loudly naming the expected path
(`resources/scrcpy/scrcpy-server.jar`, Genymobile/scrcpy,
Apache-2.0) instead of pretending to stream. The Mac re-run needs
the jar placed there first.

## Baselines (research report, Mac, 2026-11-05)

| Measurement | Baseline | Spike target |
|---|---|---|
| `adb shell screencap -p` | 2,214 ms median | — (replaced) |
| HTTP GET /api/frame | 1,187 ms median | scrcpy frame path must beat this by an order of magnitude |
| POST /api/tap | 467 ms | control-socket tap < 20 ms (send-side) |
| Tap-to-visual-feedback | ~1.9–2.0 s (computed) | < 150 ms glass-to-glass, local emulator |
| Effective frame rate | ~0.85 fps | 30 fps sustained |
| Decode | — | VideoToolbox hardware, VERIFIED engaged |

## VM-measured numbers (this VM, 2026-11-05 — NOT Mac numbers)

No emulator, no adb, no VideoToolbox here, so these are the pure
code paths only, on a synthetic 100 KB Annex B frame:

- `splitAnnexB`: 0.406 ms/op
- `groupAccessUnits` + `encodeAccessUnit`: 0.381 ms/op
- `encodeTouchMessage` (32 B): 0.0028 ms/op
- `StreamingMetrics.recordFrame` + snapshot (120 frames): 0.034 ms/op
- Synthetic 30 fps metrics snapshot: fps 30.3, median frame
  interval 33 ms, median tap 15 ms (2 taps at 12/18 ms)
- adb in this VM: NOT FOUND (expected — no SDK here)

The per-frame CPU cost of the spike's own parsing is ~0.8 ms/frame
on this VM — two orders under the 33 ms frame budget. The remaining
latency lives in capture / encode / decode on the Mac, which is
exactly what the Mac re-run measures.

## Mac re-run steps (the coordinator / Mac check)

1. Place the pinned jar: `resources/scrcpy/scrcpy-server.jar`
   (scrcpy-server 2.4, Genymobile/scrcpy releases).
2. Restart the emulator (`emulator-5554`), confirm `adb devices`
   shows it.
3. Coordinator wires the one line into `main.ts` (see above),
   then builds + installs the Mac build as usual.
4. Open Lucid, go to the Browser tab. The Phone row must show
   `Phone — External` AND (add-on installed) `Android — Installed`,
   enabled — the gate must read open on the Mac. Hover the internal
   entry: no grey-out.
5. Click `Android — Installed`. The stream should show the emulator
   home screen. Watch the metrics line in PhoneView: fps, median
   tap ms, decode path, frame count.
6. Verify hardware decode is really engaged (do not assume it):
   - metrics line must read `hardware decode`, not `software`;
   - open `chrome://gpu` in the browser tab: Video Decode must
     read "Hardware accelerated";
   - Activity Monitor: Lucid CPU for one stream must stay under
     10% (research go-criterion). If decode reads `software`, that
     is a bug to fix, not a fallback.
7. Tap the canvas: the emulator must react, and the metrics line's
   median tap must read < 20 ms. Time tap-to-visual-feedback by
   eye against the 1.9–2.0 s baseline — target < 150 ms.
8. Leave the stream running 10 minutes, then switch to the AI Chat
   tab and back: the frame must not go stale (pushed stream +
   `backgroundThrottling: false`). Cover the phone with a static
   screen and wait: the STALE badge must appear once the frame is
   older than 2 s, and clear on the next frame.
9. Kill the emulator mid-stream, restart it: the session must move
   to `reconnecting` and come back without relaunching Lucid.
10. Record the numbers (fps sustained, median tap, glass-to-glass
    estimate, decode path, CPU %) and put them in the commit message.

Go criteria (from the research report): emulator glass-to-glass
< 150 ms, sustained 30 fps, hardware decode confirmed, Mac CPU
< 10% for one stream, stream survives 10 min + a device
disconnect/reconnect. No-go -> fall back to screenrecord-first
and re-plan.

## Deliberately NOT done

- No relay, no remote transport, no relay-vs-P2P decision (Gary's).
- No jar bundled (open question above).
- No add-on install flow — the internal entry appears when the
  install flow lands and flips the installed flag.
- No multi-device UI, no thumbnails, no audio, no recording.
- The external BrowserView page gets no STALE badge: it is the
  standalone server's page, not Lucid content — the mitigation
  there is `backgroundThrottling: false`.
