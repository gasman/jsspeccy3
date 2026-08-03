import { exit } from 'process';
import core from './core.js';

/* The core pages memory in 8K units, so each 16K bank occupies two
   consecutive page numbers: 8K page 2n covers the same bytes as 16K page n.
   These tests read the page maps directly, which is the only way to assert on
   ROM paging without loading real ROM images. */
const readMap = new Uint8Array(core.memory.buffer, core.MEMORY_PAGE_READ_MAP, 8);
const writeMap = new Uint8Array(core.memory.buffer, core.MEMORY_PAGE_WRITE_MAP, 8);

let failureCount = 0;
function checkMap(testName, label, actual, expected) {
    const a = Array.from(actual).join(',');
    const e = expected.join(',');
    if (a !== e) {
        failureCount++;
        console.log(`FAIL ${testName} / ${label}: expected [${e}], got [${a}]`);
    }
}
function check(testName, label, actual, expected) {
    if (actual !== expected) {
        failureCount++;
        console.log(`FAIL ${testName} / ${label}: expected ${expected}, got ${actual}`);
    }
}

function testResetMaps() {
    const name = 'reset page maps';
    core.setMachineType(48);
    checkMap(name, '48K read', readMap, [20, 21, 10, 11, 4, 5, 0, 1]);
    checkMap(name, '48K write', writeMap, [22, 23, 10, 11, 4, 5, 0, 1]);

    core.setMachineType(128);
    checkMap(name, '128K read', readMap, [16, 17, 10, 11, 4, 5, 0, 1]);

    core.setMachineType(5);
    checkMap(name, 'Pentagon read', readMap, [24, 25, 10, 11, 4, 5, 0, 1]);

    core.setMachineType(2048);
    checkMap(name, 'TC2048 read', readMap, [28, 29, 10, 11, 4, 5, 0, 1]);
}

function test128RamBankSelect() {
    const name = '128K RAM bank select';
    core.setMachineType(128);
    for (let bank = 0; bank < 8; bank++) {
        core.writePort(0x7ffd, bank);
        // 16K bank n occupies 8K pages 2n and 2n+1, in slots 6 and 7
        checkMap(name, `bank ${bank}`, readMap.slice(6, 8), [bank * 2, bank * 2 + 1]);
        checkMap(name, `bank ${bank} write`, writeMap.slice(6, 8), [bank * 2, bank * 2 + 1]);
    }
}

function test128RamBankIsAddressable() {
    /* Both 8K halves of the paged bank must be reachable, which is what would
       break if only slot 6 were updated. */
    const name = '128K bank addressable';
    core.setMachineType(128);
    for (let bank = 0; bank < 8; bank++) {
        core.writePort(0x7ffd, bank);
        core.poke(0xc000, 0xa0 + bank);   // low half  -> slot 6
        core.poke(0xe000, 0xb0 + bank);   // high half -> slot 7
    }
    for (let bank = 0; bank < 8; bank++) {
        core.writePort(0x7ffd, bank);
        check(name, `bank ${bank} low`, core.peek(0xc000), 0xa0 + bank);
        check(name, `bank ${bank} high`, core.peek(0xe000), 0xb0 + bank);
    }
}

function test128RomSelect() {
    const name = '128K ROM select';
    core.setMachineType(128);
    core.writePort(0x7ffd, 0x00);
    checkMap(name, 'ROM 0', readMap.slice(0, 2), [16, 17]);
    core.writePort(0x7ffd, 0x10);
    checkMap(name, 'ROM 1', readMap.slice(0, 2), [18, 19]);
}

function testPagingLock() {
    const name = '128K paging lock';
    core.setMachineType(128);
    core.writePort(0x7ffd, 0x20 | 0x03);        // select bank 3 and lock
    checkMap(name, 'locked selection', readMap.slice(6, 8), [6, 7]);
    core.writePort(0x7ffd, 0x05);               // must be ignored
    checkMap(name, 'still bank 3', readMap.slice(6, 8), [6, 7]);
}

