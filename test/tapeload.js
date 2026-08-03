/* End-to-end test of tape autoloading.

   Unit tests on the snapshot parser and the paging logic both passed while
   autoloading was broken on the Timex machines, because the failure only
   showed up once the loader snapshot, the ROM, the tape trap and the tape
   itself were all working together. So this test drives the whole path the
   browser drives: it loads a machine's ROMs, restores that machine's tape
   loader snapshot through the real parser, and runs frames while servicing
   tape traps exactly as runtime/worker.js does, then checks the program
   actually arrived in RAM.

   It mirrors runtime/jsspeccy.js (ROM pages, loader snapshot per machine) and
   runtime/worker.js (loadSnapshot, trapTapeLoad, the runFrame/resumeFrame
   loop). Keep those in step with this file. */
import * as fs from 'fs';
import { exit } from 'process';

import core from './core.js';
import { parseSZXFile } from '../runtime/snapshot.js';
import { TAPFile } from '../runtime/tape.js';

let failureCount = 0;
function check(testName, label, actual, expected) {
    if (actual !== expected) {
        failureCount++;
        console.log(`FAIL ${testName} / ${label}: expected ${expected}, got ${actual}`);
    }
}

const ROMS_BY_MACHINE = {
    48: [['48.rom', 10]],
    128: [['128-0.rom', 8], ['128-1.rom', 9]],
    // the Pentagon runs its own ROM 0 but shares the 128K's ROM 1
    5: [['pentagon-0.rom', 12], ['128-1.rom', 9], ['trdos.rom', 13]],
    2048: [['tc2048.rom', 14]],
    2068: [['2068-home.rom', 15], ['2068-exrom.rom', 16]],
};
const LOADER_BY_MACHINE = {
    48: 'tape_48.szx',
    128: 'tape_128.szx',
    5: 'tape_pentagon.szx',
    2048: 'tape_2048.szx',
    2068: 'tape_2068.szx',
};

const memory = new Uint8Array(core.memory.buffer);
const registerPairs = new Uint16Array(core.memory.buffer, core.REGISTERS, 12);

function readStatic(path) {
    return fs.readFileSync(new URL('../static/' + path, import.meta.url));
}

/* A one-line BASIC program - 10 REM followed by a run of marker bytes - as a
   two block .tap. LOAD "" wants a PROGRAM header, so a bare CODE block would
   be skipped by the ROM rather than loaded. */
const MARKER = 0xa5;
const MARKER_LENGTH = 13;

function makeTAP() {
    const line = new Uint8Array(1 + MARKER_LENGTH + 1);
    line[0] = 0xea;                          // REM
    line.fill(MARKER, 1, 1 + MARKER_LENGTH);
    line[line.length - 1] = 0x0d;            // ENTER

    const program = new Uint8Array(4 + line.length);
    program[0] = 0x00; program[1] = 0x0a;    // line number 10, big-endian
    program[2] = line.length & 0xff; program[3] = line.length >> 8;
    program.set(line, 4);

    const header = new Uint8Array(18);
    header[0] = 0x00;                        // header block flag
    header[1] = 0x00;                        // PROGRAM
    const name = 'TESTBLOCK ';
    for (let i = 0; i < 10; i++) header[2 + i] = name.charCodeAt(i);
    header[12] = program.length & 0xff; header[13] = program.length >> 8;
    header[14] = 0x00; header[15] = 0x80;    // no autostart line
    header[16] = program.length & 0xff; header[17] = program.length >> 8;

    const data = new Uint8Array(1 + program.length);
    data[0] = 0xff;                          // data block flag
    data.set(program, 1);

    const withChecksum = (block) => {
        const out = new Uint8Array(block.length + 1);
        out.set(block);
        let checksum = 0;
        for (const byte of block) checksum ^= byte;
        out[block.length] = checksum;
        return out;
    };
    const blocks = [withChecksum(header), withChecksum(data)];

    const tap = new Uint8Array(blocks.reduce((n, b) => n + 2 + b.length, 0));
    let offset = 0;
    for (const block of blocks) {
        tap[offset++] = block.length & 0xff;
        tap[offset++] = block.length >> 8;
        tap.set(block, offset);
        offset += block.length;
    }
    return tap.buffer;
}

/* --- the parts of runtime/worker.js this test exercises ----------------- */

let machineType = 48;
let tape = null;

