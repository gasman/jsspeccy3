import { FRAME_BUFFER_SIZE, FRAME_CYCLE_COUNT, MACHINE_MEMORY } from './constants';

const FLAG_C:u8 = 0x01;
const FLAG_N:u8 = 0x02;
const FLAG_P:u8 = 0x04;
const FLAG_V:u8 = 0x04;
const FLAG_3:u8 = 0x08;
const FLAG_H:u8 = 0x10;
const FLAG_5:u8 = 0x20;
const FLAG_Z:u8 = 0x40;
const FLAG_S:u8 = 0x80;

/*
    Whether a half carry occurred or not can be determined by looking at
    the 3rd bit of the two arguments and the result; these are hashed
    into this table in the form r12, where r is the 3rd bit of the
    result, 1 is the 3rd bit of the 1st argument and 2 is the
    third bit of the 2nd argument; the tables differ for add and subtract
    operations
*/
//const halfcarryAddTable = new Uint8Array(8); // [0, FLAG_H, FLAG_H, FLAG_H, 0, 0, 0, FLAG_H];
//const halfcarrySubTable = new Uint8Array(8); // [0, 0, FLAG_H, 0, FLAG_H, 0, FLAG_H, FLAG_H];

/*
    Similarly, overflow can be determined by looking at the 7th bits; again
    the hash into this table is r12
*/
//const overflowAddTable = new Uint8Array(8); // [0, 0, 0, FLAG_V, FLAG_V, 0, 0, 0];
//const overflowSubTable = new Uint8Array(8); // [0, FLAG_V, 0, 0, 0, 0, FLAG_V, 0];

//const sz53Table = new Uint8Array(0x100); /* The S, Z, 5 and 3 bits of the index */
//const parityTable = new Uint8Array(0x100); /* The parity of the lookup value */
//const sz53pTable = new Uint8Array(0x100); /* OR the above two tables together */

//for (let i:i32 = 0; i < 0x100; i++) {
//    sz53Table[i] = u8(i) & ( FLAG_3 | FLAG_5 | FLAG_S );
//    let j = u8(i);
//    let parity:u8 = 0;
//    for (let k:i8 = 0; k < 8; k++) {
//        parity ^= j & 1;
//        j >>= 1;
//    }

//    parityTable[i] = (parity ? 0 : FLAG_P);
//    sz53pTable[i] = sz53Table[i] | parityTable[i];

//    sz53Table[0] |= FLAG_Z;
//    sz53pTable[0] |= FLAG_Z;
//}


function readMem(addr:u16):u8 {
    return load<u8>(MACHINE_MEMORY + addr);
}


let frameNum:u8 = 1;
let t:u32 = 0;
let pc:u16 = 0;
let iff1:bool = 0;
let iff2:bool = 0;

export function runFrame():i16 {
    while (t < FRAME_CYCLE_COUNT) {
        let op:u8 = readMem(pc++);
        t += 4;
        switch (op) {
            case 0xf3:  /* DI */
                iff1 = iff2 = 0;
                break;
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