function test48KPagingIgnored() {
    const name = '48K ignores paging';
    core.setMachineType(48);
    const before = Array.from(readMap);
    core.writePort(0x7ffd, 0x07);
    checkMap(name, 'unchanged', readMap, before);
}

function testScreenBankFollowsPaging() {
    /* Bit 3 of 0x7ffd switches the displayed screen from bank 5 to bank 7.
       Poke a marker into each and confirm the framebuffer follows. */
    const name = 'shadow screen select';
    const FRAME_BUFFER_SIZE = 0x6a00;
    const frame = new Uint8Array(core.memory.buffer, core.FRAME_BUFFER, FRAME_BUFFER_SIZE);
    const firstScreenByte = 0x0f00 + 0x10;

    core.setMachineType(128);
    core.setTapeTraps(false);

    core.writePort(0x7ffd, 0x05);   // page bank 5 in at 0xc000 so we can write it
    core.poke(0xc000, 0x5a);
    core.writePort(0x7ffd, 0x07);
    core.poke(0xc000, 0x77);

    core.writePort(0x7ffd, 0x00);   // normal screen = bank 5
    core.runFrame();
    check(name, 'normal screen', frame[firstScreenByte], 0x5a);

    core.writePort(0x7ffd, 0x08);   // shadow screen = bank 7
    core.runFrame();
    check(name, 'shadow screen', frame[firstScreenByte], 0x77);
}

testResetMaps();
test128RamBankSelect();
test128RamBankIsAddressable();
test128RomSelect();
testPagingLock();
test48KPagingIgnored();
testScreenBankFollowsPaging();

/* --- Timex TC2068 --------------------------------------------------- */

const HOME_READ = [30, 31, 10, 11, 4, 5, 0, 1];
const EXROM_PAGE = 32;
const EMPTY_DOCK_PAGE = 33;

function test2068ResetMap() {
    const name = 'TC2068 reset map';
    core.setMachineType(2068);
    checkMap(name, 'read', readMap, HOME_READ);
    checkMap(name, 'write', writeMap, [22, 23, 10, 11, 4, 5, 0, 1]);
    check(name, 'bank enable clear', core.readPort(0x00f4), 0);
}

function test2068BankEnablePerChunk() {
    /* Port 0xF4 is one bit per 8K chunk. With bit 7 of the SCLD register set,
       enabled chunks come from EXROM -- which is only 8K, so it appears
       mirrored in every chunk switched to it. */
    const name = 'TC2068 port 0xF4';
    core.setMachineType(2068);
    core.writePort(0x00ff, 0x80);          // select EXROM
    for (let chunk = 0; chunk < 8; chunk++) {
        core.writePort(0x00f4, 1 << chunk);
        const expected = HOME_READ.slice();
        expected[chunk] = EXROM_PAGE;
        checkMap(name, `chunk ${chunk}`, readMap, expected);
    }
    // several at once, all mirroring the same 8K EXROM
    core.writePort(0x00f4, 0b00000011);
    checkMap(name, 'chunks 0+1', readMap.slice(0, 2), [EXROM_PAGE, EXROM_PAGE]);
    // and back off again
    core.writePort(0x00f4, 0x00);
    checkMap(name, 'all off', readMap, HOME_READ);
}

function test2068DockVsExrom() {
    const name = 'TC2068 DOCK vs EXROM';
    core.setMachineType(2068);
    core.writePort(0x00f4, 0x01);          // enable chunk 0
    core.writePort(0x00ff, 0x00);          // bit 7 clear -> DOCK
    check(name, 'dock selected', readMap[0], EMPTY_DOCK_PAGE);
    core.writePort(0x00ff, 0x80);          // bit 7 set -> EXROM
    check(name, 'exrom selected', readMap[0], EXROM_PAGE);
    core.writePort(0x00ff, 0x00);
    check(name, 'back to dock', readMap[0], EMPTY_DOCK_PAGE);
}

function test2068EmptyDockReadsFF() {
    const name = 'TC2068 empty dock';
    core.setMachineType(2068);
    core.writePort(0x00ff, 0x00);          // DOCK, no cartridge
    core.writePort(0x00f4, 0x01);          // chunk 0 -> dock
    check(name, 'reads 0xff', core.peek(0x0000), 0xff);
    check(name, 'reads 0xff at top of chunk', core.peek(0x1fff), 0xff);
}

