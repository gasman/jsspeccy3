import { FRAME_BUFFER_SIZE, MODE_LOG_OFFSET } from './constants.js';


export class CanvasRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = this.canvas.getContext('2d');
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

        this.setVideoMode(false);
    }

    setVideoMode(isTimex) {
        /* Timex hi-res is 512 pixels across, so Timex machines get a 640-wide
        backing store and every non-hi-res pixel is written twice.

        That makes the backing store 8:3 while the display box stays 4:3, i.e.
        the pixels are deliberately non-square. `object-fit: fill` is therefore
        the correct mapping - `contain` would preserve the 8:3 intrinsic ratio
        and letterbox the picture. For a 320x240 backing store the two are
        equivalent, so this is safe for non-Timex machines too, and the display
        box is kept at 4:3 by ui.js. */
        this.isTimex = isTimex;
        this.width = isTimex ? 640 : 320;
        this.canvas.width = this.width;
        this.canvas.height = 240;
        this.canvas.style.objectFit = 'fill';
        this.imageData = this.ctx.getImageData(0, 0, this.width, 240);
        this.pixels = new Uint32Array(this.imageData.data.buffer);
    }

    showFrame(frameBuffer) {
        const frameBytes = new Uint8Array(frameBuffer);
        if (this.isTimex) {
            this.showFrameTimex(frameBytes);
        } else {
            this.showFrameStandard(frameBytes);
        }
        this.ctx.putImageData(this.imageData, 0, 0);
        this.flashPhase = (this.flashPhase + 1) & 0x1f;
    }

    showFrameStandard(frameBytes) {
        let pixelPtr = 0;
        let bufferPtr = 0;
        /* top border */
        for (let y = 0; y < 24; y++) {
            for (let x = 0; x < 160; x++) {
                let border = this.palette[frameBytes[bufferPtr++]]
                this.pixels[pixelPtr++] = border;
                this.pixels[pixelPtr++] = border;
            }
        }

        for (let y = 0; y < 192; y++) {
            /* left border */
            for (let x = 0; x < 16; x++) {
                let border = this.palette[frameBytes[bufferPtr++]]
                this.pixels[pixelPtr++] = border;
                this.pixels[pixelPtr++] = border;
            }
            /* main screen */
            for (let x = 0; x < 32; x++) {
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
            /* right border */
            for (let x = 0; x < 16; x++) {
                let border = this.palette[frameBytes[bufferPtr++]]
                this.pixels[pixelPtr++] = border;
                this.pixels[pixelPtr++] = border;
            }
        }
        /* bottom border */
        for (let y = 0; y < 24; y++) {
            for (let x = 0; x < 160; x++) {
                let border = this.palette[frameBytes[bufferPtr++]]
                this.pixels[pixelPtr++] = border;
                this.pixels[pixelPtr++] = border;
            }
        }
    }

    showFrameTimex(frameBytes) {
        /* 640x240 output: left border 16*4, main screen 16 groups of 32,
        right border 16*4. Each group of 4 fetched bytes covers 16 standard
        pixels (doubled to 32) or 32 hi-res pixels. */
        let pixelPtr = 0;
        let bufferPtr = 0;

        let logPtr = MODE_LOG_OFFSET;
        let mode = 0;
        let nextChangeAt = 0;

        const readNextChangeIndex = () => {
            const index = frameBytes[logPtr] | (frameBytes[logPtr + 1] << 8);
            nextChangeAt = (index === 0xffff) ? Infinity : index;
        };

        /* Both pointers increase monotonically, so this visits each log entry
        exactly once across the whole frame. */
        const syncMode = () => {
            while (bufferPtr >= nextChangeAt) {
                mode = frameBytes[logPtr + 2];
                logPtr += 4;
                readNextChangeIndex();
            }
        };

        readNextChangeIndex();
        syncMode();

        const drawBorderRun = (count) => {
            for (let x = 0; x < count; x++) {
                const border = this.palette[frameBytes[bufferPtr++]];
                this.pixels[pixelPtr++] = border;
                this.pixels[pixelPtr++] = border;
                this.pixels[pixelPtr++] = border;
                this.pixels[pixelPtr++] = border;
            }
        };

        /* top border */
        for (let y = 0; y < 24; y++) drawBorderRun(160);

        for (let y = 0; y < 192; y++) {
            drawBorderRun(16);

            for (let group = 0; group < 16; group++) {
                syncMode();
                if (mode & 0x04) {
                    /* hi-res 512x192 mono: 4 bitmap bytes, one bit per pixel.
                    Ink and paper come from bits 3-5 of the SCLD register. */
                    const hiresColour = (mode >> 3) & 0x07;
                    const paper = this.palette[8 + hiresColour];
                    const ink = this.palette[8 + (hiresColour ^ 0x07)];
                    for (let b = 0; b < 4; b++) {
                        let bitmap = frameBytes[bufferPtr++];
                        for (let i = 0; i < 8; i++) {
                            this.pixels[pixelPtr++] = (bitmap & 0x80) ? ink : paper;
                            bitmap <<= 1;
                        }
                    }
                } else {
                    /* standard, DF1 and hi-colour all arrive as bitmap/attr
                    pairs, so they decode identically here - hi-colour differs
                    only in which address the core fetched the attribute from */
                    for (let cell = 0; cell < 2; cell++) {
                        let bitmap = frameBytes[bufferPtr++];
                        const attr = frameBytes[bufferPtr++];
                        let ink, paper;
                        if ((attr & 0x80) && (this.flashPhase & 0x10)) {
                            paper = this.palette[((attr & 0x40) >> 3) | (attr & 0x07)];
                            ink = this.palette[(attr & 0x78) >> 3];
                        } else {
                            ink = this.palette[((attr & 0x40) >> 3) | (attr & 0x07)];
                            paper = this.palette[(attr & 0x78) >> 3];
                        }
                        for (let i = 0; i < 8; i++) {
                            const colour = (bitmap & 0x80) ? ink : paper;
                            this.pixels[pixelPtr++] = colour;
                            this.pixels[pixelPtr++] = colour;
                            bitmap <<= 1;
                        }
                    }
                }
            }

            drawBorderRun(16);
        }

        /* bottom border */
        for (let y = 0; y < 24; y++) drawBorderRun(160);
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

    setVideoMode(isTimex) {
        this.renderer.setVideoMode(isTimex);
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
