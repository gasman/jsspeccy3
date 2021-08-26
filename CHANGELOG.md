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
