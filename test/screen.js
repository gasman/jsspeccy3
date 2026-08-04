import { exit } from 'process';
import core from './core.js';

const FRAME_BUFFER_SIZE = 0x6a00;
const MODE_LOG_OFFSET = 0x6600;

/* Frame buffer landmarks, per tech_notes.md.
   Main screen line N starts at 0x0f00 + N * 0x60, and its 32 cells of
   (bitmap, attr) pairs start 0x10 bytes into that, after the left border. */
const screenLine = (n) => 0x0f00 + n * 0x60 + 0x10;

const frame = new Uint8Array(core.memory.buffer, core.FRAME_BUFFER, FRAME_BUFFER_SIZE);

let failureCount = 0;
function check(testName, label, actual, expected) {
    if (actual !== expected) {
        failureCount++;
        console.log(
            `FAIL ${testName} / ${label}: expected 0x${expected.toString(16)}, got 0x${actual.toString(16)}`
        );
    }
}

function fail(testName, message) {
    failureCount++;
    console.log(`FAIL ${testName}: ${message}`);
}

/* Clear the 16K of RAM that page 5 holds, so tests never see stale bytes. */
function clearScreenRam() {
    for (let addr = 0x4000; addr < 0x8000; addr++) core.poke(addr, 0x00);
}

/* Select a machine and put it in a state where a whole frame will run.

   No ROM is loaded under test, so ROM pages read as zeroes, which the Z80
   executes as NOPs. PC therefore walks up through 0x056b -- the tape trap
   address -- at t ~= 5548, which would abort runFrame() with status 2 before
   the main screen is reached at t = 14335. Disable traps so the frame
   completes; testTapeTrap re-enables them deliberately. */
function selectMachine(type) {
    core.setMachineType(type);
    core.setTapeTraps(false);
    clearScreenRam();
}

function test48KBaseline() {
    const name = '48K baseline';
    selectMachine(48);
    core.poke(0x4000, 0xaa);   // line 0, cell 0 bitmap
    core.poke(0x5800, 0x47);   // line 0, cell 0 attribute
    core.runFrame();
    const p = screenLine(0);
    check(name, 'bitmap', frame[p], 0xaa);
    check(name, 'attr', frame[p + 1], 0x47);
}

function testTC2048StandardMode() {
    const name = 'TC2048 mode 0 (standard, DF0)';
    selectMachine(2048);
    core.writePort(0x00ff, 0x00);
    core.poke(0x4000, 0xaa);
    core.poke(0x5800, 0x47);
    core.runFrame();
    const p = screenLine(0);
    check(name, 'bitmap', frame[p], 0xaa);
    check(name, 'attr', frame[p + 1], 0x47);
}

function testTC2048TapeTrap() {
    const name = 'TC2048 tape trap';
    core.setMachineType(2048);
    core.setTapeTraps(true);
    core.setPC(0x056b);
    check(name, 'status', core.runFrame(), 2);
    core.setTapeTraps(false);
}

function testTC2048SCLDPortRoundTrip() {
    const name = 'TC2048 SCLD port';
    selectMachine(2048);
    core.writePort(0x00ff, 0x06);
    check(name, 'read back', core.readPort(0x00ff), 0x06);

    // port 0xFE must still drive the border, not the SCLD
    core.writePort(0x00fe, 0x02);
    check(name, 'unchanged by 0xFE', core.readPort(0x00ff), 0x06);

    // any port whose low byte is 0xff hits the SCLD
    core.writePort(0x7fff, 0x01);
    check(name, 'decoded on low byte', core.readPort(0xbfff), 0x01);

    core.reset();
    check(name, 'cleared by reset', core.readPort(0x00ff), 0x00);
}

function test48KPortFFUnaffected() {
    const name = '48K port 0xFF';
    selectMachine(48);
    // On a 48K the SCLD does not exist; 0xFF is the floating bus and a write
    // to it must not be swallowed by the Timex branch.
    core.writePort(0x00ff, 0x06);
    const result = core.readPort(0x00ff);
    if (result === 0x06) {
        fail(name, 'port 0xFF behaved as an SCLD register on a 48K');
    }
}

function testTC2048SecondDisplayFile() {
    const name = 'TC2048 mode 1 (DF1)';
    selectMachine(2048);
    core.writePort(0x00ff, 0x01);
    core.poke(0x4000, 0x11);   // DF0 - must be ignored
    core.poke(0x5800, 0x22);
    core.poke(0x6000, 0x3c);   // DF1 bitmap
    core.poke(0x7800, 0x12);   // DF1 attribute
    core.runFrame();
    const p = screenLine(0);
    check(name, 'bitmap', frame[p], 0x3c);
    check(name, 'attr', frame[p + 1], 0x12);
}

function testTC2048HiColour() {
    const name = 'TC2048 mode 2 (hi-colour)';
    selectMachine(2048);
    core.writePort(0x00ff, 0x02);
    // line 0: bitmap at 0x4000, attribute at 0x6000
    core.poke(0x4000, 0xaa);
    core.poke(0x6000, 0x21);
    // line 1: bitmap at 0x4100, attribute at 0x6100 - proves 8x1 attributes
    core.poke(0x4100, 0x55);
    core.poke(0x6100, 0x34);
    // the classic attribute file must be ignored entirely
    core.poke(0x5800, 0xff);
    core.runFrame();
    const p0 = screenLine(0);
    check(name, 'line 0 bitmap', frame[p0], 0xaa);
    check(name, 'line 0 attr', frame[p0 + 1], 0x21);
    const p1 = screenLine(1);
    check(name, 'line 1 bitmap', frame[p1], 0x55);
    check(name, 'line 1 attr', frame[p1 + 1], 0x34);
}

