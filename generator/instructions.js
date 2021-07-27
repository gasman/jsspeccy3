const CONDITIONS = {
    'Z': '(F & FLAG_Z)',
    'NZ': '!(F & FLAG_Z)',
    'C': '(F & FLAG_C)',
    'NC': '!(F & FLAG_C)',
    'PE': '(F & FLAG_V)',
    'PO': '!(F & FLAG_V)',
    'M': '(F & FLAG_S)',
    'P': '!(F & FLAG_S)',
};

const valueInitter = (expr, hasPreviousIndexOffset) => {
    if (expr.match(/^([ABCDEHLn]|I[XY][HL])$/)) {
        return '';
    } else if (expr == '(HL)') {
        return 'const hl:u16 = HL;';
    } else if (expr.match(/^(\(IX\+n\)|\(IX\+n\>[ABCDEHL]\))$/)) {
        if (hasPreviousIndexOffset) {
            return `
                const ixAddr:u16 = IX + indexOffset;
                t += 2;
            `;
        } else {
            return `
                const ixAddr:u16 = IX + i8(readMem(pc++));
                t += 5;
            `;
        }
    } else if (expr.match(/^(\(IY\+n\)|\(IY\+n\>[ABCDEHL]\))$/)) {
        if (hasPreviousIndexOffset) {
            return `
                const iyAddr:u16 = IY + indexOffset;
                t += 2;
            `;
        } else {
            return `
                const iyAddr:u16 = IY + i8(readMem(pc++));
                t += 5;
            `;
        }
    } else {
        throw("Unrecognised expression for value initter: " + expr);
    }
};

const valueGetter = (expr) => {
    if (expr.match(/^([ABCDEHL]|I[XY][HL])$/)) {
        return `const val = ${expr};`;
    } else if (expr == 'n') {
        return 'const val = readMem(pc++);';
    } else if (expr == '(HL)') {
        return 'const val = readMem(hl);';
    } else if (expr.match(/^(\(IX\+n\)|\(IX\+n\>[ABCDEHL]\))$/)) {
        return 'const val = readMem(ixAddr);';
    } else if (expr.match(/^(\(IY\+n\)|\(IY\+n\>[ABCDEHL]\))$/)) {
        return 'const val = readMem(iyAddr);';
    } else {
        throw("Unrecognised expression for value getter: " + expr);
    }
};

