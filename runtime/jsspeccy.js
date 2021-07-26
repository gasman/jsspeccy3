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
        this.imageData = this.ctx.getImageData(0, 0, 320, 240);
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
        this.ctx.putImageData(this.imageData, 0, 0);
        this.flashPhase = (this.flashPhase + 1) & 0x1f;
    }
}


class MenuBar {
    constructor(container) {
        this.elem = document.createElement('div');
        this.elem.style.display = 'flow-root';
        this.elem.style.backgroundColor = '#eee';
        this.elem.style.fontFamily = 'Arial, Helvetica, sans-serif';
        container.appendChild(this.elem);
    }

    addMenu(title) {
        return new Menu(this.elem, title);
    }
}

class Menu {
    constructor(container, title) {
        const elem = document.createElement('div');
        elem.style.float = 'left';
        elem.style.position = 'relative';
        container.appendChild(elem);

        const button = document.createElement('button');
        button.style.margin = '2px';
        button.innerText = title;
        elem.appendChild(button);

        this.list = document.createElement('ul');
        this.list.style.position = 'absolute';
        this.list.style.width = '150px';
        this.list.style.backgroundColor = '#eee';
        this.list.style.listStyleType = 'none';
        this.list.style.margin = '0';
        this.list.style.padding = '0';
        this.list.style.border = '1px solid #888';
        this.list.style.display = 'none';
        elem.appendChild(this.list);

        button.addEventListener('click', () => {
            if (this.isOpen()) {
                this.close();
            } else {
                this.open();
            }
        })
        document.addEventListener('click', (e) => {
            if (e.target != button && this.isOpen()) this.close();
        })
    }

    isOpen() {
        return this.list.style.display == 'block';
    }

    open() {
        this.list.style.display = 'block';
    }

    close() {
        this.list.style.display = 'none';
    }

    addItem(title, onClick) {
        const li = document.createElement('li');
        this.list.appendChild(li);
        const button = document.createElement('button');
        button.innerText = title;
        button.style.width = '100%';
        button.style.textAlign = 'left';
        button.style.borderWidth = '0';
        button.style.paddingTop = '4px';
        button.style.paddingBottom = '4px';

        // eww.
        button.addEventListener('mouseover', () => {
            button.style.backgroundColor = '#ddd';
        });
        button.addEventListener('mouseout', () => {
            button.style.backgroundColor = 'inherit';
        });
        if (onClick) {
            button.addEventListener('click', onClick);
        }
        li.appendChild(button);
        return {
            setCheckbox: () => {
                button.innerText = String.fromCharCode(0x2022) + ' ' + title;
            },
            unsetCheckbox: () => {
                button.innerText = title;
            }
        }
    }
}


window.JSSpeccy = (container, opts) => {
    // let benchmarkRunCount = 0;
    // let benchmarkRenderCount = 0;
    opts = opts || {};

    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;

    const worker = new Worker('jsspeccy-worker.js');

    let onSetMachine = null;

    if (opts.ui) {
        const innerContainer = document.createElement('div');
        container.appendChild(innerContainer);
        innerContainer.style.width = '320px';

        const menuBar = new MenuBar(innerContainer);
        const fileMenu = menuBar.addMenu('File');
        fileMenu.addItem('Open...');
        const machineMenu = menuBar.addMenu('Machine');
        const machine48Item = machineMenu.addItem('Spectrum 48K', () => {
            setMachine(48);
        });
        const machine128Item = machineMenu.addItem('Spectrum 128K', () => {
            setMachine(128);
        });

        onSetMachine = (type) => {
            if (type == 48) {
                machine48Item.setCheckbox();
                machine128Item.unsetCheckbox();
            } else {
                machine48Item.unsetCheckbox();
                machine128Item.setCheckbox();
            }
        }

        innerContainer.appendChild(canvas);
    } else {
        container.appendChild(canvas);
    }

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

    const getBufferToLock = () => {
        for (let i = 0; i < 3; i++) {
            if (i !== bufferBeingShown && i !== bufferAwaitingShow) {
                return i;
            }
        }
    }

    const setMachine = (type) => {
        if (type != 128) type = 48;
        worker.postMessage({
            message: 'setMachineType',
            type,
        });
        if (onSetMachine) onSetMachine(type);
    }

    worker.onmessage = function(e) {
        switch(e.data.message) {
            case 'ready':
                loadRoms().then(() => {
                    setMachine(opts.machine || 128);
                    initKeyboard();
                    window.requestAnimationFrame(runAnimationFrame);
                })
                break;
            case 'frameCompleted':
                // benchmarkRunCount++;
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
        });
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
            // benchmarkRenderCount++;
        }
        if (time > nextFrameTime && !isRunningFrame) {
            runFrame();
            nextFrameTime += msPerFrame;
        }
        window.requestAnimationFrame(runAnimationFrame);
    };

    /*
        const benchmarkElement = document.getElementById('benchmark');
        setInterval(() => {
            benchmarkElement.innerText = (
                "Running at " + benchmarkRunCount + "fps, rendering at "
                + benchmarkRenderCount + "fps"
            );
            benchmarkRunCount = 0;
            benchmarkRenderCount = 0;
        }, 1000)
    */
};
