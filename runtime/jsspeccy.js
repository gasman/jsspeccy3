import EventEmitter from 'events';
import fileDialog from 'file-dialog';

import { FRAME_BUFFER_SIZE } from './constants.js';
import { CanvasRenderer } from './render.js';
import { MenuBar, Toolbar } from './ui.js';
import { parseSNAFile, parseZ80File } from './snapshot.js';
import { TAPFile, TZXFile } from './tape.js';

import openIcon from './icons/open.svg';
import resetIcon from './icons/reset.svg';


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

class Emulator extends EventEmitter {
    constructor(canvas, machineType) {
        super();
        this.canvas = canvas;
        this.worker = new Worker('jsspeccy-worker.js');

        this.renderer = new CanvasRenderer(canvas);

        this.msPerFrame = 20;
        this.frameBuffers = [
            new ArrayBuffer(FRAME_BUFFER_SIZE),
            new ArrayBuffer(FRAME_BUFFER_SIZE),
            new ArrayBuffer(FRAME_BUFFER_SIZE),
        ];
        this.bufferBeingShown = null;
        this.bufferAwaitingShow = null;
        this.lockedBuffer = null;

        this.isRunningFrame = false;
        this.nextFrameTime = performance.now();

        this.worker.onmessage = (e) => {
            switch(e.data.message) {
                case 'ready':
                    this.loadRoms().then(() => {
                        this.setMachine(machineType);
                        this.initKeyboard();
                        window.requestAnimationFrame((t) => {
                            this.runAnimationFrame(t);
                        });
                    })
                    break;
                case 'frameCompleted':
                    // benchmarkRunCount++;
                    this.frameBuffers[this.lockedBuffer] = e.data.frameBuffer;
                    this.bufferAwaitingShow = this.lockedBuffer;
                    this.lockedBuffer = null;
                    const time = performance.now();
                    if (time > this.nextFrameTime) {
                        /* running at full blast - start next frame but adjust time base
                        to give it the full time allocation */
                        this.runFrame();
                        this.nextFrameTime = time + this.msPerFrame;
                    } else {
                        this.isRunningFrame = false;
                    }
                    break;
                default:
                    console.log('message received by host:', e.data);
            }
        }
    }

    async loadRom(url, page) {
        const response = await fetch(url);
        const data = new Uint8Array(await response.arrayBuffer());
        this.worker.postMessage({
            message: 'loadMemory',
            data,
            page: page,
        });
    }

    async loadRoms() {
        await this.loadRom('128-0.rom', 8);
        await this.loadRom('128-1.rom', 9);
        await this.loadRom('48.rom', 10);
    }

    getBufferToLock() {
        for (let i = 0; i < 3; i++) {
            if (i !== this.bufferBeingShown && i !== this.bufferAwaitingShow) {
                return i;
            }
        }
    }

    runFrame() {
        this.isRunningFrame = true;
        this.lockedBuffer = this.getBufferToLock();
        this.worker.postMessage({
            'message': 'runFrame',
            'frameBuffer': this.frameBuffers[this.lockedBuffer],
        }, [this.frameBuffers[this.lockedBuffer]]);
    }

    runAnimationFrame(time) {
        if (this.bufferAwaitingShow !== null) {
            this.bufferBeingShown = this.bufferAwaitingShow;
            this.bufferAwaitingShow = null;
            this.renderer.showFrame(this.frameBuffers[this.bufferBeingShown]);
            this.bufferBeingShown = null;
            // benchmarkRenderCount++;
        }
        if (time > this.nextFrameTime && !this.isRunningFrame) {
            this.runFrame();
            this.nextFrameTime += this.msPerFrame;
        }
        window.requestAnimationFrame((t) => {
            this.runAnimationFrame(t);
        });
    };