function testTC2048HiRes() {
    const name = 'TC2048 mode 6 (hi-res)';
    selectMachine(2048);
    core.writePort(0x00ff, 0x06);
    core.poke(0x4000, 0x11);
    core.poke(0x6000, 0x22);
    core.poke(0x4001, 0x33);
    core.poke(0x6001, 0x44);
    core.runFrame();
    const p = screenLine(0);
    check(name, 'byte 0 (DF0 n)', frame[p], 0x11);
    check(name, 'byte 1 (DF1 n)', frame[p + 1], 0x22);
    check(name, 'byte 2 (DF0 n+1)', frame[p + 2], 0x33);
    check(name, 'byte 3 (DF1 n+1)', frame[p + 3], 0x44);
}

function readModeLog() {
    const entries = [];
    for (let p = MODE_LOG_OFFSET; p < FRAME_BUFFER_SIZE; p += 4) {
        const index = frame[p] | (frame[p + 1] << 8);
        if (index === 0xffff) break;
        entries.push({ index, mode: frame[p + 2] });
    }
    return entries;
}

function testTC2048ModeLogSingleEntry() {
    const name = 'TC2048 mode log (no change)';
    selectMachine(2048);
    core.writePort(0x00ff, 0x02);
    core.runFrame();
    const log = readModeLog();
    check(name, 'entry count', log.length, 1);
    check(name, 'index', log[0].index, 0);
    check(name, 'mode', log[0].mode, 0x02);
}

function testTC2048MidFrameModeChange() {
    const name = 'TC2048 mid-frame mode change';
    selectMachine(2048);

    // DF0 and DF1 filled with distinguishable patterns across all 192 lines
    for (let y = 0; y < 192; y++) {
        const rowAddr = 0x4000 | ((y & 0xc0) << 5) | ((y & 0x07) << 8) | ((y & 0x38) << 2);
        core.poke(rowAddr, 0x11);
        core.poke(rowAddr + 0x2000, 0x22);
    }
    for (let i = 0; i < 0x300; i++) {
        core.poke(0x5800 + i, 0x33);   // DF0 attributes
        core.poke(0x7800 + i, 0x44);   // DF1 attributes
    }

    core.writePort(0x00ff, 0x00);      // start in mode 0

    /* Program at 0x8000 (page 2, uncontended, so timing is deterministic):
         21 00 03   LD HL,0x0300
         2B         DEC HL           6 T
         7C         LD A,H           4 T
         B5         OR L             4 T
         20 FB      JR NZ,-5        12 T taken
         3E 01      LD A,1
         01 FF 00   LD BC,0x00FF
         ED 79      OUT (C),A
         18 FE      JR -2            (spin)
       768 iterations x 26 T ~= 19968 T, so the OUT lands around screen line
       25, comfortably inside the 14335..57343 main screen window. The
       assertion below locates the change from the log rather than assuming
       exactly where it fell. */
    const program = [
        0x21, 0x00, 0x03,
        0x2b, 0x7c, 0xb5, 0x20, 0xfb,
        0x3e, 0x01,
        0x01, 0xff, 0x00,
        0xed, 0x79,
        0x18, 0xfe,
    ];
    program.forEach((byte, i) => core.poke(0x8000 + i, byte));
    core.setPC(0x8000);
    core.runFrame();

    const log = readModeLog();
    check(name, 'entry count', log.length, 2);
    if (log.length !== 2) return;
    check(name, 'first index', log[0].index, 0);
    check(name, 'first mode', log[0].mode, 0x00);
    check(name, 'second mode', log[1].mode, 0x01);

    const changeAt = log[1].index;
    const firstScreenByte = screenLine(0);
    const lastScreenByte = screenLine(191);
    if (changeAt <= firstScreenByte || changeAt >= lastScreenByte) {
        fail(name, `change at 0x${changeAt.toString(16)} is outside the main screen`);
        return;
    }

    // Before the change the ULA was reading DF0, after it DF1.
    check(name, 'bitmap before change', frame[firstScreenByte], 0x11);
    check(name, 'attr before change', frame[firstScreenByte + 1], 0x33);
    check(name, 'bitmap after change', frame[lastScreenByte], 0x22);
    check(name, 'attr after change', frame[lastScreenByte + 1], 0x44);
}

function test48KModeLogIsInert() {
    const name = '48K mode log';
    selectMachine(48);
    core.runFrame();
    const log = readModeLog();
    check(name, 'entry count', log.length, 1);
    check(name, 'mode', log[0].mode, 0x00);
}

test48KBaseline();
testTC2048StandardMode();
testTC2048ModeLogSingleEntry();
testTC2048MidFrameModeChange();
test48KModeLogIsInert();
testTC2048SecondDisplayFile();
testTC2048HiColour();
testTC2048HiRes();
testTC2048TapeTrap();
testTC2048SCLDPortRoundTrip();
test48KPortFFUnaffected();

if (failureCount) {
    console.log(`${failureCount} screen test failure(s)`);
    exit(1);
}
console.log('Screen tests passed');
