Unreleased
----------

* Add Timex TC2048 machine support, with all three SCLD video modes (dual
  display file, hi-colour 8x1 attributes, and hi-res 512x192), including
  switching screen mode part-way through a frame
* Load TC2048 snapshots (SZX machine ID 8, .z80 hardware mode 14), restoring
  the SCLD screen mode
* Fix `pageIsContended` being too small to cover the Pentagon and TRDOS ROM
  pages, which read past the end of the array
* Fix a frame buffer view in the worker that passed a size where an end offset
  was expected


3.2 (2024-11-23)
----------------

* Add mappings from keyboard symbol keys to equivalent Spectrum keypresses (Andrew Forrest)
* Add support for the Recreated ZX Spectrum's "game mode" (Andrew Forrest)
* Add `keyboardEnabled` configuration option
* Add `uiEnabled` configuration option
* Add `loadSnapshotFromStruct` API endpoint
* Add `onReady` API endpoint
* Enable 'instant tape loading' option in sandbox mode
* Make keyboard event listeners play better with other interactive elements on the page


3.1 (2021-08-26)
----------------

* Real-time tape loading, including turbo loaders (except for direct recording, CSW and generalized data TZX blocks)
* Emulate floating bus behaviour
* Fix typo in docs (`openURL` -> `openUrl`)


3.0.1 (2021-08-16)
------------------

* Fix relative jump instructions to not treat +0x7f as -0x81 (which broke the Protracker 3 player)


3.0 (2021-08-14)
----------------

Initial release of JSSpeccy 3.

* Web Worker and WebAssembly emulation core
* 48K, 128K, Pentagon emulaton
* Accurate multicolour
* AY and beeper audio
* TAP, TZX, Z80, SNA, SZX, ZIP loading
* Fullscreen mode
* Browsing games from Internet Archive
