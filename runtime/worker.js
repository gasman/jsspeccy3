import { FRAME_BUFFER_SIZE, MACHINE_MEMORY } from './constants.js';

const run = (core) => {
    const memory = core.memory;
    const memoryData = new Uint8Array(memory.buffer);
    const workerFrameData = memoryData.subarray(0, FRAME_BUFFER_SIZE);

    let stopped = false;

    onmessage = (e) => {
        switch (e.data.message) {
            case 'runFrame':
                if (stopped) return;
                const frameBuffer = e.data.frameBuffer;
                const frameData = new Uint8Array(frameBuffer);

                const result = core.runFrame();
                frameData.set(workerFrameData);
                postMessage({
                    'message': 'frameCompleted',
                    'frameBuffer': frameBuffer,
                }, [frameBuffer]);

                if (result != -1) {
                    stopped = true;
                    throw "Unhandled opcode: " + result.toString(16);
                }
                break;
            case 'keyDown':
                core.keyDown(e.data.row, e.data.mask);
                break;
            case 'keyUp':
                core.keyUp(e.data.row, e.data.mask);
                break;
            case 'loadMemory':
                memoryData.set(e.data.data, MACHINE_MEMORY + e.data.offset);
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
