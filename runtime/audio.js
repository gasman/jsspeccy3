const ENABLE_OSCILLOSCOPE = false;
const BUFFER_SIZE = 0x10000;

export class AudioHandler {
    constructor() {
        this.isActive = false;

        if (ENABLE_OSCILLOSCOPE) {
            this.canvas = document.createElement('canvas');
            document.body.appendChild(this.canvas);
            this.canvasCtx = this.canvas.getContext('2d');
        }
    }
    start() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContext({latencyHint: 'interactive'});
        this.samplesPerFrame = this.audioContext.sampleRate / 50;

        this.frameBuffers = [
            new ArrayBuffer(this.samplesPerFrame * 4),
            new ArrayBuffer(this.samplesPerFrame * 4)
        ];

        this.leftBuffer = new Float32Array(BUFFER_SIZE);
        this.rightBuffer = new Float32Array(BUFFER_SIZE);
        this.readPtr = 0;
        this.writePtr = 0;

        this.scriptNode = this.audioContext.createScriptProcessor(0, 0, 2);
        this.scriptNode.onaudioprocess = (audioProcessingEvent) => {
            const outputBuffer = audioProcessingEvent.outputBuffer;
            const leftData = outputBuffer.getChannelData(0);
            const rightData = outputBuffer.getChannelData(1);

            let availableDataLength = this.writePtr - this.readPtr;
            if (availableDataLength < 0) availableDataLength += BUFFER_SIZE;

            if (availableDataLength >= leftData.length) {
                // enough data is available to fill the buffer
                if (this.readPtr + leftData.length <= BUFFER_SIZE) {
                    // can copy all in one go
                    leftData.set(this.leftBuffer.slice(this.readPtr, this.readPtr + leftData.length));
                    rightData.set(this.rightBuffer.slice(this.readPtr, this.readPtr + rightData.length));
                    this.readPtr = (this.readPtr + leftData.length) % BUFFER_SIZE;
                } else {
                    // straddles the end of our circular buffer - need to copy in two steps
                    const firstChunkLength = BUFFER_SIZE - this.readPtr;
                    const secondChunkLength = leftData.length - firstChunkLength;

                    leftData.set(this.leftBuffer.slice(this.readPtr, this.readPtr + firstChunkLength));
                    rightData.set(this.rightBuffer.slice(this.readPtr, this.readPtr + firstChunkLength));
                    leftData.set(this.leftBuffer.slice(0, secondChunkLength), firstChunkLength);
                    rightData.set(this.rightBuffer.slice(0, secondChunkLength), firstChunkLength);

                    this.readPtr = secondChunkLength;
                }
                if (ENABLE_OSCILLOSCOPE) {
                    this.drawOscilloscope(leftData, rightData);
                }
            }
        }
        this.scriptNode.connect(this.audioContext.destination);

        this.isActive = true;

        if (ENABLE_OSCILLOSCOPE) {
            this.canvas.width = this.samplesPerFrame;
            this.canvas.height = 64;
        }
    }

    stop() {
        this.scriptNode.disconnect(this.audioContext.destination);
        this.audioContext.close();
    }

    frameCompleted(audioBufferLeft, audioBufferRight) {
        this.frameBuffers[0] = audioBufferLeft;
        this.frameBuffers[1] = audioBufferRight;

        if (!this.isActive) return;

        const dataLength = audioBufferLeft.byteLength / 4;
        if (this.writePtr + dataLength <= BUFFER_SIZE) {
            /* can copy all in one go */
            const leftData = new Float32Array(audioBufferLeft);
            const rightData = new Float32Array(audioBufferRight);
            this.leftBuffer.set(leftData, this.writePtr);
            this.rightBuffer.set(rightData, this.writePtr);
            this.writePtr = (this.writePtr + dataLength) % BUFFER_SIZE;
        } else {
            /* straddles the end of our circular buffer - need to copy in two steps */
            const firstChunkLength = BUFFER_SIZE - this.writePtr;
            const secondChunkLength = dataLength - firstChunkLength;
            const leftData1 = new Float32Array(audioBufferLeft, 0, firstChunkLength);
            const rightData1 = new Float32Array(audioBufferRight, 0, firstChunkLength);
            this.leftBuffer.set(leftData1, this.writePtr);
            this.rightBuffer.set(rightData1, this.writePtr);
            const leftData2 = new Float32Array(audioBufferLeft, firstChunkLength * 4, secondChunkLength);
            const rightData2 = new Float32Array(audioBufferRight, firstChunkLength * 4, secondChunkLength);
            this.leftBuffer.set(leftData2, 0);
            this.rightBuffer.set(rightData2, 0);
            this.writePtr = secondChunkLength;
        }
    }

    drawOscilloscope(leftBuffer, rightBuffer) {
        this.canvasCtx.fillStyle = '#000';
        this.canvasCtx.strokeStyle = '#0f0';
        this.canvasCtx.fillRect(0, 0, this.samplesPerFrame, 64);

        const leftData = new Float32Array(leftBuffer);
        this.canvasCtx.beginPath();
        this.canvasCtx.moveTo(0, 16);
        for (let i = 0; i < this.samplesPerFrame; i++) {
            this.canvasCtx.lineTo(i, 16 - leftData[i] * 16);
        }
        this.canvasCtx.stroke();

        const rightData = new Float32Array(rightBuffer);
        this.canvasCtx.beginPath();
        this.canvasCtx.moveTo(0, 48);
        for (let i = 0; i < this.samplesPerFrame; i++) {
            this.canvasCtx.lineTo(i, 48 - rightData[i] * 16);
        }
        this.canvasCtx.stroke();

    }
}
