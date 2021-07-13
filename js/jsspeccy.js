class CanvasRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = this.canvas.getContext('2d');
        this.imageData = this.ctx.getImageData(32, 24, 256, 192);
        this.pixels = new Uint32Array(this.imageData.data.buffer);

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
        while (bufferPtr < 0x3000) {
            const attr = frameBytes[bufferPtr++];
            let bitmap = frameBytes[bufferPtr++];
            const ink = this.palette[((attr & 0x40) >> 3) | (attr & 0x07)];
            const paper = this.palette[(attr & 0x78) >> 3];
            for (let i = 0; i < 8; i++) {
                this.pixels[pixelPtr++] = (bitmap & 0x80) ? ink : paper;
                bitmap <<= 1;
            }
        }
        this.ctx.putImageData(this.imageData, 32, 24);
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
        new ArrayBuffer(0x3000),
        new ArrayBuffer(0x3000),
        new ArrayBuffer(0x3000),
    ];
    let bufferBeingShown = null;
    let bufferAwaitingShow = null;
    let lockedBuffer = null;

    let isRunningFrame = false;
    let nextFrameTime = performance.now();

    const worker = new Worker('worker.js');

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
                window.requestAnimationFrame(runAnimationFrame);
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

    benchmarkElement = document.getElementById('benchmark');
    setInterval(() => {
        benchmarkElement.innerText = (
            "Running at " + benchmarkRunCount + "fps, rendering at "
            + benchmarkRenderCount + "fps"
        );
        benchmarkRunCount = 0;
        benchmarkRenderCount = 0;
    }, 1000)
};
