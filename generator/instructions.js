const CONDITIONS = {
    'Z': '(F & FLAG_Z)',
    'NZ': '!(F & FLAG_Z)',
    'C': '(F & FLAG_C)',
    'NC': '!(F & FLAG_C)',
    'PE': '(F & FLAG_V)',
    'PV': '!(F & FLAG_V)',
    'M': '(F & FLAG_S)',
    'P': '!(F & FLAG_S)',
};

const VALUE_INITTERS = {
    'A': '',
    'B': '',
    'C': '',
    'D': '',
    'E': '',
    'H': '',
    'L': '',
    '(HL)': 'const hl:u16 = HL;',
    '(IX+n)': 'const ixAddr:u16 = IX + i8(readMem(pc++));',
    '(IY+n)': 'const iyAddr:u16 = IY + i8(readMem(pc++));',
    'n': '',
};
const VALUE_GETTERS = {
    'A': 'const val = A;',
    'B': 'const val = B;',
    'C': 'const val = C;',
    'D': 'const val = D;',
    'E': 'const val = E;',
    'H': 'const val = H;',
    'L': 'const val = L;',
    '(HL)': 'const val = readMem(hl);',
    '(IX+n)': `
        const val = readMem(ixAddr);
        t += 5;
    `,
    '(IY+n)': `
        const val = readMem(iyAddr);
        t += 5;
    `,
    'n': 'const val = readMem(pc++);',
};
const VALUE_SETTERS = {
    'A': 'A = result;',
    'B': 'B = result;',
    'C': 'C = result;',
    'D': 'D = result;',
    'E': 'E = result;',
    'H': 'H = result;',
    'L': 'L = result;',
    '(HL)': `
        t++;
        writeMem(hl, result);
    `,
    '(IX+n)': `
        t++;
        writeMem(ixAddr, result);
    `,
    '(IY+n)': `
        t++;
        writeMem(iyAddr, result);
    `,
};