function test2068BankSwitchIsReadOnly() {
    const name = 'TC2068 alt bank read-only';
    core.setMachineType(2068);
    core.writePort(0x00ff, 0x80);
    core.writePort(0x00f4, 0x01);
    check(name, 'writes go to scratch', writeMap[0], 22);
}

function test2068ScreenModeBitsUnaffectedByBank() {
    /* Bit 7 must not disturb the video mode bits, and vice versa. */
    const name = 'TC2068 SCLD bits';
    core.setMachineType(2068);
    core.writePort(0x00ff, 0x86);          // hi-res + EXROM
    check(name, 'readback', core.readPort(0x00ff), 0x86);
    core.writePort(0x00f4, 0x01);
    check(name, 'exrom still selected', readMap[0], EXROM_PAGE);
}

function test2068AYPorts() {
    /* The AY sits at 0xF5/0xF6, not the 128K's 0xFFFD/0xBFFD. 0xF6 has A0
       low, so a naive decode would also hit the ULA and move the border. */
    const name = 'TC2068 AY';
    core.setMachineType(2068);
    core.writePort(0x00f5, 0x08);          // select register 8 (volume A)
    core.writePort(0x00f6, 0x0f);
    check(name, 'register 8 readback', core.readPort(0x00f6), 0x0f);

    core.writePort(0x00f5, 0x00);          // tone A fine
    core.writePort(0x00f6, 0x55);
    check(name, 'register 0 readback', core.readPort(0x00f6), 0x55);
    core.writePort(0x00f5, 0x08);
    check(name, 'register 8 still set', core.readPort(0x00f6), 0x0f);
}

function test2068AYDoesNotTouchBorder() {
    const name = 'TC2068 AY vs border';
    const FRAME_BUFFER_SIZE = 0x6a00;
    const frame = new Uint8Array(core.memory.buffer, core.FRAME_BUFFER, FRAME_BUFFER_SIZE);
    core.setMachineType(2068);
    core.setTapeTraps(false);
    core.writePort(0x00fe, 0x02);          // border red
    core.runFrame();
    check(name, 'border before', frame[0], 0x02);
    core.writePort(0x00f5, 0x07);
    core.writePort(0x00f6, 0x3f);          // would be border 7 if it hit the ULA
    core.runFrame();
    check(name, 'border after AY write', frame[0], 0x02);
}

function test48KAndTC2048IgnoreTimexPorts() {
    /* Ports 0xF4 and 0xF6 both have A0 low, so on a machine without the Timex
       MMU they belong to the ULA and must still set the border. Asserting only
       that the page map is unchanged is not enough: that also holds if the
       Timex branch wrongly swallows the write. */
    const name = 'non-2068 ignores 0xF4';
    const FRAME_BUFFER_SIZE = 0x6a00;
    const frame = new Uint8Array(core.memory.buffer, core.FRAME_BUFFER, FRAME_BUFFER_SIZE);
    for (const machine of [48, 128, 2048]) {
        core.setMachineType(machine);
        core.setTapeTraps(false);
        const before = Array.from(readMap);
        core.writePort(0x00f4, 0x03);
        checkMap(name, `machine ${machine} map`, readMap, before);
        core.runFrame();
        check(name, `machine ${machine} border via 0xF4`, frame[0], 0x03);

        core.writePort(0x00f6, 0x05);
        core.runFrame();
        check(name, `machine ${machine} border via 0xF6`, frame[0], 0x05);
    }
}

test2068ResetMap();
test2068BankEnablePerChunk();
test2068DockVsExrom();
test2068EmptyDockReadsFF();
test2068BankSwitchIsReadOnly();
test2068ScreenModeBitsUnaffectedByBank();
test2068AYPorts();
test2068AYDoesNotTouchBorder();
test48KAndTC2048IgnoreTimexPorts();

if (failureCount) {
    console.log(`${failureCount} paging test failure(s)`);
    exit(1);
}
console.log('Paging tests passed');
