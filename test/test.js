import { argv, exit } from 'process';
import * as fs from 'fs';
import * as readline from 'readline';

import * as core from '../dist/jsspeccy-core.wasm';

if (argv.length != 4) {
    console.log("Usage: node test.js path/to/tests.in path/to/tests.expected");
    exit(1);
}

const inputFilename = argv[2];
const resultsFilename = argv[3];

const REGISTERS_ADDR = 222724;
const registers = new Uint16Array(core.memory.buffer, REGISTERS_ADDR, 12);

core.setMachineType(1212);


const inFile = fs.createReadStream(inputFilename);
const reader = readline.createInterface({input: inFile, crlfDelay: Infinity});
const getLine = (function () {
    const getLineGen = (async function* () {
        for await (const line of reader) {
            yield line;
        }
    })();
    return async () => ((await getLineGen.next()).value);
})();

const resultsFile = fs.createReadStream(resultsFilename);
const resultsReader = readline.createInterface({input: resultsFile, crlfDelay: Infinity});
const getResultLine = (function () {
    const getLineGen = (async function* () {
        for await (const line of resultsReader) {
            yield line;
        }
    })();
    return async () => ((await getLineGen.next()).value);
})();

function assertEqual(actual, expected, testName, reg) {
    if (actual != expected) {
        console.log(testName, reg, '- expected', expected.toString(16), 'but got', actual.toString(16));
    }
}

while (true) {
    const line = await getLine();
    if (line === undefined) break;
    if (!line) continue;

    core.reset();

    const testName = line;
    const mainRegistersLine = await getLine();
    const [af, bc, de, hl, af_, bc_, de_, hl_, ix, iy, sp, pc] = mainRegistersLine.split(/\s+/).map(x => parseInt(x, 16));
    const auxRegistersLine = await getLine();
    const auxRegistersStrings = auxRegistersLine.split(/\s+/)
    // tstates is in decimal, just to keep us on our toes
    const tstates = parseInt(auxRegistersStrings.pop(), 10);
    const [i, r, iff1, iff2, im, halted] = auxRegistersLine.split(/\s+/).map(x => parseInt(x, 16));
    while (true) {
        const memState = await getLine();
        if (memState == '-1') break;
        let [addr, ...vals] = memState.split(/\s+/).map(x => parseInt(x, 16));
        for (const val of vals) {
            if (val == -1) break;
            core.poke(addr++, val);
        }
    }
    registers[0] = af;
    registers[1] = bc;
    registers[2] = de;
    registers[3] = hl;
    registers[4] = af_;
    registers[5] = bc_;
    registers[6] = de_;
    registers[7] = hl_;
    registers[8] = ix;
    registers[9] = iy;
    registers[10] = sp;
    registers[11] = (i << 8) | r;
    core.setPC(pc);
    core.setIFF1(iff1);
    core.setIFF2(iff2);
    core.setIM(im);
    core.setHalted(halted);

    const status = core.runUntil(tstates);

    let resultLine;
    while (true) {
        resultLine = await getResultLine();
        if (resultLine === undefined) {
            console.log("unexpected EOF in results file!");
            break;
        } else if (resultLine) {
            break;
        }
    }
    if (resultLine != testName) {
        console.log(
            "Test name in results file does not match: expected", testName, "but got", resultLine
        );
    }
    // skip event lines for now
    resultLine = await getResultLine();
    while (resultLine.startsWith(' ')) {
        resultLine = await getResultLine();
    }
    const mainRegistersOutLine = resultLine;
    const [newaf, newbc, newde, newhl, newaf_, newbc_, newde_, newhl_, newix, newiy, newsp, newpc] = mainRegistersOutLine.split(/\s+/).map(x => parseInt(x, 16));
    const auxRegistersOutLine = await getResultLine()
    const auxRegistersOutStrings = auxRegistersOutLine.split(/\s+/);
    const newtstates = parseInt(auxRegistersOutStrings.pop(), 10);
    const [newi, newr, newiff1, newiff2, newim, newhalted] = auxRegistersOutStrings.map(x => parseInt(x, 16));

    if (status != -1) {
        console.log(testName, 'failed with unknown opcode', status.toString(16));

        while (await getResultLine()) {
            // discard memory lines
        }
    } else {
        while (resultLine = await getResultLine()) {
            // check memory span
            let [addr, ...vals] = resultLine.split(/\s+/).map(x => parseInt(x, 16));
            for (const val of vals) {
                if (val == -1) break;
                const actual = core.peek(addr)
                if (actual != val) {
                    console.log(testName, 'mem', addr.toString(16), '- expected', val.toString(16), 'but got', actual.toString(16));
                }
                addr++;
            }
        };

        assertEqual(registers[0], newaf, testName, 'AF');
        assertEqual(registers[1], newbc, testName, 'BC');
        assertEqual(registers[2], newde, testName, 'DE');
        assertEqual(registers[3], newhl, testName, 'HL');
        assertEqual(registers[4], newaf_, testName, 'AF_');
        assertEqual(registers[5], newbc_, testName, 'BC_');
        assertEqual(registers[6], newde_, testName, 'DE_');
        assertEqual(registers[7], newhl_, testName, 'HL_');
        assertEqual(registers[8], newix, testName, 'IX');
        assertEqual(registers[9], newiy, testName, 'IY');
        assertEqual(registers[10], newsp, testName, 'SP');
        assertEqual(registers[11], (newi << 8) | newr, testName, 'IR');
        assertEqual(core.getPC(), newpc, testName, 'PC');
        assertEqual(core.getIFF1(), newiff1, testName, 'IFF1');
        assertEqual(core.getIFF2(), newiff2, testName, 'IFF2');
        assertEqual(core.getIM(), newim, testName, 'IM');
        assertEqual(core.getHalted(), newhalted, testName, 'halted');
        assertEqual(core.getTStates(), newtstates, testName, 'tstates');
    }
}

inFile.close();
resultsFile.close();