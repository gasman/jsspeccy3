onmessage = (e) => {
    switch (e.data.message) {
        case 'runFrame':
            const frameBuffer = e.data.frameBuffer;
            const frameData = new Uint8Array(frameBuffer);

            for (let i = 0 ; i < frameData.length; i++) {
                frameData[i] = Math.floor(Math.random() * 256);
            }
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
