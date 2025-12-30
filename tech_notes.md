JSSpeccy 3 Tech Notes
=====================

Architecture
------------

The browser UI thread (starting point in runtime/jsspeccy.js) is kept as lightweight as possible, only performing tasks that are directly related to communication with the "outside world": rendering the screen data to a canvas, handling keyboard events, outputting audio and managing UI actions such as loading files.

All the actual emulation happens inside a Web Worker (runtime/worker.js), with all communcation between the UI thread and the worker happening through `postMessage`. The most important messages are `runFrame` (sent from the UI thread to the worker, to tell it to run one frame of emulation and fill the passed video and audio buffers with the resulting output) and `frameCompleted` (sent from the worker to the UI thread when execution of the frame is complete, passing the filled video and audio buffers back).

Within the Web Worker, all of the performance-critical work is handled by a WebAssembly module (jsspeccy-core.wasm). The main entry point into this is the `runFrame` function, which runs the Z80 and all related 'continuous' processes (memory reads / writes, responding to port reads / writes, building the screen and generating audio) for one video frame. `runFrame` returns a status of 1 to indicate that the frame has completed execution (and thus the video / audio buffers are ready to send back to the UI thread), with other status values serving as 'exceptions', indicating that execution was interrupted and needs action from the calling code before it can be continued (by calling `resumeFrame`). At the time of writing, the only kind of exception implemented is a tape loading trap.

All state required for the WebAssembly core module to run - including memory contents (ROM and RAM), registers, audio / video buffers and lookup tables - is contained within the module's own memory map, and statically allocated at compile time.

On the real machine, generating video and audio output happens in parallel with the Z80's execution - an emulator implementing this naïvely would have to break out of the Z80 loop every few cycles to perform these tasks. In fact, these processes can be deferred for as long as we like, as long as we catch up on them before any state changes occur that would affect the output. With this in mind, the JSSpeccy core implements two functions `updateFramebuffer` and `updateAudioBuffer` which perform all pending video / audio generation as far as the current Z80 cycle. These are called immediately before any state change (which means, for audio, a write to any AY register or the beeper port; and for video, a write to video memory, change of border colour or a write to the memory paging port).


Building the core
-----------------

