import EventEmitter from 'events';
import fileDialog from 'file-dialog';

import { DisplayHandler } from './render.js';
import { UIController } from './ui.js';
import { parseSNAFile, parseZ80File, parseSZXFile } from './snapshot.js';
import { TAPFile, TZXFile } from './tape.js';
import { KeyboardHandler } from './keyboard.js';

import openIcon from './icons/open.svg';
import resetIcon from './icons/reset.svg';
import fullscreenIcon from './icons/fullscreen.svg';


class Emulator extends EventEmitter {
    constructor(canvas, machineType) {
        super();
        this.canvas = canvas;
        this.worker = new Worker('jsspeccy-worker.js');
        this.keyboardHandler = new KeyboardHandler(this.worker);
        this.displayHandler = new DisplayHandler(this.canvas);

        this.msPerFrame = 20;

        this.isRunningFrame = false;
        this.nextFrameTime = performance.now();

        this.worker.onmessage = (e) => {
            switch(e.data.message) {
                case 'ready':
                    this.loadRoms().then(() => {
                        this.setMachine(machineType);
                        this.keyboardHandler.start();
                        window.requestAnimationFrame((t) => {
                            this.runAnimationFrame(t);
                        });
                    })
                    break;
                case 'frameCompleted':
                    // benchmarkRunCount++;
                    this.displayHandler.frameCompleted(e.data.frameBuffer);
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


    runFrame() {
        this.isRunningFrame = true;
        const frameBuffer = this.displayHandler.getNextFrameBuffer();
        this.worker.postMessage({
            message: 'runFrame',
            frameBuffer,
        }, frameBuffer);
    }

    runAnimationFrame(time) {
        if (this.displayHandler.readyToShow()) {
            this.displayHandler.show();
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
        } else if (cleanName.endsWith('.szx')) {
            file.arrayBuffer().then(arrayBuffer => {
                const szxfile = parseSZXFile(arrayBuffer);
                this.loadSnapshot(szxfile);
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

    const ui = new UIController(container, canvas, {zoom: opts.zoom || 1});
    const emu = new Emulator(canvas, opts.machine || 128);

    const fileMenu = ui.menuBar.addMenu('File');
    fileMenu.addItem('Open...', () => {
        openFileDialog();
    });
    const machineMenu = ui.menuBar.addMenu('Machine');
    const machine48Item = machineMenu.addItem('Spectrum 48K', () => {
        emu.setMachine(48);
    });
    const machine128Item = machineMenu.addItem('Spectrum 128K', () => {
        emu.setMachine(128);
    });
    const displayMenu = ui.menuBar.addMenu('Display');

    const zoomItemsBySize = {
        1: displayMenu.addItem('100%', () => ui.setZoom(1)),
        2: displayMenu.addItem('200%', () => ui.setZoom(2)),
        3: displayMenu.addItem('300%', () => ui.setZoom(3)),
    }
    const fullscreenItem = displayMenu.addItem('Fullscreen', () => {
        ui.enterFullscreen();
    })
    ui.on('setZoom', (factor) => {
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
    });

    emu.on('setMachine', (type) => {
        if (type == 48) {
            machine48Item.setCheckbox();
            machine128Item.unsetCheckbox();
        } else {
            machine48Item.unsetCheckbox();
            machine128Item.setCheckbox();
        }
    });

    ui.toolbar.addButton(openIcon, {label: 'Open file'}, () => {
        openFileDialog();
    });
    ui.toolbar.addButton(resetIcon, {label: 'Reset'}, () => {
        emu.reset();
    });
    ui.toolbar.addButton(
        fullscreenIcon,
        {label: 'Enter full screen mode', align: 'right'},
        () => {
            ui.toggleFullscreen();
        }
    )

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