export default {
    'prefix cb': () => `
        opcodePrefix = 0xcb;
        interruptible = false;
    `,
    'prefix dd': () => `
        opcodePrefix = 0xdd;
        interruptible = false;
    `,
    'prefix ed': () => `
        opcodePrefix = 0xed;
        interruptible = false;
    `,
    'prefix fd': () => `
        opcodePrefix = 0xfd;
        interruptible = false;
    `,
    'ADD rr,rr': (rr1, rr2) => `
        const rr1:u16 = ${rr1};
        const rr2:u16 = ${rr2};
        const add16temp:u32 = u32(rr1) + u32(rr2);
        const lookup:u32 = ((rr1 & 0x0800) >> 11) | ((rr2 & 0x0800) >> 10) | ((add16temp & 0x0800) >>  9);
        ${rr1} = add16temp;
        F = (F & ( FLAG_V | FLAG_Z | FLAG_S )) | (add16temp & 0x10000 ? FLAG_C : 0) | ((add16temp >> 8) & ( FLAG_3 | FLAG_5 )) | halfcarryAddTable[lookup];
    `,
    'AND A': () => `
        F = sz53pTable[0];
    `,
    'AND v': (v) => `
        ${VALUE_INITTERS[v]}
        ${VALUE_GETTERS[v]}
        const result:u8 = A & val;
        A = result;
        F = sz53pTable[result];
    `,
    'CP v': (v) => `
        ${VALUE_INITTERS[v]}
        ${VALUE_GETTERS[v]}
        let a:u32 = u32(A);
        let cptemp:u32 = a - u32(val);
        let lookup:u32 = ( (a & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (cptemp & 0x88) >> 1 );
        F = ( cptemp & 0x100 ? FLAG_C : ( cptemp ? 0 : FLAG_Z ) ) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | ( val & ( FLAG_3 | FLAG_5 ) ) | ( cptemp & FLAG_S );
    `,
    'DEC rr': (rr) => `
        ${rr} = ${rr} - 1;
        t += 2;
    `,
    'DEC v': (v) => `
        ${VALUE_INITTERS[v]}
        ${VALUE_GETTERS[v]}
        const tempF:u8 = (F & FLAG_C) | (val & 0x0f ? 0 : FLAG_H) | FLAG_N;
        const result:u8 = val - 1;
        ${VALUE_SETTERS[v]}
        F = tempF | (result == 0x7f ? FLAG_V : 0) | sz53Table[result];
    `,
    'DI': () => `
        iff1 = iff2 = 0;
    `,
    'EI': () => `
        iff1 = iff2 = 1;
        interruptible = false;
    `,
    'EX DE,HL': () => `
        let tmp:u16 = DE;
        DE = HL;
        HL = tmp;
    `,
    'EXX': () => `
        let tmp:u16 = BC;
        BC = BC_;
        BC_ = tmp;
        tmp = DE;
        DE = DE_;
        DE_ = tmp;
        tmp = HL;
        HL = HL_;
        HL_ = tmp;
    `,
    'IM 0': () => `
        im = 0;
    `,
    'IM 1': () => `
        im = 1;
    `,
    'IM 2': () => `
        im = 2;
    `,
    'INC v': (v) => `
        ${VALUE_INITTERS[v]}
        ${VALUE_GETTERS[v]}
        const result:u8 = val + 1;
        ${VALUE_SETTERS[v]}
        F = (F & FLAG_C) | (result == 0x80 ? FLAG_V : 0) | (result & 0x0f ? 0 : FLAG_H) | sz53Table[result];
    `,
    'INC rr': (rr) => `
        ${rr} = ${rr} + 1;
        t += 2;
    `,
    'JP nn': () => `
        let lo = u16(readMem(pc++));
        let hi = u16(readMem(pc++));
        pc = lo + (hi << 8);
    `,
    'JR c,n': (cond) => `
        if (${CONDITIONS[cond]}) {
            t += 5;
            let offset = i8(readMem(pc++));
            pc += offset;
        } else {
            t += 3;
            pc++;
        }
    `,
    'LD (nn),rr': (rr) => `
        const lo = u16(readMem(pc++));
        const hi = u16(readMem(pc++));
        const addr = lo | (hi << 8);
        const rr:u16 = ${rr};
        writeMem(addr, u8(rr & 0xff));
        writeMem(addr + 1, u8(rr >> 8));
    `,
    'LD (nn),A': (rr) => `
        const lo = u16(readMem(pc++));
        const hi = u16(readMem(pc++));
        const addr = lo | (hi << 8);
        writeMem(addr, A);
    `,
    'LD r,v': (r, v) => (
        r == v ? '' : `
        ${VALUE_INITTERS[v]}
        ${VALUE_GETTERS[v]}
        ${r} = val;
        `
    ),
    'LD rr,(nn)': (rr) => `
        const lo = u16(readMem(pc++));
        const hi = u16(readMem(pc++));
        const addr = lo | (hi << 8);
        ${rr} = u16(readMem(addr)) | (u16(readMem(addr + 1)) << 8);
    `,
    'LD rr,nn': (rr) => `
        const lo = u16(readMem(pc++));
        const hi = u16(readMem(pc++));
        ${rr} = lo | (hi << 8);
    `,
    'LD rr,rr': (rr1, rr2) => `
        ${rr1} = ${rr2};
        t += 2;
    `,
    'LD (HL),n': () => `
        writeMem(HL, readMem(pc++));
    `,
    'LD I,A': () => `
        I = A;
        t++;
    `,
    'LDDR': () => `
        const hl:u16 = HL;
        const de:u16 = DE;
        let val:u8 = readMem(hl);
        writeMem(de, val);
        t += 2;
        const bc = BC - 1;
        BC = bc;
        val += A;
        F = (F & ( FLAG_C | FLAG_Z | FLAG_S )) | (bc ? FLAG_V : 0) | (val & FLAG_3) | ((val & 0x02) ? FLAG_5 : 0);
        if (bc) {
            t += 5;
            pc -= 2;
        }
        HL = hl - 1;
        DE = de - 1;
    `,
    'LDIR': () => `
        const hl:u16 = HL;
        const de:u16 = DE;
        let val:u8 = readMem(hl);
        writeMem(de, val);
        t += 2;
        const bc = BC - 1;
        BC = bc;
        val += A;
        F = (F & ( FLAG_C | FLAG_Z | FLAG_S )) | (bc ? FLAG_V : 0) | (val & FLAG_3) | ((val & 0x02) ? FLAG_5 : 0);
        if (bc) {
            t += 5;
            pc -= 2;
        }
        HL = hl + 1;
        DE = de + 1;
    `,
    'NOP': () => '',
    'OUT (n),A': () => `
        readMem(pc++);
        t += 4;
    `,
    'OR A': () => `
        F = sz53pTable[0];
    `,
    'OR v': (v) => `
        ${VALUE_INITTERS[v]}
        ${VALUE_GETTERS[v]}
        const result:u8 = A | val;
        A = result;
        F = sz53pTable[result];
    `,
    'PUSH rr': (rr) => `
        t++;
        const rr:u16 = ${rr};
        SP = SP - 1;
        writeMem(SP, u8(rr >> 8));
        SP = SP - 1;
        writeMem(SP, u8(rr & 0xff));
    `,
    'SBC HL,rr': (rr) => `
        const hl:u16 = HL;
        const rr:u16 = ${rr};
        const sub16temp:u32 = u32(hl) - u32(rr) - (F & FLAG_C);
        const lookup:u32 = ((hl & 0x8800) >> 11) | ((rr & 0x8800) >> 10) | ((sub16temp & 0x8800) >> 9);
        HL = u16(sub16temp);
        F = (sub16temp & 0x10000 ? FLAG_C : 0) | FLAG_N | overflowSubTable[lookup >> 4] | (((sub16temp & 0xff00) >> 8) & ( FLAG_3 | FLAG_5 | FLAG_S )) | halfcarrySubTable[lookup&0x07] | (sub16temp & 0xffff ? 0 : FLAG_Z);
    `,
    'XOR A': () => `
        A = 0;
        F = sz53pTable[0];
    `,
    'XOR v': (v) => `
        ${VALUE_INITTERS[v]}
        ${VALUE_GETTERS[v]}
        const result:u8 = A ^ val;
        A = result;
        F = sz53pTable[result];
    `,
}