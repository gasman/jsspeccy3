/* Generate the tape loader snapshot for the TC2048.

   A tape loader snapshot is the machine parked at the point where it is
   waiting for tape data, so the emulator can drop the user straight there
   instead of making them type LOAD "" by hand.

   The TC2048 cannot simply reuse tape_48.szx. That snapshot records its
   machine as a 48K, and loadSnapshot() feeds the recorded machine straight
   into core.setMachineType(), so opening a tape would quietly switch the
   emulator out of TC2048 mode and leave it there.

   Producing the snapshot here, by booting the machine from its own ROM and
   typing the command, keeps it reproducible rather than being an opaque
   binary someone once made in another emulator.

   Usage: node tools/make-tapeloader.js <machineType> <output.szx>
*/
import * as fs from 'fs';
import * as zlib from 'zlib';
import { exit } from 'process';

import core from '../test/core.js';

const machineType = parseInt(process.argv[2], 10);
const outPath = process.argv[3];
if (!machineType || !outPath) {
    console.log('Usage: node tools/make-tapeloader.js <machineType> <output.szx>');
    exit(1);
}

const ROMS_BY_MACHINE = {
    2048: [['roms/tc2048.rom', 14]],
};
const SZX_MACHINE_ID = { 2048: 8 };

if (!(machineType in ROMS_BY_MACHINE)) {
    console.log(`No ROM mapping for machine ${machineType}`);
    exit(1);
}

const memory = new Uint8Array(core.memory.buffer);
function loadRom(file, page16k) {
    const data = fs.readFileSync(new URL('../static/' + file, import.meta.url));
    memory.set(data, core.MACHINE_MEMORY + page16k * 0x4000);
}

/* Spectrum keyboard matrix: row -> keys, bit 0 first. */
const MATRIX = [
    ['CAPS', 'Z', 'X', 'C', 'V'],
    ['A', 'S', 'D', 'F', 'G'],
    ['Q', 'W', 'E', 'R', 'T'],
    ['1', '2', '3', '4', '5'],
    ['0', '9', '8', '7', '6'],
    ['P', 'O', 'I', 'U', 'Y'],
    ['ENTER', 'L', 'K', 'J', 'H'],
    ['SPACE', 'SYM', 'M', 'N', 'B'],
];
function keyPosition(name) {
    for (let row = 0; row < 8; row++) {
        const col = MATRIX[row].indexOf(name);
        if (col >= 0) return [row, 1 << col];
    }
    throw new Error('unknown key: ' + name);
}

function runFrames(n) {
    for (let i = 0; i < n; i++) core.runFrame();
}

/* Hold the given keys for a few frames, then release and settle. The ROM
   keyboard routine needs the key held across several interrupts to register,
   and released for several more before it will accept the next one. */
function pressKeys(names, holdFrames = 4, gapFrames = 6) {
    const positions = names.map(keyPosition);
    for (const [row, mask] of positions) core.keyDown(row, mask);
    runFrames(holdFrames);
    for (const [row, mask] of positions) core.keyUp(row, mask);
    runFrames(gapFrames);
}

core.setMachineType(machineType);
for (const [file, page] of ROMS_BY_MACHINE[machineType]) loadRom(file, page);
core.setMachineType(machineType);   // reset again now the ROM is in place
core.setAudioSamplesPerFrame(0);

runFrames(200);                     // let the ROM finish its boot

pressKeys(['J']);                   // LOAD  (keyword on the J key)
pressKeys(['SYM', 'P']);            // "
pressKeys(['SYM', 'P']);            // "
pressKeys(['ENTER']);

/* Park the machine on the exact address the tape trap fires at, not merely
   somewhere inside the loading routine.

   This matters: with tape traps enabled the emulator never plays the tape, it
   just waits for the trap. A snapshot stopped anywhere else sits in LD-BYTES
   waiting for edges that will never arrive, and the load hangs after the
   header. Every stock loader snapshot is parked on 0x056b for this reason. */
