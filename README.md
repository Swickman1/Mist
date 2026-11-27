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
| `index/games.json` | Bundled catalog rows (`title`, `pageUrl`, `sizeBytes`), imported at startup. A GitHub `releases/latest` page resolves to its best Windows `.zip`/`.7z` (win64, then win32). **An entry's payload must contain the game's `.exe`** (top level or one folder down): data-only releases such as Freedoom install but cannot PLAY. A row's position in its file is its `rank` (0 = most popular); the Games tab lists library rows first, then index rows by rank, then everything else. The release must hold exactly one Windows build: rolling tags that pile up builds (Veloren `nightly`: 200 windows zips) would download all of them, and repos without release assets (OpenTTD) fail with "no parts found" |
| `src/renderer/src` | React UI: `store.tsx` (snapshot + UI state), `selectors.ts` (derived rules), `config.ts` (tuning knobs), `components/`, `pages/` |

## Seams (wired to the UI, intentionally unimplemented)

- `src/sources/index.ts` — `Resolver { resolve(entry): Promise<Part[]> }`; `archive.ts`, `installer.ts`, `magnet.ts` throw "not implemented". Called by *Add source* (game page / add flow); the error surfaces as a toast and the source is still saved.
- `src/player/index.ts` — `Player`: black 16:9 box in a loading state. Opened by Continue Watching, episode rows, PLAY/RESUME.
- `src/verify/index.ts` — `sha256File` stub. Called by the *Hash verified* chip on the game page.
- Game PLAY and save *Back up* return "not implemented" toasts.

## Building an index

`npm run index` runs every adapter in `scripts/index-sources/*.mjs` (each exports `{ name, url, fixture?, parse(html) -> { title, pageUrl, sizeBytes? }[] }`) and writes `index/catalog-extra.json`; `games.json` is never touched. Pages are fetched one at a time, 1 s apart, as `Mist/<version>`. A failed page is logged and skipped; rows are deduped by `pageUrl`, kept in page order (it is their rank), capped at 2000, stamped with `generatedAt`, and written via a `.tmp` + rename. If an adapter yields no rows the exit code is 1, and a run with no rows at all leaves the previous file in place. `npm run index -- --fixture` reads each adapter's saved HTML instead (no network); `--out <path>` writes elsewhere.

The shipped adapter reads `github.com/topics/open-source-game` (most-starred first). GitHub rate-limits that page (HTTP 429) after a few requests; rerun later. `catalog-extra.json` is not in `BUNDLED_FILES` yet, so Mist does not import it until that line lists it.

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

Three backends, tried in order:

1. **Local file → mpv** (below), with the built-in `<video>` player as mpv's fallback.
2. **No file → iframe.** When an episode has no file and its show has a TMDB trailer, the trailer plays in a sandboxed 16:9 iframe (`src/player/IframePlayer.tsx`). It needs no file and no download host. The frameable host is `EMBED_HOSTS` in `src/shared/embed.ts` (YouTube's no-cookie player); `src/renderer/index.html`'s CSP must list the same host, because a CSP is fixed when the page loads. The session guard allows frames of that host and the subresources they request (logged once per host as `[mist] frame host allowed: <host>`). Frame requests carry `https://com.mist.launcher/` as Referer (a `file://` page sends none, and YouTube then refuses with Error 153), and the app's user agent omits the `Electron/` token. Whether a video plays is up to the third party: on 2026-11-25 YouTube answered this PC with "Sign in to confirm you're not a bot". With no load event and no message after 12 s the player shows *Could not load the player* and **Open in browser** (`openExternal`, embed hosts only). Position is read from `{type:'time',currentTime}` messages from that host, written at most every 10 s and on close.
3. **Neither → the missing-file state.**

Trailer keys come from TMDB (`append_to_response=videos`) when a show is imported or refreshed.

The player uses **mpv** for every file it can open: HEVC, AV1, AC-3, DTS and so on, with hardware decoding (`hwdec=auto-safe`) and software fallback. mpv renders in a borderless window kept over the player's rectangle and is driven over its JSON IPC pipe. Keys go from Mist to mpv as `keypress`, so Mist keeps focus: Space/k pause, ←/j and →/l seek 10s, f fullscreen, Esc leaves fullscreen and then closes. If mpv is missing or cannot open a file, the built-in `<video>` player is used instead, with mpv's own error text as the reason.

### Getting mpv

- **Installed system-wide:** `winget install shinchiro.mpv` (installs to `C:\Program Files\MPV Player`). Mist finds it there, or on PATH.
- **Bundled with the installer:** copy mpv into `vendor/mpv/` before `npm run dist`. It is gitignored because mpv is a GPLv2+ third-party binary, so it is not committed:
  ```
  vendor/mpv/mpv.exe
  vendor/mpv/d3dcompiler_43.dll   (ships with the shinchiro build)
  vendor/mpv/LICENSE              (mpv's Copyright + LICENSE.GPL from github.com/mpv-player/mpv)
  ```
  `extraResources` copies them to `resources/mpv/`, which Mist checks first.
  `LICENSE` and `SOURCE.md` (pointers to the corresponding GPL source) are committed. `mpv.exe` is not, because at 124.8 MB it is over GitHub's 100 MB file limit. `npm run dist` checks for it first and stops with the winget-and-copy instructions if it is missing.
- **A specific build:** set `MIST_MPV_PATH` to its `mpv.exe`. When set, it is the only path Mist checks.

Without mpv the player shows a one-time banner ("mpv is not installed …") that you can dismiss; the choice is saved in settings.

mpv PIDs are tracked in `%APPDATA%\Mist\mpv-pids.json`; any left behind by a crash are killed on the next launch.

## File-host mirrors

Pirate mirrors are landing pages, not files: the file URL does not exist until the page's own script runs (a WASM proof-of-work at itsfileditchfiles.st, a ten-second countdown and a `pt` token at megadb.net). `src/main/lander.ts` resolves one in a hidden window on the app partition, watches for the request that carries the file, and returns the URL with the name from `Content-Disposition`.

Handled hosts: steamrip.com, megadb.net, bzzhr.to, itsfileditchfiles.st, fileditch.com, gofile.io, 1fichier.com, filecrypt.cc, getintopc.com, gamedownloadfree.com. Frame referrer is forced to `https://steamrip.com/`, which these hosts require.

The session's own `fetch` answers `ERR_BLOCKED_BY_CLIENT` for the resolved file hosts, so `httpFetch` falls back to plain Node fetch there. `probeLander` is a dev-only IPC for testing one page by hand.

A blocked host raises `HostNotAllowedError`, which parks the job in `blocked_host` and offers ALLOW rather than failing it.
