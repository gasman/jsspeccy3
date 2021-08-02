import { argv, exit } from 'process';
import * as fs from 'fs';
import * as readline from 'readline';

import instructionTable from './instructions.js';

if (argv.length != 4) {
    console.log("Usage: node gencore.js path/to/input.ts.in path/to/output.ts");
    exit(1);
}
const inputFilename = argv[2];
const outputFilename = argv[3];

const loadOpcodeTable = (filename, table, altTable) => {
    for (let line of fs.readFileSync(filename).toString().split("\n")) {
        let match = line.match(/^(\w+)\s+(.*)$/);
        if (match) {
            const code = parseInt(match[1], 16);
            const instruction = match[2];
            table[code] = instruction;
            if (altTable) {
                const altInstruction = (
                    instruction.replaceAll(/\bIX\b/g, 'IY')
                    .replaceAll(/\bIXH\b/g, 'IYH')
                    .replaceAll(/\bIXL\b/g, 'IYL')
                    .replaceAll(/prefix ddcb/g, 'prefix fdcb')
                );
                altTable[code] = altInstruction;
            }
        }
    }
}

const baseOpcodes = {};
loadOpcodeTable('generator/opcodes_base.txt', baseOpcodes);
const cbOpcodes = {};
loadOpcodeTable('generator/opcodes_cb.txt', cbOpcodes);
const ddOpcodes = {};
const fdOpcodes = {};
loadOpcodeTable('generator/opcodes_dd.txt', ddOpcodes, fdOpcodes);
const ddcbOpcodes = {};
const fdcbOpcodes = {};
loadOpcodeTable('generator/opcodes_ddcb.txt', ddcbOpcodes, fdcbOpcodes);
const edOpcodes = {};
loadOpcodeTable('generator/opcodes_ed.txt', edOpcodes);

class Variable {
    getter() {
        throw "getter not implemented";
    }
    setter(expr) {
        throw "setter not implemented";
    }
    arrayGetter(index) {
        throw "arrayGetter not implemented";
    }
    arraySetter(index, expr) {
        throw "arraySetter not implemented";
    }
}

class Constant extends Variable {
    constructor(expr) {
        super();
        this.expr = expr;
    }
    getter() {
        return parseExpression(this.expr);
    }
}

class PointerVariable extends Variable {
    constructor(address, type) {
        super();
        this.address = address;
        this.type = type;
    }
    getter() {
        return `load<${this.type}>(${this.address})`;
    }
    setter(expr) {
        return `store<${this.type}>(${this.address}, (${parseExpression(expr)}));`;
    }
}

class ArrayVariable extends Variable {
    constructor(address, type) {
        super();
        this.address = address;
        this.type = type;
        this.typeSize = TYPE_SIZES[type];
    }
    arrayGetter(index) {
        if (this.typeSize == 1) {
            return `load<${this.type}>(${this.address} + (${parseExpression(index)}))`;
        } else {
            return `load<${this.type}>(${this.address} + ${this.typeSize} * (${parseExpression(index)}))`;
        }
    }
    arraySetter(index, expr) {
        if (this.typeSize == 1) {
            return `store<${this.type}>(${this.address} + (${parseExpression(index)}), (${parseExpression(expr)}));`;
        } else {
            return `store<${this.type}>(${this.address} + ${this.typeSize} * (${parseExpression(index)}), (${parseExpression(expr)}));`;
        }
    }
    setter(expr) {
        let match = expr.match(/^\s*\[([^\]]*)\]\s*$/);
        if (!match) {
            throw "bad array assignment: " + expr;
        }
        let result = '';
        match[1].split(/\s*\,\s*/).forEach((element, i) => {
            result += `store<${this.type}>(${this.address + i * this.typeSize}, ${parseExpression(element)});\n`
        });
        return result;
    }
}

/* Memory allocations */
const TYPE_SIZES = {
    'bool': 1,
    'u8': 1,
    'u16': 2,
    'u32': 4,
    'f32': 4,
}
let mem = 0;
const vars = {};

const allocateArray = (varName, type, count) => {
    const len = TYPE_SIZES[type] * count;
    vars[varName] = new ArrayVariable(mem, type);
    mem += len;
}
const allocateRegisterPair = (pair, hi, lo) => {
    vars[pair] = new PointerVariable(mem, 'u16');
    if (lo) vars[lo] = new PointerVariable(mem, 'u8');
    if (hi) vars[hi] = new PointerVariable(mem + 1, 'u8');
    mem += 2;
}
const defineConstant = (varName, val) => {
    vars[varName] = new Constant(val);
}

