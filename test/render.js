import { exit } from 'process';

import { CanvasRenderer } from '../runtime/render.js';
import { FRAME_BUFFER_SIZE, MODE_LOG_OFFSET } from '../runtime/constants.js';

const screenLine = (n) => 0x0f00 + n * 0x60 + 0x10;

let failureCount = 0;
function check(testName, label, actual, expected) {
    if (actual !== expected) {
        failureCount++;
        console.log(
            `FAIL ${testName} / ${label}: expected 0x${(expected >>> 0).toString(16)}, `
            + `got 0x${(actual >>> 0).toString(16)}`
        );
    }
}

/* Minimal stand-in for an HTMLCanvasElement - CanvasRenderer only needs
   getContext, getImageData, putImageData, width/height and style. */
function makeStubCanvas() {
    return {
        width: 0,
        height: 0,
        style: {},
        getContext() {
            return {
                getImageData(x, y, w, h) {
                    return { data: new Uint8ClampedArray(w * h * 4) };
                },
                putImageData() {},
            };
        },
    };
}

function makeFrameBuffer({ mode, borderColour }) {
    const buffer = new ArrayBuffer(FRAME_BUFFER_SIZE);
    const bytes = new Uint8Array(buffer);
    bytes.fill(borderColour, 0, MODE_LOG_OFFSET);
    // one mode-log record covering the whole frame, then the terminator
    bytes[MODE_LOG_OFFSET] = 0x00;
    bytes[MODE_LOG_OFFSET + 1] = 0x00;
    bytes[MODE_LOG_OFFSET + 2] = mode;
    bytes[MODE_LOG_OFFSET + 3] = 0x00;
    bytes[MODE_LOG_OFFSET + 4] = 0xff;
    bytes[MODE_LOG_OFFSET + 5] = 0xff;
    return { buffer, bytes };
}

/* Pixel index of the first main-screen pixel on line `n` of a 640-wide frame:
   24 border rows of 640, then n rows of 640, then the 64px left border. */
const timexScreenPixel = (n) => (24 + n) * 640 + 64;

function testTimexGeometry() {
    const name = 'Timex geometry';
    const renderer = new CanvasRenderer(makeStubCanvas());
    renderer.setVideoMode(true);
    check(name, 'canvas width', renderer.canvas.width, 640);
    check(name, 'canvas height', renderer.canvas.height, 240);
    check(name, 'pixel count', renderer.pixels.length, 640 * 240);

    const { buffer } = makeFrameBuffer({ mode: 0x00, borderColour: 5 });
    renderer.showFrame(buffer);

    /* If the loops over-ran or under-filled, the final pixel would never be
       written and would still be 0. */
    const border = renderer.palette[5];
    check(name, 'first pixel', renderer.pixels[0], border);
    check(name, 'last pixel', renderer.pixels[640 * 240 - 1], border);
}

function testStandardGeometryUnchanged() {
    const name = 'Standard geometry';
    const renderer = new CanvasRenderer(makeStubCanvas());
    check(name, 'canvas width', renderer.canvas.width, 320);
    check(name, 'pixel count', renderer.pixels.length, 320 * 240);

    const { buffer } = makeFrameBuffer({ mode: 0x00, borderColour: 3 });
    renderer.showFrame(buffer);
    const border = renderer.palette[3];
    check(name, 'first pixel', renderer.pixels[0], border);
    check(name, 'last pixel', renderer.pixels[320 * 240 - 1], border);
}

function testHiResDecoding() {
    const name = 'Hi-res decode';
    const renderer = new CanvasRenderer(makeStubCanvas());
    renderer.setVideoMode(true);

    // mode 6 with hi-res colour 0 -> paper black (8), ink white (8 ^ 7 = 15)
    const { buffer, bytes } = makeFrameBuffer({ mode: 0x06, borderColour: 0 });
    const p = screenLine(0);
    bytes[p] = 0b10000000;
    bytes[p + 1] = 0b00000001;
    bytes[p + 2] = 0x00;
    bytes[p + 3] = 0xff;
    renderer.showFrame(buffer);

    const ink = renderer.palette[15];
    const paper = renderer.palette[8];
    const base = timexScreenPixel(0);

    // byte 0 bit 7 set -> single ink pixel, no doubling in hi-res
    check(name, 'px 0', renderer.pixels[base], ink);
    check(name, 'px 1', renderer.pixels[base + 1], paper);
    // byte 1 bit 0 set -> pixel 15
    check(name, 'px 14', renderer.pixels[base + 14], paper);
    check(name, 'px 15', renderer.pixels[base + 15], ink);
    // byte 2 all clear, byte 3 all set
    check(name, 'px 16', renderer.pixels[base + 16], paper);
    check(name, 'px 24', renderer.pixels[base + 24], ink);
    check(name, 'px 31', renderer.pixels[base + 31], ink);
}

function testHiResColourSelect() {
    const name = 'Hi-res colour select';
    const renderer = new CanvasRenderer(makeStubCanvas());
    renderer.setVideoMode(true);

    // hi-res colour 2 -> paper = bright colour 2, ink = bright colour 5
    const { buffer, bytes } = makeFrameBuffer({ mode: 0x06 | (2 << 3), borderColour: 0 });
    const p = screenLine(0);
    bytes[p] = 0b10000000;
    renderer.showFrame(buffer);

    const base = timexScreenPixel(0);
    check(name, 'ink', renderer.pixels[base], renderer.palette[8 + 5]);
    check(name, 'paper', renderer.pixels[base + 1], renderer.palette[8 + 2]);
}

