import { FRAME_BUFFER_SIZE } from './constants';

WebAssembly.instantiateStreaming(
    fetch('untouched.wasm', {})
).then(results => {
    const memory = results.instance.exports.memory;
    const memoryData = new Uint8Array(memory.buffer);
    const workerFrameData = memoryData.subarray(0, FRAME_BUFFER_SIZE);

    onmessage = (e) => {
        switch (e.data.message) {
            case 'runFrame':
                const frameBuffer = e.data.frameBuffer;
                const frameData = new Uint8Array(frameBuffer);

                results.instance.exports.runFrame();
                frameData.set(workerFrameData);
                postMessage({
                    'message': 'frameCompleted',
                    'frameBuffer': frameBuffer,
                }, [frameBuffer]);

                break;
            default:
                console.log('message received by worker:', e.data);
        }
    };

    postMessage({
        'message': 'ready',
    });
});
