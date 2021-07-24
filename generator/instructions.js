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

export default {
    'prefix cb': () => `
        opcodePrefix = 0xcb;
    `,
    'prefix ed': () => `
        opcodePrefix = 0xed;
    `,
    'AND A': () => `
        F = sz53pTable[0];
    `,
    'AND r': (r) => `
        let val:u8 = A & ${r};
        A = val;
        F = sz53pTable[val];
    `,
    'CP r': (r) => `
        let a:u32 = u32(A);
        let val:u32 = u32(${r});
        let cptemp:u32 = a - val;
        let lookup:u32 = ( (a & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (cptemp & 0x88) >> 1 );
        F = ( cptemp & 0x100 ? FLAG_C : ( cptemp ? 0 : FLAG_Z ) ) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | ( val & ( FLAG_3 | FLAG_5 ) ) | ( cptemp & FLAG_S );
    `,
    'DEC rr': (rr) => `
        ${rr} = ${rr} - 1;
        t += 2;
    `,
    'DI': () => `
        iff1 = iff2 = 0;
        break;
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
    'LD (HL),n': () => `
        writeMem(HL, readMem(pc++));
    `,
    'LD DE,nn': () => `
        E = readMem(pc++);
        D = readMem(pc++);
    `,
    'LD I,A': () => `
        I = A;
        t++;
    `,
    'LD r,n': (r) => `
        ${r} = readMem(pc++);
    `,
    'LD r,r': (r1, r2) => (
        r1 == r2 ? '' : `
        ${r1} = ${r2};
        `
    ),
    'NOP': () => '',
    'OUT (n),A': () => `
        readMem(pc++);
        t += 4;
    `,
    'OR A': () => `
        F = sz53pTable[0];
    `,
    'OR r': (r) => `
        let val:u8 = A | ${r};
        A = val;
        F = sz53pTable[val];
    `,
    'PUSH rr': (rr) => `
        t++;
        SP = SP - 1;
        writeMem(SP, ${rr.charAt(0)});
        SP = SP - 1;
        writeMem(SP, ${rr.charAt(1)});
    `,
    'XOR A': () => `
        A = 0;
        F = sz53pTable[0];
    `,
    'XOR r': (r) => `
        let val:u8 = A ^ ${r};
        A = val;
        F = sz53pTable[val];
    `,
}