const parseExpression = (expr) => {
    /* array accesses: foo[x] */
    expr = expr.replaceAll(
        /(\w+)\s*\[([^\]]+)\]/g,
        (str, varName, index) => {
            if (varName in vars) {
                return vars[varName].arrayGetter(index);
            } else {
                return str;
            }
        }
    );

    /* address getting: (&foo) - note that parentheses are required */
    expr = expr.replaceAll(
        /\(\&(\w+)\)/g,
        (str, varName) => varName in vars ? vars[varName].address : varName
    );

    /* plain variable accesses: foo */
    expr = expr.replaceAll(
        /\w+/g,
        varName => varName in vars ? vars[varName].getter() : varName
    );
    return expr;
}

const generateOpcode = (code, instruction, outFile) => {
    let exactMatchFunc = null;
    let fuzzyMatchFunc = null;
    let fuzzyMatchArgs = null;

    /* check every instruction in the table for a match */
    for (let [candidate, func] of Object.entries(instructionTable)) {
        if (candidate == instruction) {
            exactMatchFunc = func;
            break;
        } else {
            /*
            look for a fuzzy match - e.g. ADD A,r for ADD A,B.
            Split candidate and target instruction into tokens by word break;
            a fuzzy match succeeds if both are the same length, and each token either:
            - matches exactly, or
            - is a placeholder that's valid for the target instruction
              ('r' is valid for any of ABCDEHL; 'rr' is valid for BC, DE, HL, SP),
              in which case the token in the target is stored to be passed as a parameter.
            */
            const instructionTokens = instruction.split(/[\s,]/);
            const candidateTokens = candidate.split(/[\s,]/);
            let fuzzyMatchOk = true;
            let args = [];
            if (instructionTokens.length != candidateTokens.length) {
                fuzzyMatchOk = false;
            } else {
                for (let i = 0; i < instructionTokens.length; i++) {
                    const instructionToken = instructionTokens[i];
                    const candidateToken = candidateTokens[i];
                    if (candidateToken == 'r' && instructionToken.match(/^([ABCDEHL]|I[XY][HL])$/)) {
                        args.push(instructionToken);
                    } else if (candidateToken == 'rr' && instructionToken.match(/^(AF|BC|DE|HL|IX|IY|SP)$/)) {
                        args.push(instructionToken);
                    } else if (candidateToken == 'c' && instructionToken.match(/^(C|NC|Z|NZ|PO|PE|P|M)$/)) {
                        args.push(instructionToken);
                    } else if (candidateToken == 'v' && instructionToken.match(/^([ABCDEHL]|I[XY][HL]|\(HL\)|\(I[XY]\+n\)|\(I[XY]\+n\>[ABCDEHL]\)|n)$/)) {
                        args.push(instructionToken);
                    } else if (candidateToken == 'k' && instructionToken.match(/^[0123456789abcdefx]+$/)) {
                        args.push(parseInt(instructionToken));
                    } else if (candidateToken != instructionToken) {
                        fuzzyMatchOk = false;
                        break;
                    }
                }
            }
            if (fuzzyMatchOk) {
                fuzzyMatchFunc = func;
                fuzzyMatchArgs = args;
            }
        }
    }
    let impl;
    if (exactMatchFunc) {
        impl = exactMatchFunc();
    } else if (fuzzyMatchFunc) {
        impl = fuzzyMatchFunc(...fuzzyMatchArgs);
    } else {
        throw("Unmatched instruction: " + instruction);
    }

    outFile.write(`
        case 0x${code.toString(16)}:  /* ${instruction} */
    `)
    for (const implLine of impl.split(/\n/)) {
        processLine(implLine);
    }
    outFile.write(`
            break;
    `)
}