const TRAP_PC = 0x056b;

core.setTapeTraps(true);   // runFrame returns 2 the moment we reach the trap
let reached = false;
for (let i = 0; i < 400 && !reached; i++) {
    reached = (core.runFrame() === 2);
}
if (!reached) {
    console.log(`FAILED: never hit the tape trap; PC = 0x${core.getPC().toString(16)}`);
    exit(1);
}
if (core.getPC() !== TRAP_PC) {
    console.log(
        `FAILED: trapped at 0x${core.getPC().toString(16)}, expected 0x${TRAP_PC.toString(16)}`
    );
    exit(1);
}
console.log(`parked on the tape trap at PC = 0x${core.getPC().toString(16)}`);

/* --- serialise to SZX ------------------------------------------------- */
const blocks = [];
function block(id, payload) {
    const b = Buffer.alloc(8 + payload.length);
    b.write(id, 0, 'ascii');
    b.writeUInt32LE(payload.length, 4);
    payload.copy(b, 8);
    blocks.push(b);
}

const regs = new Uint16Array(core.memory.buffer, core.REGISTERS, 12);
const z80r = Buffer.alloc(37);
for (let i = 0; i < 12; i++) z80r.writeUInt16LE(regs[i], i * 2);   // AF..SP
z80r.writeUInt16LE(regs[10], 20);              // SP
z80r.writeUInt16LE(core.getPC(), 22);
z80r.writeUInt16BE(regs[11], 24);              // IR, big-endian
z80r.writeUInt8(core.getIFF1() ? 1 : 0, 26);
z80r.writeUInt8(core.getIFF2() ? 1 : 0, 27);
z80r.writeUInt8(core.getIM(), 28);
z80r.writeUInt32LE(core.getTStates(), 29);
z80r.writeUInt8(core.getHalted() ? 0x02 : 0x00, 34);   // chFlags
block('Z80R', z80r);

/* Read the border colour back out of the frame buffer rather than assuming
   one: byte 0 of the pixel log is the first top-border byte, which is the
   border colour the ULA was displaying. Hardcoding it gave the loader a
   black border where every other loader snapshot has white. */
const frameBuffer = new Uint8Array(core.memory.buffer, core.FRAME_BUFFER, 1);
const spcr = Buffer.alloc(8);
spcr.writeUInt8(frameBuffer[0] & 0x07, 0);
block('SPCR', spcr);
console.log(`border = ${frameBuffer[0] & 0x07}`);

/* SCLD block, in the order Fuse writes it: horizontal select register
   (port 0xF4) then display enhancement control (port 0xFF). The TC2048 has
   no MMU, so 0xF4 is written as zero; on it that port has A0 low and would
   read back the keyboard. */
const scld = Buffer.alloc(2);
scld.writeUInt8(0, 0);
scld.writeUInt8(core.readPort(0x00ff), 1);
block('SCLD', scld);
console.log(`0xFF = 0x${scld[1].toString(16)}`);

/* RAM banks, zlib-compressed as the other loader snapshots are. */
for (const bank of [5, 2, 0]) {
    const raw = Buffer.from(
        memory.buffer, core.MACHINE_MEMORY + bank * 0x4000, 0x4000
    );
    const packed = zlib.deflateSync(raw);
    const ramp = Buffer.alloc(3 + packed.length);
    ramp.writeUInt16LE(1, 0);         // bit 0 set = compressed
    ramp.writeUInt8(bank, 2);
    packed.copy(ramp, 3);
    block('RAMP', ramp);
}

const header = Buffer.alloc(8);
header.write('ZXST', 0, 'ascii');
header.writeUInt8(1, 4);
header.writeUInt8(4, 5);
header.writeUInt8(SZX_MACHINE_ID[machineType], 6);
header.writeUInt8(0, 7);

fs.writeFileSync(outPath, Buffer.concat([header, ...blocks]));
console.log(`wrote ${outPath}`);