To build jsspeccy-core.wasm, we run the script generator/gencore.js, which runs a preprocessing pass over the input file generator/core.ts.in, to generate the [AssemblyScript](https://www.assemblyscript.org/) source file build/core.ts. This is then passed to the AssemblyScript compiler to produce the final dist/jsspeccy-core.wasm module.

The preprocessor step serves two purposes: firstly, it allows us to programmatically build the large repetitive `switch` statements that form the Z80 core. Secondly, it allows us to use conventional array syntax to access our statically-defined arrays. Currently, AssemblyScript does not appear to have any native support for static arrays - any use of array syntax causes it to immediately pull in a `malloc` implementation and a higher-level array construct with bounds checking, all of which is unwanted overhead for our purposes. The gencore.js processor rewrites array syntax into direct memory access [`load` / `store` instructions](https://www.assemblyscript.org/stdlib/builtins.html#memory).

All statically-defined arrays are allocated at the start of the module's memory map, from address 0 onward. Currently a 512Kb block is allocated for these - if you need more, increase `memoryBase` in asconfig.json.

The gencore.js preprocessor recognises the following directives:

* `#alloc` - allocates an array of the given size and type. For example, if `#alloc frameBuffer[0x6600]: u8` is the first line of the file, then 0x6600 bytes from address 0 will be allocated to an array named `frameBuffer`. This will then rewrite subsequent lines as follows:
  * An assignment such as `frameBuffer = [0x00, 0x01, 0x02];` will be rewritten as a sequence of `store<u8>(0, 0x00);`, `store<u8>(1, 0x01);` lines
  * An assignment such as `frameBuffer[ptr] = 0x00;` will be rewritten as `store<u8>(0 + ptr, 0x00);`
  * A lookup such as `val = frameBuffer[ptr];` will be rewritten as `val = load<u8>(0 + ptr);`
  * `(&frameBuffer)` will be replaced with the array's base address, e.g. `const FRAME_BUFFER = (&frameBuffer);` becomes `const FRAME_BUFFER = 0;`
  * Keep in mind that these are simple regexp replacements, not a full parser - it's likely to fail on statements that are split over multiple lines, or have nested brackets. If you don't like this, feel free to submit a better implementation of static arrays to the AssemblyScript project :-)
* `#const` - defines an identifier to be replaced by the given expression. For example, given a directive `#const FLAG_C 0x01`, a subsequent line `result &= FLAG_C;` will be rewritten to `result &= 0x01;`. `const FLAG_C = 0x01;` would achieve the same thing, but will also define a symbol in the resulting module, which we probably don't want.
* `#regpair` - allocates two bytes to store a Z80 register pair. This is always little-endian, as per the WebAssembly spec. For example, if the next memory address to be allocated is 0x1000, then `#regpair BC B C` will define identifiers `BC`, `B` and `C` such that:
  * `val = BC;` is rewritten to `val = load<u16>(0x1000);`
  * `BC = 0x1234;` is rewritten to `store<u16>(0x1000, 0x1234);`
  * `val = B;` is rewritten to `val = load<u8>(0x1001);`
  * `B = result;` is rewritten to `store<u8>(0x1001, result);`
  * `val = C;` is rewritten to `val = load<u8>(0x1000);`
  * `C = result;` is rewritten to `store<u8>(0x1000, result);`
* `#optable` - generates the sequence of `case` statements that decode an opcode byte. The subroutine bodies for each class of instruction are defined in generator/instructions.js, and these are pattern-matched to the actual instruction lists in generator/opcodes_*.txt.


Frame buffer format
-------------------

The frame buffer data structure (as written by the WebAssembly core and passed to the UI thread in the `frameCompleted` message) is essentially a log of all border, screen pixel, and paper & ink colours in the order that they would be read to build the video output. This is based on a 320x240 output image consisting of 24 lines of upper border, 192 lines of main screen (each consisting of 32px left border, 256px main screen, and 32px right border), and 24 lines of lower border.

Colours (ink, paper, border) are each specified as a single byte in GRB8 format: 

   Bits
   76543210
   GggRrrBb

The blue component is further decoded to a 3-bit value as follows: `b3 = (b2 << 1) | (b2 == 0 ? 0 : 1)`. (Then each 3-bit colour component value may be scaled to 8 bits to generate a standard 24/32-bit RGB value.) The GRB8 format is the same as the colour format used in ULAplus palette entries, (not by accident).

This results in a 0x7e00 byte buffer, breaking down as follows:

* 0x0000..0x009f: line 0 of the upper border. 160 bytes, each one being a border colour (0..7) and contributing two pixels to the final image. (This corresponds to the maximum resolution at which border colour changes happen on the Pentagon; these take effect on every cycle, and one cycle equals two pixels.)
* 0x00a0..0x013f: line 1 of the upper border
* ...
* 0x0e60..0x0eff: line 23 of the upper border
* 0x0f00..0x0f0f: left border of main screen line 0. 16 bytes, each contributing two pixels of border as before
* 0x0f10..0x0f6f: main screen line 0. 32*3 bytes, consisting of < pixel-byte, paper-grb8, ink-grb8 >, for each of the 32 character cells
* 0x0f70..0x0f7f: right border of main screen line 0. 16 bytes, each contributing two pixels of border as before
* 0x0f80..0x0f8f: left border of main screen line 1
* 0x0f90..0x0fef: main screen line 1. (Again, since the data here is in the order that the video output would be generated, this is the data pulled from address 0x4100 onward, not 0x4020.)
* 0x0ff0..0x0fff: right border of main screen line 1
* ...
* 0x6e80..0x6e8f: left border of main screen line 191
* 0x6e90..0x6eef: main screen line 191
* 0x6ef0..0x6eff: right border of main screen line 191
* 0x6f00..0x6f9f: line 0 of the lower border. 160 bytes, as per upper border
* 0x6fa0..0x703f: line 1 of the lower border
* ...
* 0x7d60..0x7dff: line 23 of the lower border
