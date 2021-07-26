import { FRAME_BUFFER_SIZE } from './constants.js';

const KEY_CODES = {
    49: {row: 3, mask: 0x01}, /* 1 */
    50: {row: 3, mask: 0x02}, /* 2 */
    51: {row: 3, mask: 0x04}, /* 3 */
    52: {row: 3, mask: 0x08}, /* 4 */
    53: {row: 3, mask: 0x10}, /* 5 */
    54: {row: 4, mask: 0x10}, /* 6 */
    55: {row: 4, mask: 0x08}, /* 7 */
    56: {row: 4, mask: 0x04}, /* 8 */
    57: {row: 4, mask: 0x02}, /* 9 */
    48: {row: 4, mask: 0x01}, /* 0 */

    81: {row: 2, mask: 0x01}, /* Q */
    87: {row: 2, mask: 0x02}, /* W */
    69: {row: 2, mask: 0x04}, /* E */
    82: {row: 2, mask: 0x08}, /* R */
    84: {row: 2, mask: 0x10}, /* T */
    89: {row: 5, mask: 0x10}, /* Y */
    85: {row: 5, mask: 0x08}, /* U */
    73: {row: 5, mask: 0x04}, /* I */
    79: {row: 5, mask: 0x02}, /* O */
    80: {row: 5, mask: 0x01}, /* P */

    65: {row: 1, mask: 0x01}, /* A */
    83: {row: 1, mask: 0x02}, /* S */
    68: {row: 1, mask: 0x04}, /* D */
    70: {row: 1, mask: 0x08}, /* F */
    71: {row: 1, mask: 0x10}, /* G */
    72: {row: 6, mask: 0x10}, /* H */
    74: {row: 6, mask: 0x08}, /* J */
    75: {row: 6, mask: 0x04}, /* K */
    76: {row: 6, mask: 0x02}, /* L */
    13: {row: 6, mask: 0x01}, /* enter */

    16: {row: 0, mask: 0x01}, /* caps */
    192: {row: 0, mask: 0x01}, /* backtick as caps - because firefox screws up a load of key codes when pressing shift */
    90: {row: 0, mask: 0x02}, /* Z */
    88: {row: 0, mask: 0x04}, /* X */
    67: {row: 0, mask: 0x08}, /* C */
    86: {row: 0, mask: 0x10}, /* V */
    66: {row: 7, mask: 0x10}, /* B */
    78: {row: 7, mask: 0x08}, /* N */
    77: {row: 7, mask: 0x04}, /* M */
    17: {row: 7, mask: 0x02}, /* sym - gah, firefox screws up ctrl+key too */
    32: {row: 7, mask: 0x01}, /* space */

    /* shifted combinations */
    8: {row: 4, mask: 0x01, caps: true}, /* backspace => caps + 0 */
    37: {row: 3, mask: 0x10, caps: true}, /* left arrow => caps + 5 */
    38: {row: 4, mask: 0x08, caps: true}, /* up arrow => caps + 7 */
    39: {row: 4, mask: 0x04, caps: true}, /* right arrow => caps + 8 */
    40: {row: 4, mask: 0x10, caps: true}, /* down arrow => caps + 6 */
};

class CanvasRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = this.canvas.getContext('2d');
        this.imageData = this.ctx.getImageData(32, 24, 256, 192);
        this.pixels = new Uint32Array(this.imageData.data.buffer);
        this.flashPhase = 0;

        this.palette = new Uint32Array([
            /* RGBA dark */
            0x000000ff,
            0x2030c0ff,
            0xc04010ff,
            0xc040c0ff,
            0x40b010ff,
            0x50c0b0ff,
            0xe0c010ff,
            0xc0c0c0ff,
            /* RGBA bright */
            0x000000ff,
            0x3040ffff,
            0xff4030ff,
            0xff70f0ff,
            0x50e010ff,
            0x50e0ffff,
            0xffe850ff,
            0xffffffff
        ]);

        const testUint8 = new Uint8Array(new Uint16Array([0x8000]).buffer);
        const isLittleEndian = (testUint8[0] === 0);
        if (isLittleEndian) {
            /* need to reverse the byte ordering of palette */
            for (let i = 0; i < 16; i++) {
                const color = this.palette[i];
                this.palette[i] = (
                    (color << 24) & 0xff000000)
                    | ((color << 8) & 0xff0000)
                    | ((color >>> 8) & 0xff00)
                    | ((color >>> 24) & 0xff
                );
            }
        }
    }

    showFrame(frameBuffer) {
        const frameBytes = new Uint8Array(frameBuffer);
        let pixelPtr = 0;
        let bufferPtr = 0;
        while (bufferPtr < FRAME_BUFFER_SIZE) {
            let bitmap = frameBytes[bufferPtr++];
            const attr = frameBytes[bufferPtr++];
            let ink, paper;
            if ((attr & 0x80) && (this.flashPhase & 0x10)) {
                // reverse ink and paper
                paper = this.palette[((attr & 0x40) >> 3) | (attr & 0x07)];
                ink = this.palette[(attr & 0x78) >> 3];
            } else {
                ink = this.palette[((attr & 0x40) >> 3) | (attr & 0x07)];
                paper = this.palette[(attr & 0x78) >> 3];
            }
            for (let i = 0; i < 8; i++) {
                this.pixels[pixelPtr++] = (bitmap & 0x80) ? ink : paper;
                bitmap <<= 1;
            }
        }
        this.ctx.putImageData(this.imageData, 32, 24);
        this.flashPhase = (this.flashPhase + 1) & 0x1f;
    }
}


