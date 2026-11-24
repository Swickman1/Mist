# Mist

Offline-first catalog and launcher shell for locally owned games and shows.
Electron 33 + electron-vite + React 18 + TypeScript, local SQLite (better-sqlite3).
No backend, no accounts, **no network requests**.

## Run

```
npm install      # also rebuilds better-sqlite3 for Electron (prebuilt binary)
npm run dev      # hot-reload dev
npm run build && npm start
npm run typecheck
```

Data lives in `%APPDATA%/mist/mist.db`; it is seeded with 12 games / 8 shows on first run.
Settings → Library data has **Clear library** (shows the empty states) and **Restore sample data**.

## Layout

| Path | What |
| --- | --- |
| `src/shared/types.ts` | Every shared type, the `MistCalls` IPC contract, channel names |
| `src/main/repository.ts` | SQLite document tables (games, shows, episodes, library, jobs, settings, watchlist) |
| `src/main/seed.ts`, `art.ts` | Fake rows + deterministic SVG gradient art (no picsum, nothing remote) |
| `src/main/jobRunner.ts` | Fake download runner: queued → resolving → downloading → verifying → extracting → ready. Lantern Keep stalls at 40% then recovers on attempt 2; Rust & Rhyme fails on hash mismatch until Retry |
| `src/main/service.ts` | `MistService implements MistCalls` — the only thing the renderer talks to |
| `src/main/index.ts`, `chrome.ts` | Window with native Windows caption buttons (`titleBarOverlay`, themed), IPC dispatch, network guard |
| `src/preload/index.ts` | `window.mist` bridge built from `MIST_METHODS` |
| `src/renderer/src` | React UI: `store.tsx` (snapshot + UI state), `selectors.ts` (derived rules), `config.ts` (tuning knobs), `components/`, `pages/` |

## Seams (wired to the UI, intentionally unimplemented)

- `src/sources/index.ts` — `Resolver { resolve(entry): Promise<Part[]> }`; `archive.ts`, `installer.ts`, `magnet.ts` throw "not implemented". Called by *Add source* (game page / add flow); the error surfaces as a toast and the source is still saved.
- `src/player/index.ts` — `Player`: black 16:9 box in a loading state. Opened by Continue Watching, episode rows, PLAY/RESUME.
- `src/verify/index.ts` — `sha256File` stub. Called by the *Hash verified* chip on the game page.
- Game PLAY and save *Back up* return "not implemented" toasts.

## No network

- Main: `session.webRequest.onBeforeRequest` cancels anything that is not `file:`/`data:`/`blob:`/`devtools:` (or the local dev server in `npm run dev`) and logs `[mist] blocked network request`.
- Renderer: CSP `default-src 'self'`, images only `self`/`data:`/`blob:`.
- Window opens and navigations are denied. Verified: `fetch('https://example.com')` and a remote `<img>` both fail inside the app.

## Icon & install

- Icon masters: `build/icon.svg` (full) and `build/icon-small.svg` (16–32px). `npm run icons` renders `build/icon.ico` + `icon.png`. The title-bar logo imports the same SVG.
- `npm run dist` → `dist/Mist Setup <version>.exe`: per-user NSIS installer to `%LOCALAPPDATA%\Programs\Mist`, with Start menu + desktop shortcuts (searchable in Windows). Uninstall from Windows Settings → Apps.
- App id `com.mist.launcher` (matches `build.appId`) for taskbar grouping; a single instance only (a second launch focuses the open window).
- Settings → Startup → **Launch at login** (installed app only).
- **Build gotcha:** without Windows Developer Mode, electron-builder fails extracting `winCodeSign` (macOS symlinks). Fix: extract the cached `.7z` with `7za x -y` into `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0` and rerun.

## Playback

The player uses **mpv** when it is installed (`winget install shinchiro.mpv`, or put `mpv.exe` in `vendor/mpv/`, or on PATH). mpv renders inside a borderless child window that tracks the player's rectangle and is controlled over its JSON IPC pipe. It plays any codec (HEVC, AV1, AC-3/DTS…) with `hwdec=auto-safe`; when no hardware decoder fits, mpv drops to software. Settings → Playback → **Hardware decoding** turns hardware decoding off. When mpv is missing or cannot open a file, the built-in `<video>` player (H.264/VP9/AV1 + AAC/Opus) is used instead, behind the same `Player` props.
