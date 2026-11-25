# mpv in Mist — source and license

Mist bundles a prebuilt `mpv.exe` (and `d3dcompiler_43.dll` from the same build) in
`resources/mpv/`. It is used as a separate program. Mist talks to it over its
JSON IPC pipe and does not link it.

- **Build:** shinchiro's Windows build of mpv **v0.42.0-3-g902818753**, built 2026-11-06,
  installed with `winget install shinchiro.mpv` (0.42.0).
- **License:** GPLv2 or later (this build enables the `gpl` feature). The full text
  is in `LICENSE`: mpv's `Copyright` file followed by `LICENSE.GPL`.

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

Then update the version and commit links above.