const generateOpcodeTable = (prefix, outFile) => {
    if (prefix == 'base') {
        for (let i = 0; i < 0x100; i++) {
            generateOpcode(i, baseOpcodes[i], outFile);
        }
    } else if (prefix == 'cb') {
        for (let i = 0; i < 0x100; i++) {
            generateOpcode(i, cbOpcodes[i], outFile);
        }
    } else if (prefix == 'dd') {
        for (let i = 0; i < 0x100; i++) {
            if (i in ddOpcodes) {
                generateOpcode(i, ddOpcodes[i], outFile);
            } else {
                generateOpcode(i, baseOpcodes[i], outFile);
            }
        }
    } else if (prefix == 'ddcb') {
        for (let i = 0; i < 0x100; i++) {
            generateOpcode(i, ddcbOpcodes[i], outFile);
        }
    } else if (prefix == 'ed') {
        for (let i = 0; i < 0x100; i++) {
            if (i in edOpcodes) {
                generateOpcode(i, edOpcodes[i], outFile);
            } else {
                generateOpcode(i, 'NOP', outFile);
            }
        }
    } else if (prefix == 'fd') {
        for (let i = 0; i < 0x100; i++) {
            if (i in fdOpcodes) {
                generateOpcode(i, fdOpcodes[i], outFile);
            } else {
                generateOpcode(i, baseOpcodes[i], outFile);
            }
        }
    } else if (prefix == 'fdcb') {
        for (let i = 0; i < 0x100; i++) {
            generateOpcode(i, fdcbOpcodes[i], outFile);
        }
    } else {
        throw("unknown opcode table prefix: " + prefix);
    }
}

const inFile = fs.createReadStream(inputFilename);
const outFile = fs.createWriteStream(outputFilename);

const processLine = (line) => {
    if (line.startsWith('#')) {
        let match;
        match = line.match(/^#alloc\s+(\w+)\s*\[\s*(\w+)\s*\]\s*:\s*(\w+)\s*$/);
        if (match) {
            const varName = match[1];
            const len = parseInt(match[2]);
            const type = match[3];
            allocateArray(varName, type, len);
            return;
        }
        match = line.match(/^#const\s+(\w+)\s+(.+)$/);
        if (match) {
            const varName = match[1];
            const expr = match[2];
            defineConstant(varName, expr);
            return;
        }
        match = line.match(/^#regpair\s+(\w+)\s+(\w+)\s+(\w+)\s*$/);
        if (match) {
            const pair = match[1];
            const hi = match[2];
            const lo = match[3];
            allocateRegisterPair(pair, hi, lo);
            return;
        }
        match = line.match(/^#regpair\s+(\w+)\s*$/);
        if (match) {
            const pair = match[1];
            allocateRegisterPair(pair);
            return;
        }
        throw "Unrecognised directive: " + line;
    } else {
        let match;

        /* opcode table */
        match = line.match(/^\s*#optable\s+(\w+)$/);
        if (match) {
            let prefix = match[1];
            generateOpcodeTable(prefix, outFile);
            return;
        }

        /* opcode case */
        match = line.match(/^\s*#op\s+(\w+)\s+(.*)$/);
        if (match) {
            let code = parseInt(match[1], 16);
            let instruction = match[2].trim();

            generateOpcode(code, instruction, outFile);
            return;
        }

        /* array assignment */
        match = line.match(/^\s*(\w+)\s*\[([^\]]+)\]\s*(\|\=|\=)\s*(.*);/);
        if (match && match[1] in vars) {
            let variable = vars[match[1]];
            let index = match[2];
            let operator = match[3];
            let expr = match[4];
            if (operator == '=') {
                outFile.write(variable.arraySetter(index, expr) + "\n");
            } else if (operator == '|=') {
                outFile.write(
                    variable.arraySetter(
                        index,
                        `${variable.arrayGetter(index)} | (${expr})`
                    ) + "\n"
                );
            } else {
                throw "unknown operator " + operator
            }
            return;
        }

        /* var assignment */
        match = line.match(/^\s*(\w+)\s*=\s*(.*);/);
        if (match && match[1] in vars) {
            let variable = vars[match[1]];
            let expr = parseExpression(match[2]);
            outFile.write(variable.setter(expr) + "\n");
            return;
        }

        outFile.write(parseExpression(line) + "\n");
    }
}

const reader = readline.createInterface({input: inFile, crlfDelay: Infinity});
for await (let line of reader) {
    processLine(line);
}
inFile.close();
outFile.close();

/* check that allocated memory fits within the memoryBase set in asconfig.json */
const asconfig = JSON.parse(fs.readFileSync('asconfig.json', {encoding: 'utf-8'}));
console.log('memory allocated:', mem);
console.log('memory available:', asconfig.options.memoryBase);
if (mem > asconfig.options.memoryBase) {
    console.log("ERROR: not enough memory allocated in asconfig.json");
    exit(1);
}
