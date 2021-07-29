import { FRAME_BUFFER_SIZE } from './constants.js';

const run = (core) => {
    const memory = core.memory;
    const memoryData = new Uint8Array(memory.buffer);
    const workerFrameData = memoryData.subarray(core.FRAME_BUFFER, FRAME_BUFFER_SIZE);
    const registerPairs = new Uint16Array(core.memory.buffer, core.REGISTERS, 12);

    let stopped = false;
    let tape = null;

    const loadMemoryPage = (page, data) => {
        memoryData.set(data, core.MACHINE_MEMORY + page * 0x4000);
    };

    const loadSnapshot = (snapshot) => {
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

        core.writePort(0x00fe, snapshot.ulaState.borderColour);
        if (snapshot.model != 48) {
            core.writePort(0x7ffd, snapshot.ulaState.pagingFlags);
        }

        core.setTStates(snapshot.tstates);
    };

    onmessage = (e) => {
        switch (e.data.message) {
            case 'runFrame':
                if (stopped) return;
                const frameBuffer = e.data.frameBuffer;
                const frameData = new Uint8Array(frameBuffer);

                let status = core.runFrame();
                while (status) {
                    switch (status) {
                        case 1:
                            stopped = true;
                            throw("Unrecognised opcode!");
                        default:
                            stopped = true;
                            throw("runFrame returned unexpected result: " + result);
                    }

                    status = core.resumeFrame();
                }

                frameData.set(workerFrameData);
                postMessage({
                    'message': 'frameCompleted',
                    'frameBuffer': frameBuffer,
                }, [frameBuffer]);

                break;
            case 'keyDown':
                core.keyDown(e.data.row, e.data.mask);
                break;
            case 'keyUp':
                core.keyUp(e.data.row, e.data.mask);
                break;
            case 'setMachineType':
                core.setMachineType(e.data.type);
                break;
            case 'loadMemory':
                loadMemoryPage(e.data.page, e.data.data);
                break;
            case 'loadSnapshot':
                loadSnapshot(e.data.snapshot);
                break;
            case 'insertTape':
                tape = e.data.tape;
                break;
            default:
                console.log('message received by worker:', e.data);
        }
    };

    postMessage({
        'message': 'ready',
    });
}

WebAssembly.instantiateStreaming(
    fetch('jsspeccy-core.wasm', {})
).then(results => {
    run(results.instance.exports);
});
