A teleprompter that floats under your webcam and moves with your voice. Pick the download for your computer:

| System | Download |
|---|---|
| Windows 10 / 11 (64-bit) | Eyeline-Windows.zip |
| Mac with Apple Silicon (M1 and newer) | Eyeline-Mac-AppleSilicon.zip |
| Mac with Intel | Eyeline-Mac-Intel.zip |
| Linux (x64) | Eyeline-Linux-x64.tar.gz |

Each one includes the English voice model and a `READ ME FIRST.txt` with setup steps.

On a Mac, run this once in Terminal after moving Eyeline to Applications, because the app isn't notarized by Apple yet:

```sh
xattr -cr /Applications/Eyeline.app && codesign --force --deep --sign - /Applications/Eyeline.app
```

Hiding from screen recordings works fully on Windows, only against Google Meet in Chrome on macOS 15 and later, and not at all on Linux. The [README](https://github.com/HarshSharma-28/eyeline#hiding-from-screen-recording-and-screen-sharing) explains why.
