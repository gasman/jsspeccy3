import { FRAME_BUFFER_SIZE } from './constants.js';
import { TAPFile, TZXFile } from './tape.js';

let core = null;
let memory = null;
let memoryData = null;
let workerFrameData = null;
let registerPairs = null;
let tapePulses = null;

let stopped = false;
let tape = null;
let tapeIsPlaying = false;
let machineType = 48;

const loadCore = (baseUrl) => {
    WebAssembly.instantiateStreaming(
        fetch(new URL('jsspeccy-core.wasm', baseUrl), {})
    ).then(results => {
        core = results.instance.exports;
        memory = core.memory;
        memoryData = new Uint8Array(memory.buffer);
        workerFrameData = memoryData.subarray(core.FRAME_BUFFER, FRAME_BUFFER_SIZE);
        registerPairs = new Uint16Array(core.memory.buffer, core.REGISTERS, 12);
        tapePulses = new Uint16Array(core.memory.buffer, core.TAPE_PULSES, core.TAPE_PULSES_LENGTH);

        postMessage({
            'message': 'ready',
        });
    });
}

const loadMemoryPage = (page, data) => {
    memoryData.set(data, core.MACHINE_MEMORY + page * 0x4000);
};

const loadSnapshot = (snapshot) => {
    machineType = snapshot.model;
    core.setMachineType(snapshot.model);
    for (let page in snapshot.memoryPages) {
        loadMemoryPage(page, snapshot.memoryPages[page]);
    }
    ['AF', 'BC', 'DE', 'HL', 'AF_', 'BC_', 'DE_', 'HL_', 'IX', 'IY', 'SP', 'IR'].forEach(
        (r, i) => {
            registerPairs[i] = snapshot.registers[r];
        }
    )
    core.setPC(snapshot.registers.PC);
    core.setIFF1(snapshot.registers.iff1);
    core.setIFF2(snapshot.registers.iff2);
    core.setIM(snapshot.registers.im);
    core.setHalted(!!snapshot.halted);

    core.writePort(0x00fe, snapshot.ulaState.borderColour);
    if (snapshot.model != 48) {
        core.writePort(0x7ffd, snapshot.ulaState.pagingFlags);
    }

    core.setTStates(snapshot.tstates);
    core.setTapePulseBufferState(0, 0);
};

const fillTapePulseBuffer = () => {
    if (tape && tapeIsPlaying) {
        tape.is48K = (machineType == 48);
        const tapePulseBufferTstateCount = core.getTapePulseBufferTstateCount();
        if (tapePulseBufferTstateCount < 80000) {
            const tapePulseWriteIndex = core.getTapePulseWriteIndex();
            const [newTapePulseWriteIndex, tstatesGenerated, tapeFinished] = tape.pulseGenerator.emitPulses(
                tapePulses, tapePulseWriteIndex, 80000 - tapePulseBufferTstateCount
            );
            core.setTapePulseBufferState(newTapePulseWriteIndex, tapePulseBufferTstateCount + tstatesGenerated);
            if (tapeFinished) {
                tapeIsPlaying = false;
                postMessage({
                    message: 'stoppedTape',
                });
            }
        }
    }
};

const trapTapeLoad = () => {
    if (!tape) return;
    tape.is48K = (machineType == 48);
    const block = tape.getNextLoadableBlock();
    if (!block) {
        if (!tape.stopRequested && tape.hasMoreBlocks()) {
            if (!tapeIsPlaying) {
                tapeIsPlaying = true;
                postMessage({
                    message: 'playingTape',
                });
            }
            fillTapePulseBuffer();
        }
        return;
    }

    // Flush any buffered pulses from the block being trapped
    core.setTapePulseBufferState(0, 0);

    /* get expected block type and load vs verify flag from AF' */
    const af_ = registerPairs[4];
    const expectedBlockType = af_ >> 8;
    const shouldLoad = af_ & 0x0001;  // LOAD rather than VERIFY
    let addr = registerPairs[8];  /* IX */
    const requestedLength = registerPairs[2];  /* DE */
    const actualBlockType = block[0];

    let success = true;
    let offset = 1;
    let loadedBytes = 0;
    let checksum = actualBlockType;
    let lastByte = actualBlockType;

    if (expectedBlockType != actualBlockType) {
        success = false;
    } else {
        while (loadedBytes < requestedLength) {
            if (offset >= block.length) {
                /* have run out of bytes to load */
                success = false;
                break;
            }
            const byte = block[offset++];
            lastByte = byte;
            loadedBytes++;
            if (shouldLoad) {
                core.poke(addr, byte);
            } else {
                if ((core.peek(addr) ^ byte) !== 0) {
                    success = false;
                    break;
                }
            }
            addr = (addr + 1) & 0xffff;
            checksum ^= byte;
        }

        // if loading is going right, we should still have a checksum byte left to read
        success = success && (offset < block.length);
        if (success) {
            const expectedChecksum = block[offset];
            lastByte = expectedChecksum;
            checksum ^= expectedChecksum;
            success = (checksum === 0);
        }

        registerPairs[8] = addr;  /* IX */
        registerPairs[2] = (requestedLength - loadedBytes) & 0xffff;  /* DE */
        registerPairs[3] = ((checksum & 0xff) << 8) | (lastByte & 0xff);  /* HL */
    }

    if (success) {
        /* set carry to indicate success */
        registerPairs[0] = 0x0001;
    } else {
        /* reset carry to indicate failure */
        registerPairs[0] &= 0xfffe;
    }
    core.setPC(0x05e2);  /* address at which to exit the tape trap */

    if (tape.hasMoreBlocks()) {
        if (!tapeIsPlaying) {
            tapeIsPlaying = true;
            postMessage({
                message: 'playingTape',
            });
        }
        fillTapePulseBuffer();
    } else if (tapeIsPlaying) {
        tapeIsPlaying = false;
        postMessage({
            message: 'stoppedTape',
        });
    }
}