function loadSnapshot(snapshot) {
    machineType = snapshot.model;
    core.setMachineType(snapshot.model);
    for (let page in snapshot.memoryPages) {
        memory.set(snapshot.memoryPages[page], core.MACHINE_MEMORY + page * 0x4000);
    }
    ['AF', 'BC', 'DE', 'HL', 'AF_', 'BC_', 'DE_', 'HL_', 'IX', 'IY', 'SP', 'IR'].forEach(
        (r, i) => { registerPairs[i] = snapshot.registers[r]; }
    );
    core.setPC(snapshot.registers.PC);
    core.setIFF1(snapshot.registers.iff1);
    core.setIFF2(snapshot.registers.iff2);
    core.setIM(snapshot.registers.im);
    core.setHalted(!!snapshot.halted);
    core.writePort(0x00fe, snapshot.ulaState.borderColour);
    if (snapshot.model == 128 || snapshot.model == 5) {
        core.writePort(0x7ffd, snapshot.ulaState.pagingFlags);
    }
    if ('timexScreenMode' in snapshot.ulaState) {
        core.writePort(0x00ff, snapshot.ulaState.timexScreenMode);
    }
    if (snapshot.model == 2068 && 'timexBankEnable' in snapshot.ulaState) {
        core.writePort(0x00f4, snapshot.ulaState.timexBankEnable);
    }
    core.setTStates(snapshot.tstates);
}

function trapTapeLoad() {
    if (!tape) return;
    const block = tape.getNextLoadableBlock();
    if (!block) return;

    const af_ = registerPairs[4];
    const expectedBlockType = af_ >> 8;
    const shouldLoad = af_ & 0x0001;
    let addr = registerPairs[8];             // IX
    const requestedLength = registerPairs[2];  // DE
    const actualBlockType = block[0];

    let success = true;
    if (expectedBlockType != actualBlockType) {
        success = false;
    } else if (shouldLoad) {
        let offset = 1;
        let loadedBytes = 0;
        let checksum = actualBlockType;
        while (loadedBytes < requestedLength) {
            if (offset >= block.length) { success = false; break; }
            const byte = block[offset++];
            loadedBytes++;
            core.poke(addr, byte);
            addr = (addr + 1) & 0xffff;
            checksum ^= byte;
        }
        success &= (offset < block.length);
        if (success) success = (checksum === block[offset]);
    }

    if (success) registerPairs[0] |= 0x0001; else registerPairs[0] &= 0xfffe;
    core.setPC(machineType == 2068 ? 0x0188 : 0x05e2);
}

/* --- the test ---------------------------------------------------------- */

const MAX_FRAMES = 200;

function findMarkerRun() {
    let run = 0;
    for (let addr = 0x4000; addr <= 0xffff; addr++) {
        if (core.peek(addr) === MARKER) {
            if (++run === MARKER_LENGTH) return addr - (MARKER_LENGTH - 1);
        } else {
            run = 0;
        }
    }
    return -1;
}

function testAutoLoad(mt) {
    const name = `autoload on machine ${mt}`;

    core.setMachineType(mt);
    for (const [file, page] of ROMS_BY_MACHINE[mt]) {
        memory.set(readStatic('roms/' + file), core.MACHINE_MEMORY + page * 0x4000);
    }
    core.setMachineType(mt);   // reset again now the ROM is in place
    core.setAudioSamplesPerFrame(0);
    core.setTapeTraps(true);
    machineType = mt;

    const szx = readStatic('tapeloaders/' + LOADER_BY_MACHINE[mt]);
    const snapshot = parseSZXFile(
        szx.buffer.slice(szx.byteOffset, szx.byteOffset + szx.byteLength)
    );
    check(name, 'loader snapshot model', snapshot.model, mt);
    check(name, 'loader snapshot is not halted', snapshot.halted, false);

    tape = new TAPFile(makeTAP());
    loadSnapshot(snapshot);

    let trapCount = 0;
    for (let frame = 0; frame < MAX_FRAMES && trapCount < 2; frame++) {
        let status = core.runFrame();
        while (status) {
            if (status !== 2) {
                failureCount++;
                console.log(`FAIL ${name}: runFrame returned ${status}`);
                return;
            }
            trapCount++;
            trapTapeLoad();
            status = core.resumeFrame();
        }
    }

    /* Two traps: the header block, then the data block. Stopping after one
       is how the Timex machines failed - the loader took the header and the
       ROM never came back for the program. */
    check(name, 'tape blocks loaded', trapCount, 2);
    check(name, 'program reached RAM', findMarkerRun() >= 0, true);
}

for (const mt of [48, 128, 5, 2048, 2068]) testAutoLoad(mt);

if (failureCount) {
    console.log(`${failureCount} tape loading test failure(s)`);
    exit(1);
}
console.log('Tape loading tests passed');
