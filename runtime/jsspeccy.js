import fileDialog from 'file-dialog';

import { FRAME_BUFFER_SIZE } from './constants.js';
import { CanvasRenderer } from './render.js';
import { MenuBar } from './ui.js';
import { parseSNAFile, parseZ80File } from './snapshot.js';
import { TAPFile } from './tape.js';

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
        fileMenu.addItem('Open...', () => {
            fileDialog().then(files => {
                const file = files[0];
                const cleanName = file.name.toLowerCase();
                if (cleanName.endsWith('.z80')) {
                    file.arrayBuffer().then(arrayBuffer => {
                        const z80file = parseZ80File(arrayBuffer);
                        loadSnapshot(z80file);
                    });
                } else if (cleanName.endsWith('.sna')) {
                    file.arrayBuffer().then(arrayBuffer => {
                        const snafile = parseSNAFile(arrayBuffer);
                        loadSnapshot(snafile);
                    });
                } else if (cleanName.endsWith('.tap')) {
                    file.arrayBuffer().then(arrayBuffer => {
                        if (!TAPFile.isValid(arrayBuffer)) {
                            alert('Invalid TAP file');
                        } else {
                            openTAPFile(arrayBuffer);
                        }
                    });
                } else {
                    alert('Unrecognised file type: ' + file.name);
                }
            })
        });
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

    const loadSnapshot = (snapshot) => {
        worker.postMessage({
            message: 'loadSnapshot',
            snapshot,
        })
        if (onSetMachine) onSetMachine(snapshot.model);
    }

    const openTAPFile = (data) => {
        worker.postMessage({
            message: 'openTAPFile',
            data,
        })
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
