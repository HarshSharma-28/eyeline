# Contributing to Eyeline

Thanks for helping. Bug reports, small fixes and bigger features are all welcome.

## Run it

```sh
npm install
npm start
```

`npm install` copies the speech engine (vosk-browser), the Word-file reader (mammoth) and the Geist fonts into `app/`, then downloads the English voice model into `models/`. None of those are committed. If the model download fails, run `npm run fetch-model`, or let the app fetch it the first time you press Start.

Most of the behaviour lives in two files:

- `app/overlay.html` has the floating overlay: splitting the script into words, matching what the recognizer hears, scrolling, the one-phrase layout and the controls.
- `main.js` has the windows, the local file server the pages load from, click-through, dragging, global shortcuts and voice model downloads.

The pages talk to `main.js` through the small `window.api` bridge in `preload.js`.

## Check your change

Please try what you changed by hand before opening a pull request:

1. Start voice follow and read a few lines aloud. The script should follow, hold still while you pause, and stop with "End of script" at the end.
2. Switch to Auto and back, change the layout, and resize the text from the overlay.
3. Drag the overlay by its move button, then click a button on it without moving the mouse first. Clicks on the script text should still reach the window underneath.
4. If you touched anything platform specific, say in the pull request which systems you tried it on.

To see what the overlay is doing, put an empty `debug.flag` file next to the app's executable (or next to the `electron` binary when running from source). Eyeline then writes `eyeline-debug.log` there.

## Build the apps

```sh
npm run dist:win     # or dist:mac, dist:linux, dist
```

Builds land in `dist/`, each with its `READ ME FIRST.txt` from `build/readme/`. If you change setup steps or shortcuts, update those files and the README together.

## Style

Plain JavaScript, no framework, no bundler. Keep each page a single HTML file. Interface text should say what the person will see or do ("Microphone blocked. Allow it in Windows Settings › Privacy › Microphone."), not what the code does.