onmessage = (e) => {
    switch (e.data.message) {
        case 'loadCore':
            loadCore(e.data.baseUrl);
            break;
        case 'runFrame':
            if (stopped) return;
            const frameBuffer = e.data.frameBuffer;
            const frameData = new Uint8Array(frameBuffer);

            let audioBufferLeft = null;
            let audioBufferRight = null;
            let audioLength = 0;
            if ('audioBufferLeft' in e.data) {
                audioBufferLeft = e.data.audioBufferLeft;
                audioBufferRight = e.data.audioBufferRight;
                audioLength = audioBufferLeft.byteLength / 4;
                core.setAudioSamplesPerFrame(audioLength);
            } else {
                core.setAudioSamplesPerFrame(0);
            }

            fillTapePulseBuffer();

            let status = core.runFrame();
            while (status) {
                switch (status) {
                    case 1:
                        stopped = true;
                        throw("Unrecognised opcode!");
                    case 2:
                        trapTapeLoad();
                        break;
                    default:
                        stopped = true;
                        throw("runFrame returned unexpected result: " + status);
                }

                status = core.resumeFrame();
            }

            frameData.set(workerFrameData);
            if (audioLength) {
                const leftSource = new Float32Array(core.memory.buffer, core.AUDIO_BUFFER_LEFT, audioLength);
                const rightSource = new Float32Array(core.memory.buffer, core.AUDIO_BUFFER_RIGHT, audioLength);
                const leftData = new Float32Array(audioBufferLeft);
                const rightData = new Float32Array(audioBufferRight);
                leftData.set(leftSource);
                rightData.set(rightSource);
                postMessage({
                    message: 'frameCompleted',
                    frameBuffer,
                    audioBufferLeft,
                    audioBufferRight,
                }, [frameBuffer, audioBufferLeft, audioBufferRight]);
            } else {
                postMessage({
                    message: 'frameCompleted',
                    frameBuffer,
                }, [frameBuffer]);
            }

            break;
        case 'keyDown':
            core.keyDown(e.data.row, e.data.mask);
            break;
        case 'keyUp':
            core.keyUp(e.data.row, e.data.mask);
            break;
        case 'setMachineType':
            machineType = e.data.type;
            core.setMachineType(e.data.type);
            break;
        case 'reset':
            core.reset();
            break;
        case 'loadMemory':
            loadMemoryPage(e.data.page, e.data.data);
            break;
        case 'loadSnapshot':
            loadSnapshot(e.data.snapshot);
            postMessage({
                message: 'fileOpened',
                id: e.data.id,
                mediaType: 'snapshot',
            });
            break;
        case 'openTAPFile':
            tape = new TAPFile(e.data.data);
            core.setTapePulseBufferState(0, 0);
            if (tapeIsPlaying) {
                tapeIsPlaying = false;
                postMessage({
                    message: 'stoppedTape',
                });
            }
            postMessage({
                message: 'fileOpened',
                id: e.data.id,
                mediaType: 'tape',
            });
            break;
        case 'openTZXFile':
            tape = new TZXFile(e.data.data);
            core.setTapePulseBufferState(0, 0);
            if (tapeIsPlaying) {
                tapeIsPlaying = false;
                postMessage({
                    message: 'stoppedTape',
                });
            }
            postMessage({
                message: 'fileOpened',
                id: e.data.id,
                mediaType: 'tape',
            });
            break;
        
        case 'playTape':
            if (tape && !tapeIsPlaying) {
                tapeIsPlaying = true;
                postMessage({
                    message: 'playingTape',
                });
            }
            break;
        case 'stopTape':
            if (tape && tapeIsPlaying) {
                tapeIsPlaying = false;
                postMessage({
                    message: 'stoppedTape',
                });
            }
            break;
        case 'setTapeTraps':
            core.setTapeTraps(e.data.value);
            break;
        default:
            console.log('message received by worker:', e.data);
    }
};