    initKeyboard() {
        document.addEventListener('keydown', (evt) => {
            const keyCode = KEY_CODES[evt.keyCode];
            if (keyCode) {
                this.worker.postMessage({
                    message: 'keyDown', row: keyCode.row, mask: keyCode.mask,
                })
                if (keyCode.caps) {
                    this.worker.postMessage({
                        message: 'keyDown', row: 0, mask: 0x01,
                    })
                }
            }
            if (!evt.metaKey) evt.preventDefault();
        });

        document.addEventListener('keyup', (evt) => {
            const keyCode = KEY_CODES[evt.keyCode];
            if (keyCode) {
                this.worker.postMessage({
                    message: 'keyUp', row: keyCode.row, mask: keyCode.mask,
                })
                if (keyCode.caps) {
                    this.worker.postMessage({
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


    setMachine(type) {
        if (type != 128) type = 48;
        this.worker.postMessage({
            message: 'setMachineType',
            type,
        });
        this.emit('setMachine', type);
    }

    reset() {
        this.worker.postMessage({message: 'reset'});
    }

    loadSnapshot(snapshot) {
        this.worker.postMessage({
            message: 'loadSnapshot',
            snapshot,
        })
        this.emit('setMachine', snapshot.model);
    }

    openTAPFile(data) {
        this.worker.postMessage({
            message: 'openTAPFile',
            data,
        })
    }

    openTZXFile(data) {
        this.worker.postMessage({
            message: 'openTZXFile',
            data,
        })
    }

    openFile(file) {
        const cleanName = file.name.toLowerCase();
        if (cleanName.endsWith('.z80')) {
            file.arrayBuffer().then(arrayBuffer => {
                const z80file = parseZ80File(arrayBuffer);
                this.loadSnapshot(z80file);
            });
        } else if (cleanName.endsWith('.sna')) {
            file.arrayBuffer().then(arrayBuffer => {
                const snafile = parseSNAFile(arrayBuffer);
                this.loadSnapshot(snafile);
            });
        } else if (cleanName.endsWith('.tap')) {
            file.arrayBuffer().then(arrayBuffer => {
                if (!TAPFile.isValid(arrayBuffer)) {
                    alert('Invalid TAP file');
                } else {
                    this.openTAPFile(arrayBuffer);
                }
            });
        } else if (cleanName.endsWith('.tzx')) {
            file.arrayBuffer().then(arrayBuffer => {
                if (!TZXFile.isValid(arrayBuffer)) {
                    alert('Invalid TZX file');
                } else {
                    this.openTZXFile(arrayBuffer);
                }
            });
        } else {
            alert('Unrecognised file type: ' + file.name);
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
    canvas.style.objectFit = 'contain';

    const appContainer = document.createElement('div');
    container.appendChild(appContainer);

    let zoom;
    let displayWidth;
    let displayHeight;
    let onSetZoom;
    let menuBar = null;
    let toolbar = null;

    const setZoom = (factor) => {
        zoom = factor;
        if (document.fullscreenElement == appContainer) {
            document.exitFullscreen();
            return;  // setZoom will be retriggered once fullscreen has exited
        }
        displayWidth = 320 * zoom;
        displayHeight = 240 * zoom;
        canvas.style.width = '' + displayWidth + 'px';
        canvas.style.height = '' + displayHeight + 'px';
        appContainer.style.width = '' + displayWidth + 'px';
        if (onSetZoom) onSetZoom(factor);
    }

    const setFullscreen = () => {
        appContainer.requestFullscreen();
    }
    const exitFullscreen = () => {
        if (document.fullscreenElement == appContainer) {
            document.exitFullscreen();
        }
    }
    appContainer.addEventListener('fullscreenchange', () => {
        if (document.fullscreenElement) {
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            if (menuBar) menuBar.enterFullscreen();
            if (toolbar) toolbar.enterFullscreen();
            if (onSetZoom) onSetZoom('fullscreen');
        } else {
            if (menuBar) menuBar.exitFullscreen();
            if (toolbar) toolbar.exitFullscreen();
            setZoom(zoom);
        }
    })

    const emu = new Emulator(canvas, opts.machine || 128);

    if (opts.ui) {
        menuBar = new MenuBar(appContainer);
        const fileMenu = menuBar.addMenu('File');
        fileMenu.addItem('Open...', () => {
            openFileDialog();
        });
        const machineMenu = menuBar.addMenu('Machine');
        const machine48Item = machineMenu.addItem('Spectrum 48K', () => {
            emu.setMachine(48);
        });
        const machine128Item = machineMenu.addItem('Spectrum 128K', () => {
            emu.setMachine(128);
        });
        const displayMenu = menuBar.addMenu('Display');

        const zoomItemsBySize = {
            1: displayMenu.addItem('100%', () => setZoom(1)),
            2: displayMenu.addItem('200%', () => setZoom(2)),
            3: displayMenu.addItem('300%', () => setZoom(3)),
        }
        const fullscreenItem = displayMenu.addItem('Fullscreen', () => {
            setFullscreen();
        })
        onSetZoom = (factor) => {
            if (factor == 'fullscreen') {
                fullscreenItem.setCheckbox();
                for (let i in zoomItemsBySize) {
                    zoomItemsBySize[i].unsetCheckbox();
                }
            } else {
                fullscreenItem.unsetCheckbox();
                for (let i in zoomItemsBySize) {
                    if (parseInt(i) == factor) {
                        zoomItemsBySize[i].setCheckbox();
                    } else {
                        zoomItemsBySize[i].unsetCheckbox();
                    }
                }
            }
        }

        emu.on('setMachine', (type) => {
            if (type == 48) {
                machine48Item.setCheckbox();
                machine128Item.unsetCheckbox();
            } else {
                machine48Item.unsetCheckbox();
                machine128Item.setCheckbox();
            }
        });
    }

    appContainer.appendChild(canvas);
    canvas.style.display = 'block';

    if (opts.ui) {
        toolbar = new Toolbar(appContainer);
        toolbar.addButton(openIcon, 'Open file', () => {
            openFileDialog();
        });
        toolbar.addButton(resetIcon, 'Reset', () => {
            emu.reset();
        });
    }

    setZoom(opts.zoom || 1);

    const openFileDialog = () => {
        fileDialog().then(files => {
            const file = files[0];
            emu.openFile(file);
        });
    }

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

    return emu;
};
