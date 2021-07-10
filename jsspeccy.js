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

    renderFrame(frameBuffer) {
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
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    container.appendChild(canvas);
    const renderer = new CanvasRenderer(canvas);

    const frameBuffer = new ArrayBuffer(0x3000);
    const worker = new Worker('worker.js');

    worker.onmessage = function(e) {
        switch(e.data.message) {
            case 'frameCompleted':
                renderer.renderFrame(e.data.frameBuffer);
                break;
            default:
                console.log('message received by host:', e.data);
        }
    }

    worker.postMessage({
        'message': 'runFrame',
        'frameBuffer': frameBuffer,
    }, [frameBuffer]);
};
