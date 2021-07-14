import { FRAME_BUFFER_SIZE } from './constants';

// The entry file of your WebAssembly module.

let frameNum = 1;

export function runFrame(): void {
    for (let i:u16 = 0; i < FRAME_BUFFER_SIZE; i++) {
        store<u8>(i, i + frameNum);
    }
    frameNum += 2;
}
