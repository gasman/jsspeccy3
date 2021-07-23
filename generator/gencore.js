import { argv, exit } from 'process';
import * as fs from 'fs';
import * as readline from 'readline';

if (argv.length != 4) {
    console.log("Usage: node gencore.js path/to/input.ts.in path/to/output.ts");
    exit(1);
}
const inputFilename = argv[2];
const outputFilename = argv[3];

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
    expr = expr.replaceAll(
        /\w+/g,
        varName => varName in vars ? vars[varName].getter() : varName
    );
    return expr;
}

const inFile = fs.createReadStream(inputFilename);
const outFile = fs.createWriteStream(outputFilename);

const reader = readline.createInterface({input: inFile, crlfDelay: Infinity});
for await (let line of reader) {
    if (line.startsWith('#')) {
        let match;
        match = line.match(/^#alloc\s+(\w+)\s*\[\s*(\w+)\s*\]\s*:\s*(\w+)\s*$/);
        if (match) {
            const varName = match[1];
            const len = parseInt(match[2]);
            const type = match[3];
            allocateArray(varName, type, len);
            continue;
        }
        match = line.match(/^#const\s+(\w+)\s+(.+)$/);
        if (match) {
            const varName = match[1];
            const expr = match[2];
            defineConstant(varName, expr);
            continue;
        }
        match = line.match(/^#regpair\s+(\w+)\s+(\w+)\s+(\w+)\s*$/);
        if (match) {
            const pair = match[1];
            const hi = match[2];
            const lo = match[3];
            allocateRegisterPair(pair, hi, lo);
            continue;
        }
        match = line.match(/^#regpair\s+(\w+)\s*$/);
        if (match) {
            const pair = match[1];
            allocateRegisterPair(pair);
            continue;
        }
        throw "Unrecognised directive: " + line;
    } else {
        let match;

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
            continue;
        }

        /* var assignment */
        match = line.match(/^\s*(\w+)\s*=\s*(.*);/);
        if (match && match[1] in vars) {
            let variable = vars[match[1]];
            let expr = parseExpression(match[2]);
            outFile.write(variable.setter(expr) + "\n");
            continue;
        }

        outFile.write(parseExpression(line) + "\n");
    }
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
