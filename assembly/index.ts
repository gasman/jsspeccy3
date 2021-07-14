import { FRAME_BUFFER_SIZE, FRAME_CYCLE_COUNT, MACHINE_MEMORY } from './constants';


function readMem(addr:u16):u8 {
    return load<u8>(MACHINE_MEMORY + addr);
}


let frameNum:u8 = 1;
let t:u32 = 0;
let pc:u16 = 0;

export function runFrame():i16 {
    while (t < FRAME_CYCLE_COUNT) {
        let op:u8 = readMem(pc++);
        t += 4;
        switch (op) {
            default:
                return op;
        }
    }
    t -= FRAME_CYCLE_COUNT;

    for (let i:u16 = 0; i < FRAME_BUFFER_SIZE; i++) {
        store<u8>(i, i + frameNum);
    }
    frameNum += 2;

    return -1;
}