function testHiColourDecodesAsPairs() {
    const name = 'Hi-colour decode';
    const renderer = new CanvasRenderer(makeStubCanvas());
    renderer.setVideoMode(true);

    const { buffer, bytes } = makeFrameBuffer({ mode: 0x02, borderColour: 0 });
    const p = screenLine(0);
    bytes[p] = 0b10000000;
    bytes[p + 1] = 0x07;        // ink 7 (white), paper 0 (black), no bright
    renderer.showFrame(buffer);

    const base = timexScreenPixel(0);
    // standard-width pixels are doubled in the 640 backing store
    check(name, 'px 0', renderer.pixels[base], renderer.palette[7]);
    check(name, 'px 1', renderer.pixels[base + 1], renderer.palette[7]);
    check(name, 'px 2', renderer.pixels[base + 2], renderer.palette[0]);
}

function testMidFrameModeChange() {
    const name = 'Renderer mid-frame change';
    const renderer = new CanvasRenderer(makeStubCanvas());
    renderer.setVideoMode(true);

    const { buffer, bytes } = makeFrameBuffer({ mode: 0x02, borderColour: 0 });
    // switch to hi-res at the start of screen line 100
    const changeAt = screenLine(100);
    bytes[MODE_LOG_OFFSET + 4] = changeAt & 0xff;
    bytes[MODE_LOG_OFFSET + 5] = (changeAt >> 8) & 0xff;
    bytes[MODE_LOG_OFFSET + 6] = 0x06;
    bytes[MODE_LOG_OFFSET + 7] = 0x00;
    bytes[MODE_LOG_OFFSET + 8] = 0xff;
    bytes[MODE_LOG_OFFSET + 9] = 0xff;

    // line 0 in hi-colour: bitmap 0x80, attribute white ink
    const p0 = screenLine(0);
    bytes[p0] = 0b10000000;
    bytes[p0 + 1] = 0x07;
    // line 100 in hi-res: bitmap 0x80
    const p100 = screenLine(100);
    bytes[p100] = 0b10000000;

    renderer.showFrame(buffer);

    // before the change: doubled pixels from the attribute
    const b0 = timexScreenPixel(0);
    check(name, 'line 0 px 0', renderer.pixels[b0], renderer.palette[7]);
    check(name, 'line 0 px 1', renderer.pixels[b0 + 1], renderer.palette[7]);
    // after the change: single-width hi-res pixels, bright palette
    const b100 = timexScreenPixel(100);
    check(name, 'line 100 px 0', renderer.pixels[b100], renderer.palette[15]);
    check(name, 'line 100 px 1', renderer.pixels[b100 + 1], renderer.palette[8]);
}

function testTimexStandardModeMatches48KDoubled() {
    /* The strongest invariant available: in a standard (non-hi-res) mode the
       Timex renderer must produce exactly the 320-wide output with every pixel
       written twice. Any drift in border widths, group counts or cell decoding
       shows up here. */
    const name = 'Timex standard == 48K doubled';

    const standard = new CanvasRenderer(makeStubCanvas());
    const timex = new CanvasRenderer(makeStubCanvas());
    timex.setVideoMode(true);

    const build = () => {
        const { buffer, bytes } = makeFrameBuffer({ mode: 0x00, borderColour: 2 });
        // deterministic pseudo-random screen content
        let seed = 12345;
        for (let i = 0; i < MODE_LOG_OFFSET; i++) {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            bytes[i] = (seed >> 16) & 0xff;
        }
        // border bytes must stay in palette range 0..7
        const borderRun = (start, count) => {
            for (let i = 0; i < count; i++) bytes[start + i] &= 0x07;
        };
        borderRun(0, 24 * 160);
        for (let y = 0; y < 192; y++) {
            borderRun(0x0f00 + y * 0x60, 16);
            borderRun(0x0f00 + y * 0x60 + 0x50, 16);
        }
        borderRun(0x5700, 24 * 160);
        // rewrite the mode log, which the noise fill clobbered
        bytes[MODE_LOG_OFFSET] = 0x00;
        bytes[MODE_LOG_OFFSET + 1] = 0x00;
        bytes[MODE_LOG_OFFSET + 2] = 0x00;
        bytes[MODE_LOG_OFFSET + 3] = 0x00;
        bytes[MODE_LOG_OFFSET + 4] = 0xff;
        bytes[MODE_LOG_OFFSET + 5] = 0xff;
        return buffer;
    };

    // identical flash phase so FLASH cells decode the same way
    standard.flashPhase = 0;
    timex.flashPhase = 0;
    standard.showFrame(build());
    timex.showFrame(build());

    let mismatches = 0;
    let firstMismatch = null;
    for (let y = 0; y < 240 && mismatches === 0; y++) {
        for (let x = 0; x < 320; x++) {
            const expected = standard.pixels[y * 320 + x];
            const a = timex.pixels[y * 640 + x * 2];
            const b = timex.pixels[y * 640 + x * 2 + 1];
            if (a !== expected || b !== expected) {
                mismatches++;
                firstMismatch = { x, y };
                break;
            }
        }
    }
    if (mismatches) {
        failureCount++;
        console.log(
            `FAIL ${name}: first mismatch at x=${firstMismatch.x} y=${firstMismatch.y}`
        );
    }
}

testTimexGeometry();
testTimexStandardModeMatches48KDoubled();
testStandardGeometryUnchanged();
testHiResDecoding();
testHiResColourSelect();
testHiColourDecodesAsPairs();
testMidFrameModeChange();

if (failureCount) {
    console.log(`${failureCount} renderer test failure(s)`);
    exit(1);
}
console.log('Renderer tests passed');
