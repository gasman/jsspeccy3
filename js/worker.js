import { FRAME_BUFFER_SIZE, MACHINE_MEMORY } from './constants';
import * as jsCore from '../build/jsspeccy-core';

const run = (core) => {
    const memory = core.memory;
    const memoryData = new Uint8Array(memory.buffer);
    const workerFrameData = memoryData.subarray(0, FRAME_BUFFER_SIZE);

    onmessage = (e) => {
        switch (e.data.message) {
            case 'runFrame':
                const frameBuffer = e.data.frameBuffer;
                const frameData = new Uint8Array(frameBuffer);

                const result = core.runFrame();
                if (result != -1) {
                    throw "Unhandled opcode: " + result.toString(16);
                }
                frameData.set(workerFrameData);
                postMessage({
                    'message': 'frameCompleted',
                    'frameBuffer': frameBuffer,
                }, [frameBuffer]);

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

if (WebAssembly) {
    WebAssembly.instantiateStreaming(
        fetch('jsspeccy-core.wasm', {})
    ).then(results => {
        run(results.instance.exports);
    });
} else {
    run(jsCore);
}
