import { FRAME_BUFFER_SIZE, MACHINE_MEMORY } from './constants.js';

const run = (core) => {
    const memory = core.memory;
    const memoryData = new Uint8Array(memory.buffer);
    const workerFrameData = memoryData.subarray(0, FRAME_BUFFER_SIZE);

    let stopped = false;

    const loadMemoryPage = (page, data) => {
        memoryData.set(data, MACHINE_MEMORY + page * 0x4000);
    };

    const loadSnapshot = (snapshot) => {
        core.setMachineType(snapshot.model);
        for (let page in snapshot.memoryPages) {
            loadMemoryPage(page, snapshot.memoryPages[page]);
        }
        const r = snapshot.registers;
        core.setRegisters(
            r.AF, r.BC, r.DE, r.HL, r.AF_, r.BC_, r.DE_, r.HL_, r.IX, r.IY, r.SP, r.IR
        );
        core.setPC(r.PC);
        core.setIFF1(r.iff1);
        core.setIFF2(r.iff2);
        core.setIM(r.im);

        core.writePort(0x00fe, snapshot.ulaState.borderColour);
        if (snapshot.model != 48) {
            core.writePort(0x7ffd, snapshot.ulaState.pagingFlags);
        }

        core.setTStates(r.tstates);
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
