export const FRAME_BUFFER:u32 = 0x0000;
export const FRAME_BUFFER_SIZE:u32 = 0x3000;

export const MACHINE_MEMORY:u32 = FRAME_BUFFER + FRAME_BUFFER_SIZE;
export const MACHINE_MEMORY_SIZE:u32 = 0x10000;

/* registers */
const REGISTERS = MACHINE_MEMORY + MACHINE_MEMORY_SIZE;
export const rF = REGISTERS + 0;
export const rA = REGISTERS + 1;
export const rpAF = rF;
export const rC = REGISTERS + 2;
export const rB = REGISTERS + 3;
export const rpBC = rC;
export const rE = REGISTERS + 4;
export const rD = REGISTERS + 5;
export const rpDE = rE;
export const rL = REGISTERS + 6;
export const rH = REGISTERS + 7;
export const rpHL = rL;
export const rF_ = REGISTERS + 8;
export const rA_ = REGISTERS + 9;
export const rpAF_ = rF_;
export const rC_ = REGISTERS + 10;
export const rB_ = REGISTERS + 11;
export const rpBC_ = rC_;
export const rE_ = REGISTERS + 12;
export const rD_ = REGISTERS + 13;
export const rpDE_ = rE_;
export const rL_ = REGISTERS + 14;
export const rH_ = REGISTERS + 15;
export const rpHL_ = rL;
export const rIXL = REGISTERS + 16;
export const rIXH = REGISTERS + 17;
export const rpIX = rIXL;
export const rIYH = REGISTERS + 18;
export const rIYL = REGISTERS + 19;
export const rpIY = rIYL;
export const rI = REGISTERS + 20;
export const rR = REGISTERS + 21;

export const FRAME_CYCLE_COUNT:u32 = 69888;
