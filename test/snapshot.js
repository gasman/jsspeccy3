import { exit } from 'process';

import { parseZ80File, parseSZXFile } from '../runtime/snapshot.js';

let failureCount = 0;
function check(testName, label, actual, expected) {
    if (actual !== expected) {
        failureCount++;
        console.log(`FAIL ${testName} / ${label}: expected ${expected}, got ${actual}`);
    }
}

/* Build a minimal but structurally valid .z80 version 3 file. */
function makeZ80v3({ machineId, byte35 }) {
    const ADDITIONAL_HEADER_LENGTH = 54;
    const headerLength = 32 + ADDITIONAL_HEADER_LENGTH;
    const pageIds = [4, 5, 8];             // the three 48K pages
    const pageBlockLength = 3 + 0x4000;    // uncompressed
    const bytes = new Uint8Array(headerLength + pageIds.length * pageBlockLength);
    const view = new DataView(bytes.buffer);

    view.setUint16(6, 0x0000, true);       // PC == 0 marks a v2/v3 file
    view.setUint8(12, 0x04);               // border colour 2
    view.setUint16(30, ADDITIONAL_HEADER_LENGTH, true);
    view.setUint16(32, 0x8000, true);      // real PC
    view.setUint8(34, machineId);
    view.setUint8(35, byte35);
    view.setUint16(55, 0x0000, true);
    view.setUint8(57, 0x00);

    let offset = headerLength;
    for (const pageId of pageIds) {
        view.setUint16(offset, 0xffff, true);   // 0xffff == stored uncompressed
        view.setUint8(offset + 2, pageId);
        bytes[offset + 3] = 0xa5;               // marker byte per page
        offset += pageBlockLength;
    }
    return bytes.buffer;
}

function testZ80TC2048() {
    const name = 'z80 hardware mode 14 (TC2048)';
    const snapshot = parseZ80File(makeZ80v3({ machineId: 14, byte35: 0x06 }));
    check(name, 'model', snapshot.model, 2048);
    check(name, 'screen mode', snapshot.ulaState.timexScreenMode, 0x06);
    check(name, 'paging flags absent', 'pagingFlags' in snapshot.ulaState, false);
    // TC2048 uses the 48K memory layout
    check(name, 'page 5 loaded', snapshot.memoryPages[5][0], 0xa5);
    check(name, 'page 2 loaded', snapshot.memoryPages[2][0], 0xa5);
    check(name, 'page 0 loaded', snapshot.memoryPages[0][0], 0xa5);
}

function testZ80StillDetects48KAnd128K() {
    const name = 'z80 regression';
    const snap48 = parseZ80File(makeZ80v3({ machineId: 0, byte35: 0x00 }));
    check(name, '48K model', snap48.model, 48);
    const snap128 = parseZ80File(makeZ80v3({ machineId: 4, byte35: 0x11 }));
    check(name, '128K model', snap128.model, 128);
    check(name, '128K paging flags', snap128.ulaState.pagingFlags, 0x11);
}

/* Build a minimal .szx with a machine id, an SPCR block and an SCLD block. */
function makeSZX({ machineId, sclrFirst }) {
    const blocks = [];
    const pushBlock = (id, payload) => {
        const b = new Uint8Array(8 + payload.length);
        for (let i = 0; i < 4; i++) b[i] = id.charCodeAt(i);
        new DataView(b.buffer).setUint32(4, payload.length, true);
        b.set(payload, 8);
        blocks.push(b);
    };
    const spcr = new Uint8Array([0x02, 0x11, 0x00, 0x00, 0, 0, 0, 0]);
    const scld = new Uint8Array([0x06, 0x00]);
    if (sclrFirst) {
        pushBlock('SCLD', scld);
        pushBlock('SPCR', spcr);
    } else {
        pushBlock('SPCR', spcr);
        pushBlock('SCLD', scld);
    }

    const total = 8 + blocks.reduce((n, b) => n + b.length, 0);
    const bytes = new Uint8Array(total);
    bytes.set([0x5a, 0x58, 0x53, 0x54], 0);   // 'ZXST'
    bytes[4] = 1;   // major
    bytes[5] = 4;   // minor
    bytes[6] = machineId;
    bytes[7] = 0;
    let offset = 8;
    for (const b of blocks) { bytes.set(b, offset); offset += b.length; }
    return bytes.buffer;
}

function testSZXTC2048() {
    const name = 'szx machine id 8 (TC2048)';
    const snapshot = parseSZXFile(makeSZX({ machineId: 8, sclrFirst: false }));
    check(name, 'model', snapshot.model, 2048);
    check(name, 'border', snapshot.ulaState.borderColour, 0x02);
    check(name, 'screen mode', snapshot.ulaState.timexScreenMode, 0x06);
}

function testSZXBlockOrderDoesNotClobber() {
    const name = 'szx SCLD before SPCR';
    const snapshot = parseSZXFile(makeSZX({ machineId: 8, sclrFirst: true }));
    check(name, 'screen mode survives', snapshot.ulaState.timexScreenMode, 0x06);
    check(name, 'border still parsed', snapshot.ulaState.borderColour, 0x02);
}

testZ80TC2048();
testZ80StillDetects48KAnd128K();
testSZXTC2048();
testSZXBlockOrderDoesNotClobber();

if (failureCount) {
    console.log(`${failureCount} snapshot test failure(s)`);
    exit(1);
}
console.log('Snapshot tests passed');
