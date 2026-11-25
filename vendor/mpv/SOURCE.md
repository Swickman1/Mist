# mpv in Mist — source and license

Mist bundles a prebuilt `mpv.exe` (and `d3dcompiler_43.dll` from the same build) in
`resources/mpv/`. It is used as a separate program. Mist talks to it over its
JSON IPC pipe and does not link it.

- **Build:** shinchiro's Windows build of mpv **v0.42.0-3-g902818753**, built 2026-11-06,
  installed with `winget install shinchiro.mpv` (0.42.0).
- **License:** GPLv2 or later (this build enables the `gpl` feature). The full text
  is in `LICENSE`: mpv's `Copyright` file followed by `LICENSE.GPL`.

## Where the binary comes from

`mpv.exe` and `d3dcompiler_43.dll` are attached to the release tagged **mpv-0.42.0**:
https://github.com/Swickman1/Mist/releases/tag/mpv-0.42.0 . `npm run fetch-mpv` (also run
by postinstall and by `npm run dist`) downloads them into this folder and checks them
against the sha256 values pinned in `scripts/fetch-mpv.mjs`.

## Corresponding source

- mpv: https://github.com/mpv-player/mpv/tree/902818753849d9ad8f0096fad6ca5aeaa37113b9
- Build scripts and dependency versions for this binary (FFmpeg N-128504-g9f690c6a4,
  libplacebo v7.387.0 and the rest): https://github.com/shinchiro/mpv-winbuild-cmake
- FFmpeg: https://github.com/FFmpeg/FFmpeg (revision 9f690c6a4)

## Refreshing

```
winget install shinchiro.mpv
copy "C:\Program Files\MPV Player\mpv.exe"            vendor\mpv\
copy "C:\Program Files\MPV Player\d3dcompiler_43.dll" vendor\mpv\
```

Then upload them to a new `mpv-<version>` release, update `MPV_VERSION` and the
sha256 values in `scripts/fetch-mpv.mjs`, and update the version and links above.