const valueSetter = (expr) => {
    let match;
    if (expr.match(/^([ABCDEHL]|I[XY][HL])$/)) {
        return `${expr} = result;`;
    } else if (expr == '(HL)') {
        return `
            t++;
            writeMem(hl, result);
        `;
    } else if (expr == '(IX+n)') {
        return `
            t++;
            writeMem(ixAddr, result);
        `;
    } else if (match = expr.match(/^\(IX\+n\>([ABCDEHL])\)$/)) {
        return `
            t++;
            writeMem(ixAddr, result);
            ${match[1]} = result;
        `;
    } else if (expr == '(IY+n)') {
        return `
            t++;
            writeMem(iyAddr, result);
        `;
    } else if (match = expr.match(/^\(IY\+n\>([ABCDEHL])\)$/)) {
        return `
            t++;
            writeMem(iyAddr, result);
            ${match[1]} = result;
        `;
    } else {
        throw("Unrecognised expression for value setter: " + expr);
    }
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
    'prefix ddcb': () => `
        opcodePrefix = 0xdc;
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
    'prefix fdcb': () => `
        opcodePrefix = 0xfc;
        interruptible = false;
    `,
    'ADC A,v': (v) => `
        ${valueInitter(v)}
        ${valueGetter(v)}
        let a:u32 = u32(A);
        const result:u32 = a + val + (F & FLAG_C);
        const lookup:u32 = ( (a & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (result & 0x88) >> 1 );
        A = result;
        F = (result & 0x100 ? FLAG_C : 0) | halfcarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | sz53Table[u8(result)];
    `,
    'ADC HL,rr': (rr) => `
        const hl:u32 = u32(HL);
        const rr:u32 = u32(${rr});
        const result:u32 = hl + rr + (F & FLAG_C);
        const lookup:u32 = ((hl & 0x8800) >> 11) | ((rr & 0x8800) >> 10) | ((result & 0x8800) >>  9);
        HL = result;
        F = (result & 0x10000 ? FLAG_C : 0) | overflowAddTable[lookup >> 4] | ((result >> 8) & (FLAG_3 | FLAG_5 | FLAG_S)) | halfcarryAddTable[lookup & 0x07] | ((result & 0xffff) ? 0 : FLAG_Z);
        t += 7;
    `,
    'ADD rr,rr': (rr1, rr2) => `
        const rr1:u16 = ${rr1};
        const rr2:u16 = ${rr2};
        const add16temp:u32 = u32(rr1) + u32(rr2);
        const lookup:u32 = ((rr1 & 0x0800) >> 11) | ((rr2 & 0x0800) >> 10) | ((add16temp & 0x0800) >>  9);
        ${rr1} = add16temp;
        F = (F & ( FLAG_V | FLAG_Z | FLAG_S )) | (add16temp & 0x10000 ? FLAG_C : 0) | ((add16temp >> 8) & ( FLAG_3 | FLAG_5 )) | halfcarryAddTable[lookup];
    `,
    'ADD A,v': (v) => `
        ${valueInitter(v)}
        ${valueGetter(v)}
        let a:u32 = u32(A);
        const result:u32 = a + u32(val);
        const lookup:u32 = ( (a & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (result & 0x88) >> 1 );
        A = result;
        F = (result & 0x100 ? FLAG_C : 0) | halfcarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | sz53Table[u8(result)];
    `,
    'AND A': () => `
        F = FLAG_H | sz53pTable[A];
    `,
    'AND v': (v) => `
        ${valueInitter(v)}
        ${valueGetter(v)}
        const result:u8 = A & val;
        A = result;
        F = FLAG_H | sz53pTable[result];
    `,
    'BIT k,(HL)': (k) => `
        const val:u8 = readMem(HL);
        let f:u8 = ( F & FLAG_C ) | FLAG_H | ( val & ( FLAG_3 | FLAG_5 ) );
        if ( !(val & ${1 << k}) ) f |= FLAG_P | FLAG_Z;
        ${k == 7 ? 'if (val & 0x80) f |= FLAG_S;' : ''}
        F = f;
        t++;
    `,
    'BIT k,(IX+n)': (k) => `
        ${valueInitter('(IX+n)', true)}
        ${valueGetter('(IX+n)')}
        let f:u8 = ( F & FLAG_C ) | FLAG_H | ( u8(ixAddr >> 8) & ( FLAG_3 | FLAG_5 ) );
        if( !(val & ${1 << k}) ) f |= FLAG_P | FLAG_Z;
        ${k == 7 ? 'if (val & 0x80) f |= FLAG_S;' : ''}
        F = f;
        t++;
    `,
    'BIT k,(IY+n)': (k) => `
        ${valueInitter('(IY+n)', true)}
        ${valueGetter('(IY+n)')}
        let f:u8 = ( F & FLAG_C ) | FLAG_H | ( u8(iyAddr >> 8) & ( FLAG_3 | FLAG_5 ) );
        if( !(val & ${1 << k}) ) f |= FLAG_P | FLAG_Z;
        ${k == 7 ? 'if (val & 0x80) f |= FLAG_S;' : ''}
        F = f;
        t++;
    `,
    'BIT k,r': (k, r) => `
        const val:u8 = ${r};
        let f:u8 = ( F & FLAG_C ) | FLAG_H | ( val & ( FLAG_3 | FLAG_5 ) );
        if ( !(val & ${1 << k}) ) f |= FLAG_P | FLAG_Z;
        ${k == 7 ? 'if (val & 0x80) f |= FLAG_S;' : ''}
        F = f;
    `,
    'CALL c,nn': (cond) => `
        if (${CONDITIONS[cond]}) {
            let lo = u16(readMem(pc++));
            let hi = u16(readMem(pc++));
            t++;
            let sp = SP;
            sp--;
            writeMem(sp, u8(pc >> 8));
            sp--;
            writeMem(sp, u8(pc & 0xff));
            SP = sp;
            pc = lo + (hi << 8);
        } else {
            pc += 2;
            t += 6;
        }
    `,
    'CALL nn': () => `
        let lo = u16(readMem(pc++));
        let hi = u16(readMem(pc++));
        t++;
        let sp = SP;
        sp--;
        writeMem(sp, u8(pc >> 8));
        sp--;
        writeMem(sp, u8(pc & 0xff));
        SP = sp;
        pc = lo + (hi << 8);
    `,
    'CCF': () => `
        const f:u8 = F;
        F = ( f & ( FLAG_P | FLAG_Z | FLAG_S ) ) | ( ( f & FLAG_C ) ? FLAG_H : FLAG_C ) | ( A & ( FLAG_3 | FLAG_5 ) );
    `,
    'CP v': (v) => `
        ${valueInitter(v)}
        ${valueGetter(v)}
        let a:u32 = u32(A);
        let cptemp:u32 = a - u32(val);
        let lookup:u32 = ( (a & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (cptemp & 0x88) >> 1 );
        F = ( cptemp & 0x100 ? FLAG_C : ( cptemp ? 0 : FLAG_Z ) ) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | ( val & ( FLAG_3 | FLAG_5 ) ) | ( cptemp & FLAG_S );
    `,
    'CPD': () => `
        const hl:u16 = HL;
        const val:u8 = readMem(hl);
        const a:u8 = A;
        let result:u8 = a - val;
        const lookup:u8 = ((a & 0x08) >> 3) | ((val & 0x08) >> 2) | ((result & 0x08) >> 1);
        t += 5;
        HL = hl - 1;
        const bc:u16 = BC - 1;
        BC = bc;
        const f:u8 = (F & FLAG_C) | (bc ? (FLAG_V | FLAG_N) : FLAG_N) | halfcarrySubTable[lookup] | (result ? 0 : FLAG_Z) | (result & FLAG_S);
        if (f & FLAG_H) result--;
        F = f | (result & FLAG_3) | ( (result & 0x02) ? FLAG_5 : 0 );
    `,
    'CPDR': () => `
        const hl:u16 = HL;
        const val:u8 = readMem(hl);
        const a:u8 = A;
        let result:u8 = a - val;
        const lookup:u8 = ((a & 0x08) >> 3) | ((val & 0x08) >> 2) | ((result & 0x08) >> 1);
        t += 5;
        HL = hl - 1;
        const bc:u16 = BC - 1;
        BC = bc;
        let f:u8 = (F & FLAG_C) | (bc ? (FLAG_V | FLAG_N) : FLAG_N) | halfcarrySubTable[lookup] | (result ? 0 : FLAG_Z) | (result & FLAG_S);
        if (f & FLAG_H) result--;
        f |= (result & FLAG_3) | ( (result & 0x02) ? FLAG_5 : 0 );
        F = f;
        if ((f & (FLAG_V | FLAG_Z)) == FLAG_V) {
            pc -= 2;
            t += 5;
        }
    `,
    'CPI': () => `
        const hl:u16 = HL;
        const val:u8 = readMem(hl);
        const a:u8 = A;
        let result:u8 = a - val;
        const lookup:u8 = ((a & 0x08) >> 3) | ((val & 0x08) >> 2) | ((result & 0x08) >> 1);
        t += 5;
        HL = hl + 1;
        const bc:u16 = BC - 1;
        BC = bc;
        const f:u8 = (F & FLAG_C) | (bc ? (FLAG_V | FLAG_N) : FLAG_N) | halfcarrySubTable[lookup] | (result ? 0 : FLAG_Z) | (result & FLAG_S);
        if (f & FLAG_H) result--;
        F = f | (result & FLAG_3) | ( (result & 0x02) ? FLAG_5 : 0 );
    `,
    'CPIR': () => `
        const hl:u16 = HL;
        const val:u8 = readMem(hl);
        const a:u8 = A;
        let result:u8 = a - val;
        const lookup:u8 = ((a & 0x08) >> 3) | ((val & 0x08) >> 2) | ((result & 0x08) >> 1);
        t += 5;
        HL = hl + 1;
        const bc:u16 = BC - 1;
        BC = bc;
        let f:u8 = (F & FLAG_C) | (bc ? (FLAG_V | FLAG_N) : FLAG_N) | halfcarrySubTable[lookup] | (result ? 0 : FLAG_Z) | (result & FLAG_S);
        if (f & FLAG_H) result--;
        f |= (result & FLAG_3) | ( (result & 0x02) ? FLAG_5 : 0 );
        F = f;
        if ((f & (FLAG_V | FLAG_Z)) == FLAG_V) {
            pc -= 2;
            t += 5;
        }
    `,
    'CPL': () => `
        const result:u8 = A ^ 0xff;
        A = result;
        F = (F & (FLAG_C | FLAG_P | FLAG_Z | FLAG_S)) | (result & (FLAG_3 | FLAG_5)) | FLAG_N | FLAG_H;
    `,
    'DAA': () => `
        let add:u32 = 0;
        let a:u32 = u32(A);
        let f:u8 = F;
        let carry:u8 = f & FLAG_C;
        if ((f & FLAG_H) || ((a & 0x0f) > 9)) add = 6;
        if (carry || (a > 0x99)) add |= 0x60;
        if (a > 0x99) carry = FLAG_C;
        let result:u32;
        if (f & FLAG_N) {
            result = a - add;
            const lookup:u32 = ((a & 0x88) >> 3) | ((add & 0x88) >> 2) | ((result & 0x88) >> 1);
            A = result;
            f = (result & 0x100 ? FLAG_C : 0) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | sz53Table[u8(result)];
        } else {
            result = a + add;
            const lookup:u32 = ((a & 0x88) >> 3) | ((add & 0x88) >> 2) | ((result & 0x88) >> 1);
            A = result;
            f = (result & 0x100 ? FLAG_C : 0) | halfcarryAddTable[lookup & 0x07] | overflowAddTable[lookup >> 4] | sz53Table[u8(result)];
        }
        F = (f & ~(FLAG_C | FLAG_P)) | carry | parityTable[u8(result)];
    `,
    'DEC rr': (rr) => `
        ${rr} = ${rr} - 1;
        t += 2;
    `,
    'DEC v': (v) => `
        ${valueInitter(v)}
        ${valueGetter(v)}
        const tempF:u8 = (F & FLAG_C) | (val & 0x0f ? 0 : FLAG_H) | FLAG_N;
        const result:u8 = val - 1;
        ${valueSetter(v)}
        F = tempF | (result == 0x7f ? FLAG_V : 0) | sz53Table[result];
    `,
    'DI': () => `
        iff1 = iff2 = 0;
    `,
    'DJNZ n': () => `
        t++;
        const b:u8 = B - 1;
        B = b;
        if (b) {
            /* take branch */
            const offset = i8(readMem(pc++));
            t += 5;
            pc += offset;
        } else {
            /* do not take branch */
            t += 3;
            pc++;
        }
    `,
    'EI': () => `
        iff1 = iff2 = 1;
        interruptible = false;
    `,
    'EX (SP),rr': (rr) => `
        const sp:u16 = SP;
        const lo = u16(readMem(sp));
        const hi = u16(readMem(sp + 1));
        t++;
        const rr:u16 = ${rr};
        writeMem(sp + 1, u8(rr >> 8));
        writeMem(sp, u8(rr & 0xff));
        ${rr} = lo | (hi << 8);
        t += 2;
    `,
    'EX AF,AF\'': () => `
        let tmp:u16 = AF;
        AF = AF_;
        AF_ = tmp;
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
    'HALT': () => `
        halted = 1;
        pc--;
    `,
    'IM k': (k) => `
        im = ${k};
    `,
    'IN r,(C)': (r) => `
        t++;
        ${r} = readPort(BC);
        t += 3;
    `,
    'IN A,(n)': () => `
        t++;
        const port:u16 = (u16(A) << 8) | u16(readMem(pc++));
        A = readPort(port);
        t += 3;
    `,
    'INC v': (v) => `
        ${valueInitter(v)}
        ${valueGetter(v)}
        const result:u8 = val + 1;
        ${valueSetter(v)}
        F = (F & FLAG_C) | (result == 0x80 ? FLAG_V : 0) | (result & 0x0f ? 0 : FLAG_H) | sz53Table[result];
    `,
    'INC rr': (rr) => `
        ${rr} = ${rr} + 1;
        t += 2;
    `,
    'JP c,nn': (cond) => `
        if (${CONDITIONS[cond]}) {
            let lo = u16(readMem(pc++));
            let hi = u16(readMem(pc++));
            pc = lo + (hi << 8);
        } else {
            pc += 2;
            t += 6;
        }
    `,
    'JP nn': () => `
        let lo = u16(readMem(pc++));
        let hi = u16(readMem(pc++));
        pc = lo + (hi << 8);
    `,
    'JP (HL)': () => `
        pc = HL;
    `,
    'JP (IX)': () => `
        pc = IX;
    `,
    'JP (IY)': () => `
        pc = IY;
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
    'JR n': () => `
        t += 5;
        let offset = i8(readMem(pc++));
        pc += offset;
    `,
    'LD (nn),rr': (rr) => `
        const lo = u16(readMem(pc++));
        const hi = u16(readMem(pc++));
        const addr = lo | (hi << 8);
        const rr:u16 = ${rr};
        writeMem(addr, u8(rr & 0xff));
        writeMem(addr + 1, u8(rr >> 8));
    `,
    'LD (nn),A': () => `
        const lo = u16(readMem(pc++));
        const hi = u16(readMem(pc++));
        writeMem(lo | (hi << 8), A);
    `,
    'LD r,v': (r, v) => (
        r == v ? '' : `
        ${valueInitter(v)}
        ${valueGetter(v)}
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
    'LD (BC),A': () => `
        writeMem(BC, A);
    `,
    'LD (DE),A': () => `
        writeMem(DE, A);
    `,
    'LD (HL),n': () => `
        writeMem(HL, readMem(pc++));
    `,
    'LD (HL),r': (r) => `
        writeMem(HL, ${r});
    `,
    'LD (IX+n),v': (v) => `
        ${valueInitter('(IX+n)')}
        ${valueGetter(v)}
        const result = val;
        ${valueSetter('(IX+n)')}
    `,
    'LD (IY+n),v': (v) => `
        ${valueInitter('(IY+n)')}
        ${valueGetter(v)}
        const result = val;
        ${valueSetter('(IY+n)')}
    `,
    'LD A,(nn)': () => `
        const lo = u16(readMem(pc++));
        const hi = u16(readMem(pc++));
        A = readMem(lo | (hi << 8));
    `,
    'LD A,(BC)': () => `
        A = readMem(BC);
    `,
    'LD A,(DE)': () => `
        A = readMem(DE);
    `,
    'LD A,(HL)': () => `
        A = readMem(HL);
    `,
    'LD A,I': () => `
        t++;
        const val = I;
        A = val;
        F = (F & FLAG_C) | sz53Table[val] | (iff2 ? FLAG_V : 0);
    `,
    'LD A,R': () => `
        t++;
        const val = R;
        A = val;
        F = (F & FLAG_C) | sz53Table[val] | (iff2 ? FLAG_V : 0);
    `,
    'LD I,A': () => `
        I = A;
        t++;
    `,
    'LD R,A': () => `
        R = A;
        t++;
    `,
    'LDD': () => `
        const hl:u16 = HL;
        const de:u16 = DE;
        let val:u8 = readMem(hl);
        writeMem(de, val);
        t += 2;
        const bc = BC - 1;
        BC = bc;
        val += A;
        F = (F & ( FLAG_C | FLAG_Z | FLAG_S )) | (bc ? FLAG_V : 0) | (val & FLAG_3) | ((val & 0x02) ? FLAG_5 : 0);
        HL = hl - 1;
        DE = de - 1;
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
    'LDI': () => `
        const hl:u16 = HL;
        const de:u16 = DE;
        let val:u8 = readMem(hl);
        writeMem(de, val);
        t += 2;
        const bc = BC - 1;
        BC = bc;
        val += A;
        F = (F & ( FLAG_C | FLAG_Z | FLAG_S )) | (bc ? FLAG_V : 0) | (val & FLAG_3) | ((val & 0x02) ? FLAG_5 : 0);
        HL = hl + 1;
        DE = de + 1;
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
    'NEG': () => `
        const a:i32 = i32(A);
        const result:i32 = -a;
        const lookup:i32 = ((a & 0x88) >> 2) | ((result & 0x88) >> 1);
        A = result;
        F = (result & 0x100 ? FLAG_C : 0) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | sz53Table[u8(result)];
    `,
    'NOP': () => '',
    'OUT (n),A': () => `
        t++;
        const lo:u16 = u16(readMem(pc++));
        const a:u8 = A;
        writePort(lo | (u16(a) << 8), a);
        t += 3;
    `,
    'OUT (C),r': (r) => `
        t++;
        writePort(BC, ${r});
        t += 3;
    `,
    'OR A': () => `
        F = sz53pTable[A];
    `,
    'OR v': (v) => `
        ${valueInitter(v)}
        ${valueGetter(v)}
        const result:u8 = A | val;
        A = result;
        F = sz53pTable[result];
    `,
    'POP rr': (rr) => `
        let sp = SP;
        const lo = u16(readMem(sp++));
        const hi = u16(readMem(sp++));
        SP = sp;
        ${rr} = lo | (hi << 8);
    `,
    'PUSH rr': (rr) => `
        t++;
        const rr:u16 = ${rr};
        let sp = SP;
        sp--;
        writeMem(sp, u8(rr >> 8));
        sp--;
        writeMem(sp, u8(rr & 0xff));
        SP = sp;
    `,
    'RES k,v': (k, v) => `
        ${valueInitter(v, true)}
        ${valueGetter(v)}
        const result:u8 = val & ${0xff ^ (1 << k)};
        ${valueSetter(v)}
    `,
    'RET': () => `
        let sp = SP;
        const lo = u16(readMem(sp++));
        const hi = u16(readMem(sp++));
        SP = sp;
        pc = lo | (hi << 8);
    `,
    'RET c': (cond) => `
        t++;
        if (${CONDITIONS[cond]}) {
            let sp = SP;
            const lo = u16(readMem(sp++));
            const hi = u16(readMem(sp++));
            SP = sp;
            pc = lo | (hi << 8);
        }
    `,
    'RETN': () => `
        iff1 = iff2;
        let sp = SP;
        const lo = u16(readMem(sp++));
        const hi = u16(readMem(sp++));
        SP = sp;
        pc = lo | (hi << 8);
    `,
    'RL v': (v) => `
        ${valueInitter(v, true)}
        ${valueGetter(v)}
        const result:u8 = (val << 1) | (F & FLAG_C);
        F = (val >> 7) | sz53pTable[result];
        ${valueSetter(v)}
    `,
    'RLA': () => `
        const val:u8 = A;
        const f:u8 = F;
        const result:u8 = (val << 1) | (f & FLAG_C);
        A = result;
        F = (f & (FLAG_P | FLAG_Z | FLAG_S)) | (result & (FLAG_3 | FLAG_5)) | (result >> 7);
    `,
    'RLC v': (v) => `
        ${valueInitter(v, true)}
        ${valueGetter(v)}
        const result:u8 = ((val << 1) | (val >> 7));
        F = (result & FLAG_C) | sz53pTable[result];
        ${valueSetter(v)}
    `,
    'RLCA': () => `
        let a:u8 = A;
        a = (a << 1) | (a >> 7);
        A = a;
        F = (F & (FLAG_P | FLAG_Z | FLAG_S)) | (a & (FLAG_C | FLAG_3 | FLAG_5));
    `,
    'RLD': () => `
        const hl:u16 = HL;
        const val:u8 = readMem(hl);
        t += 4;
        const a:u8 = A;
        const result:u8 = (val << 4) | (a & 0x0f);
        writeMem(hl, result);
        const finalA:u8 = (a & 0xf0) | (val >> 4);
        A = finalA;
        F = (F & FLAG_C) | sz53pTable[finalA];
    `,
    'RR v': (v) => `
        ${valueInitter(v, true)}
        ${valueGetter(v)}
        const result:u8 = (val >> 1) | (F << 7);
        F = (val & FLAG_C) | sz53pTable[result];
        ${valueSetter(v)}
    `,
    'RRA': () => `
        const val:u8 = A;
        const f:u8 = F;
        const result = (val >> 1) | (f << 7);
        A = result;
        F = (f & (FLAG_P | FLAG_Z | FLAG_S)) | (result & (FLAG_3 | FLAG_5)) | (val & FLAG_C);
    `,
    'RRC v': (v) => `
        ${valueInitter(v, true)}
        ${valueGetter(v)}
        const f:u8 = val & FLAG_C;
        const result:u8 = ((val >> 1) | (val << 7));
        F = f | sz53pTable[result];
        ${valueSetter(v)}
    `,
    'RRCA': () => `
        let a:u8 = A;
        const f:u8 = (F & (FLAG_P | FLAG_Z | FLAG_S)) | (a & FLAG_C);
        a = (a >> 1) | (a << 7);
        A = a;
        F = f | (a & (FLAG_3 | FLAG_5));
    `,
    'RRD': () => `
        const hl:u16 = HL;
        const val:u8 = readMem(hl);
        t += 4;
        const a:u8 = A;
        const result:u8 = (a << 4) | (val >> 4);
        writeMem(hl, result);
        const finalA:u8 = (a & 0xf0) | (val & 0x0f);
        A = finalA;
        F = (F & FLAG_C) | sz53pTable[finalA];
    `,
    'RST k': (k) => `
        t++;
        let sp = SP;
        sp--;
        writeMem(sp, u8(pc >> 8));
        sp--;
        writeMem(sp, u8(pc & 0xff));
        SP = sp;
        pc = ${k};
    `,
    'SBC A,v': (v) => `
        ${valueInitter(v)}
        ${valueGetter(v)}
        let a:u32 = u32(A);
        const result:u32 = a - u32(val) - u32(F & FLAG_C);
        const lookup:u32 = ( (a & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (result & 0x88) >> 1 );
        A = result;
        F = (result & 0x100 ? FLAG_C : 0) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | sz53Table[u8(result)];
    `,
    'SBC HL,rr': (rr) => `
        const hl:u16 = HL;
        const rr:u16 = ${rr};
        const sub16temp:u32 = u32(hl) - u32(rr) - (F & FLAG_C);
        const lookup:u32 = ((hl & 0x8800) >> 11) | ((rr & 0x8800) >> 10) | ((sub16temp & 0x8800) >> 9);
        HL = u16(sub16temp);
        F = (sub16temp & 0x10000 ? FLAG_C : 0) | FLAG_N | overflowSubTable[lookup >> 4] | (((sub16temp & 0xff00) >> 8) & ( FLAG_3 | FLAG_5 | FLAG_S )) | halfcarrySubTable[lookup&0x07] | (sub16temp & 0xffff ? 0 : FLAG_Z);
    `,
    'SCF': () => `
        F = (F & (FLAG_P | FLAG_Z | FLAG_S)) | (A & (FLAG_3 | FLAG_5)) | FLAG_C;
    `,
    'SET k,v': (k, v) => `
        ${valueInitter(v, true)}
        ${valueGetter(v)}
        const result:u8 = val | ${1 << k};
        ${valueSetter(v)}
    `,
    'SLA v': (v) => `
        ${valueInitter(v, true)}
        ${valueGetter(v)}
        const f:u8 = val >> 7;
        const result:u8 = val << 1;
        F = f | sz53pTable[result];
        ${valueSetter(v)}
    `,
    'SLL v': (v) => `
        ${valueInitter(v, true)}
        ${valueGetter(v)}
        const f:u8 = val >> 7;
        const result:u8 = (val << 1) | 0x01;
        F = f | sz53pTable[result];
        ${valueSetter(v)}
    `,
    'SRA v': (v) => `
        ${valueInitter(v, true)}
        ${valueGetter(v)}
        const f:u8 = val & FLAG_C;
        const result:u8 = (val & 0x80) | (val >> 1);
        F = f | sz53pTable[result];
        ${valueSetter(v)}
    `,
    'SRL v': (v) => `
        ${valueInitter(v, true)}
        ${valueGetter(v)}
        const f:u8 = val & FLAG_C;
        const result:u8 = val >> 1;
        F = f | sz53pTable[result];
        ${valueSetter(v)}
    `,
    'SUB v': (v) => `
        ${valueInitter(v)}
        ${valueGetter(v)}
        let a:u32 = u32(A);
        const result:u32 = a - u32(val);
        const lookup:u32 = ( (a & 0x88) >> 3 ) | ( (val & 0x88) >> 2 ) | ( (result & 0x88) >> 1 );
        A = result;
        F = (result & 0x100 ? FLAG_C : 0) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | sz53Table[u8(result)];
    `,
    'XOR A': () => `
        A = 0;
        F = sz53pTable[0];
    `,
    'XOR v': (v) => `
        ${valueInitter(v)}
        ${valueGetter(v)}
        const result:u8 = A ^ val;
        A = result;
        F = sz53pTable[result];
    `,
}