window.JSSpeccy = (container) => {
    let benchmarkRunCount = 0;
    let benchmarkRenderCount = 0;

    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    container.appendChild(canvas);
    const renderer = new CanvasRenderer(canvas);

    const msPerFrame = 20;
    const frameBuffers = [
        new ArrayBuffer(FRAME_BUFFER_SIZE),
        new ArrayBuffer(FRAME_BUFFER_SIZE),
        new ArrayBuffer(FRAME_BUFFER_SIZE),
    ];
    let bufferBeingShown = null;
    let bufferAwaitingShow = null;
    let lockedBuffer = null;

    let isRunningFrame = false;
    let nextFrameTime = performance.now();

    const worker = new Worker('jsspeccy-worker.js');

    const getBufferToLock = () => {
        for (let i = 0; i < 3; i++) {
            if (i !== bufferBeingShown && i !== bufferAwaitingShow) {
                return i;
            }
        }
    }

    worker.onmessage = function(e) {
        switch(e.data.message) {
            case 'ready':
                loadRoms().then(() => {
                    initKeyboard();
                    window.requestAnimationFrame(runAnimationFrame);
                })
                break;
            case 'frameCompleted':
                benchmarkRunCount++;
                frameBuffers[lockedBuffer] = e.data.frameBuffer;
                bufferAwaitingShow = lockedBuffer;
                lockedBuffer = null;
                const time = performance.now();
                if (time > nextFrameTime) {
                    /* running at full blast - start next frame but adjust time base
                    to give it the full time allocation */
                    runFrame();
                    nextFrameTime = time + msPerFrame;
                } else {
                    isRunningFrame = false;
                }
                break;
            default:
                console.log('message received by host:', e.data);
        }
    }

    const loadRom = async (url, page) => {
        const response = await fetch(url);
        const data = new Uint8Array(await response.arrayBuffer());
        worker.postMessage({
            message: 'loadMemory',
            data,
            page: page,
        })
    }

    const loadRoms = async () => {
        await loadRom('128-0.rom', 8);
        await loadRom('128-1.rom', 9);
        await loadRom('48.rom', 10);
    }

    const initKeyboard = () => {
        document.addEventListener('keydown', (evt) => {
            const keyCode = KEY_CODES[evt.keyCode];
            if (keyCode) {
                worker.postMessage({
                    message: 'keyDown', row: keyCode.row, mask: keyCode.mask,
                })
                if (keyCode.caps) {
                    worker.postMessage({
                        message: 'keyDown', row: 0, mask: 0x01,
                    })
                }
            }
            if (!evt.metaKey) evt.preventDefault();
        });

        document.addEventListener('keyup', (evt) => {
            const keyCode = KEY_CODES[evt.keyCode];
            if (keyCode) {
                worker.postMessage({
                    message: 'keyUp', row: keyCode.row, mask: keyCode.mask,
                })
                if (keyCode.caps) {
                    worker.postMessage({
                        message: 'keyUp', row: 0, mask: 0x01,
                    })
                }
            }
            if (!evt.metaKey) evt.preventDefault();
        });
        document.addEventListener('keypress', (evt) => {
            if (!evt.metaKey) evt.preventDefault();
        });
    }

    const runFrame = () => {
        isRunningFrame = true;
        lockedBuffer = getBufferToLock();
        worker.postMessage({
            'message': 'runFrame',
            'frameBuffer': frameBuffers[lockedBuffer],
        }, [frameBuffers[lockedBuffer]]);
    }

    const runAnimationFrame = (time) => {
        if (bufferAwaitingShow !== null) {
            bufferBeingShown = bufferAwaitingShow;
            bufferAwaitingShow = null;
            renderer.showFrame(frameBuffers[bufferBeingShown]);
            bufferBeingShown = null;
            benchmarkRenderCount++;
        }
        if (time > nextFrameTime && !isRunningFrame) {
            runFrame();
            nextFrameTime += msPerFrame;
        }
        window.requestAnimationFrame(runAnimationFrame);
    };

    const benchmarkElement = document.getElementById('benchmark');
    setInterval(() => {
        benchmarkElement.innerText = (
            "Running at " + benchmarkRunCount + "fps, rendering at "
            + benchmarkRenderCount + "fps"
        );
        benchmarkRunCount = 0;
        benchmarkRenderCount = 0;
    }, 1000)
};
