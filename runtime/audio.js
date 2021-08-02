const SAMPLES_PER_FRAME = 44100 / 50;

const ENABLE_OSCILLOSCOPE = true;

export class AudioHandler {
    constructor() {
        this.buffers = [
            new ArrayBuffer(SAMPLES_PER_FRAME * 4),
            new ArrayBuffer(SAMPLES_PER_FRAME * 4)
        ];
        if (ENABLE_OSCILLOSCOPE) {
            const canvas = document.createElement('canvas');
            canvas.width = SAMPLES_PER_FRAME;
            canvas.height = 64;
            document.body.appendChild(canvas);
            this.ctx = canvas.getContext('2d');
        }
    }

    frameCompleted(audioBufferLeft, audioBufferRight) {
        this.buffers[0] = audioBufferLeft;
        this.buffers[1] = audioBufferRight;

        if (ENABLE_OSCILLOSCOPE) {
            this.ctx.fillStyle = '#000';
            this.ctx.strokeStyle = '#0f0';
            this.ctx.fillRect(0, 0, SAMPLES_PER_FRAME, 64);

            const leftData = new Float32Array(audioBufferLeft);
            this.ctx.beginPath();
            this.ctx.moveTo(0, 16);
            for (let i = 0; i < SAMPLES_PER_FRAME; i++) {
                this.ctx.lineTo(i, 16 - leftData[i] * 16);
            }
            this.ctx.stroke();

            const rightData = new Float32Array(audioBufferRight);
            this.ctx.beginPath();
            this.ctx.moveTo(0, 48);
            for (let i = 0; i < SAMPLES_PER_FRAME; i++) {
                this.ctx.lineTo(i, 48 - rightData[i] * 16);
            }
            this.ctx.stroke();
        }
    }
}
