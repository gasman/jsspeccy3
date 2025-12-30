import { FRAME_BUFFER_SIZE } from './constants.js';


export class CanvasRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = this.canvas.getContext('2d');
        this.imageData = this.ctx.getImageData(0, 0, 320, 240);
        this.pixels = new Uint32Array(this.imageData.data.buffer);

        const testUint8 = new Uint8Array(new Uint16Array([0x8000]).buffer);
        this.isLittleEndian = (testUint8[0] === 0);
    }

    showFrame(frameBuffer) {
        const frameBytes = new Uint8Array(frameBuffer);
        let pixelPtr = 0;
        let bufferPtr = 0;
        /* top border */
        for (let y = 0; y < 24; y++) {
            for (let x = 0; x < 160; x++) {
                let border = this.rgbaFromGrb8(frameBytes[bufferPtr++])
                this.pixels[pixelPtr++] = border;
                this.pixels[pixelPtr++] = border;
            }
        }

        for (let y = 0; y < 192; y++) {
            /* left border */
            for (let x = 0; x < 16; x++) {
                let border = this.rgbaFromGrb8(frameBytes[bufferPtr++])
                this.pixels[pixelPtr++] = border;
                this.pixels[pixelPtr++] = border;
            }
            /* main screen */
            for (let x = 0; x < 32; x++) {
                let bitmap = frameBytes[bufferPtr++];
                const paper8 = frameBytes[bufferPtr++];
                const ink8 = frameBytes[bufferPtr++];
                const paper = this.rgbaFromGrb8(paper8)
                const ink = this.rgbaFromGrb8(ink8)
                for (let i = 0; i < 8; i++) {
                    this.pixels[pixelPtr++] = (bitmap & 0x80) ? ink : paper;
                    bitmap <<= 1;
                }
            }
            /* right border */
            for (let x = 0; x < 16; x++) {
                let border = this.rgbaFromGrb8(frameBytes[bufferPtr++])
                this.pixels[pixelPtr++] = border;
                this.pixels[pixelPtr++] = border;
            }
        }
        /* bottom border */
        for (let y = 0; y < 24; y++) {
            for (let x = 0; x < 160; x++) {
                let border = this.rgbaFromGrb8(frameBytes[bufferPtr++])
                this.pixels[pixelPtr++] = border;
                this.pixels[pixelPtr++] = border;
            }
        }
        this.ctx.putImageData(this.imageData, 0, 0);
        this.flashPhase = (this.flashPhase + 1) & 0x1f;
    }

    rgbaFromGrb8(grb8) {
        const g3 = (grb8 >> 5) & 7;
        const r3 = (grb8 >> 2) & 7;
        const b2 = (grb8 >> 0) & 3;
        const b3 = (b2 << 1) + (b2 === 0 ? 0 : 1)

        if (this.isLittleEndian) {
            // That last bit of integer maths ("+ 0xff000000") is to avoid signed-32-bit arithmetic
            // in JavaScript bit operations. (It puts the 0xff in the high 8 bits, for the alpha channel.)
            return (
                (((b3 << 21) | (b3 << 18) | (b3 << 15)) & 0xff0000) |
                (((g3 << 13) | (g3 << 10) | (g3 << 7)) & 0x00ff00) |
                (((r3 << 5) | (r3 << 2) | (r3 >>> 1)) & 0x0000ff)) +
                0xff000000;
        } else {
            // That last bit of integer maths ("* 256 + 255") is to avoid signed-32-bit arithmetic
            // in JavaScript bit operations. (It puts the 0xff in the low 8 bits, for the alpha channel.)
            return (
                (((r3 << 21) | (r3 << 18) | (r3 << 15)) & 0xff0000) |
                (((g3 << 13) | (g3 << 10) | (g3 << 7)) & 0x00ff00) |
                (((b3 << 5) | (b3 << 2) | (b3 >>> 1)) & 0x0000ff)) * 256 + 255;
        }
    }
}


export class DisplayHandler {
    /*
    Handles triple-buffering so that at any given time we can have:
    - one buffer being drawn to the screen by the renderer
    - one buffer just finished being built by the worker process and waiting to be shown
      on the next animation frame
    - one buffer buffer being built by the worker process
    */
    constructor(canvas) {
        this.renderer = new CanvasRenderer(canvas);

        this.frameBuffers = [
            new ArrayBuffer(FRAME_BUFFER_SIZE),
            new ArrayBuffer(FRAME_BUFFER_SIZE),
            new ArrayBuffer(FRAME_BUFFER_SIZE),
        ];
        this.bufferBeingShown = null;
        this.bufferAwaitingShow = null;
        this.lockedBuffer = null;
    }

    frameCompleted(newFrameBuffer) {
        this.frameBuffers[this.lockedBuffer] = newFrameBuffer;
        this.bufferAwaitingShow = this.lockedBuffer;
        this.lockedBuffer = null;
    }

    getNextFrameBufferIndex() {
        for (let i = 0; i < 3; i++) {
            if (i !== this.bufferBeingShown && i !== this.bufferAwaitingShow) {
                return i;
            }
        }
    }
    getNextFrameBuffer() {
        this.lockedBuffer = this.getNextFrameBufferIndex();
        return this.frameBuffers[this.lockedBuffer];
    }

    readyToShow() {
        return this.bufferAwaitingShow !== null;
    }
    show() {
        this.bufferBeingShown = this.bufferAwaitingShow;
        this.bufferAwaitingShow = null;
        this.renderer.showFrame(this.frameBuffers[this.bufferBeingShown]);
        this.bufferBeingShown = null;
    }
}
