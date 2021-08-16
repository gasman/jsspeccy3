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

const valueGetter = (expr, hasPreviousIndexOffset) => {
    if (expr.match(/^([ABCDEHL]|I[XY][HL])$/)) {
        return `const val = ${expr};`;
    } else if (expr == 'n') {
        return 'const val = readMem(pc++);';
    } else if (expr == '(HL)') {
        return `
            const hl:u16 = HL;
            const val = readMem(hl);
        `;
    } else if (expr.match(/^(\(IX\+n\)|\(IX\+n\>[ABCDEHL]\))$/)) {
        if (hasPreviousIndexOffset) {
            return `
                const ixAddr:u16 = IX + indexOffset;
                contendDirtyRead(pc-1);
                t++;
                contendDirtyRead(pc-1);
                t++;
                const val = readMem(ixAddr);
            `;
        } else {
            return `
                const ixAddr:u16 = IX + i8(readMem(pc));
                contendDirtyRead(pc);
                t++;
                contendDirtyRead(pc);
                t++;
                contendDirtyRead(pc);
                t++;
                contendDirtyRead(pc);
                t++;
                contendDirtyRead(pc);
                t++;
                pc++;
                const val = readMem(ixAddr);
            `;
        }
    } else if (expr.match(/^(\(IY\+n\)|\(IY\+n\>[ABCDEHL]\))$/)) {
        if (hasPreviousIndexOffset) {
            return `
                const iyAddr:u16 = IY + indexOffset;
                contendDirtyRead(pc-1);
                t++;
                contendDirtyRead(pc-1);
                t++;
                const val = readMem(iyAddr);
            `;
        } else {
            return `
                const iyAddr:u16 = IY + i8(readMem(pc));
                contendDirtyRead(pc);
                t++;
                contendDirtyRead(pc);
                t++;
                contendDirtyRead(pc);
                t++;
                contendDirtyRead(pc);
                t++;
                contendDirtyRead(pc);
                t++;
                pc++;
                const val = readMem(iyAddr);
            `;
        }
    } else {
        throw("Unrecognised expression for value initter: " + expr);
    }
};

const valueSetter = (expr) => {
    let match;
    if (expr.match(/^([ABCDEHL]|I[XY][HL])$/)) {
        return `${expr} = result;`;
    } else if (expr == '(HL)') {
        return `
            contendDirtyRead(hl);
            t++;
            writeMem(hl, result);
        `;
    } else if (expr == '(IX+n)') {
        return `
            contendDirtyRead(ixAddr);
            t++;
            writeMem(ixAddr, result);
        `;
    } else if (match = expr.match(/^\(IX\+n\>([ABCDEHL])\)$/)) {
        return `
            contendDirtyRead(ixAddr);
            t++;
            writeMem(ixAddr, result);
            ${match[1]} = result;
        `;
    } else if (expr == '(IY+n)') {
        return `
            contendDirtyRead(iyAddr);
            t++;
            writeMem(iyAddr, result);
        `;
    } else if (match = expr.match(/^\(IY\+n\>([ABCDEHL])\)$/)) {
        return `
            contendDirtyRead(iyAddr);
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
        const ir:u16 = IR;
        contendDirtyRead(ir);
        t++;
        contendDirtyRead(ir);
        t++;
        contendDirtyRead(ir);
        t++;
        contendDirtyRead(ir);
        t++;
        contendDirtyRead(ir);
        t++;
        contendDirtyRead(ir);
        t++;
        contendDirtyRead(ir);
        t++;
    `,
    'ADD rr,rr': (rr1, rr2) => `
        const rr1:u16 = ${rr1};
        const rr2:u16 = ${rr2};
        const add16temp:u32 = u32(rr1) + u32(rr2);
        const lookup:u32 = ((rr1 & 0x0800) >> 11) | ((rr2 & 0x0800) >> 10) | ((add16temp & 0x0800) >>  9);
        ${rr1} = add16temp;
        F = (F & ( FLAG_V | FLAG_Z | FLAG_S )) | (add16temp & 0x10000 ? FLAG_C : 0) | ((add16temp >> 8) & ( FLAG_3 | FLAG_5 )) | halfcarryAddTable[lookup];
        const ir:u16 = IR;
        contendDirtyRead(ir);
        t++;
        contendDirtyRead(ir);
        t++;
        contendDirtyRead(ir);
        t++;
        contendDirtyRead(ir);
        t++;
        contendDirtyRead(ir);
        t++;
        contendDirtyRead(ir);
        t++;
        contendDirtyRead(ir);
        t++;
    `,
    'ADD A,v': (v) => `
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
        ${valueGetter(v)}
        const result:u8 = A & val;
        A = result;
        F = FLAG_H | sz53pTable[result];
    `,
    'BIT k,(HL)': (k) => `
        const hl:u16 = HL;
        const val:u8 = readMem(hl);
        let f:u8 = ( F & FLAG_C ) | FLAG_H | ( val & ( FLAG_3 | FLAG_5 ) );
        if ( !(val & ${1 << k}) ) f |= FLAG_P | FLAG_Z;
        ${k == 7 ? 'if (val & 0x80) f |= FLAG_S;' : ''}
        F = f;
        contendDirtyRead(hl);
        t++;
    `,
    'BIT k,(IX+n)': (k) => `
        ${valueGetter('(IX+n)', true)}
        let f:u8 = ( F & FLAG_C ) | FLAG_H | ( u8(ixAddr >> 8) & ( FLAG_3 | FLAG_5 ) );
        if( !(val & ${1 << k}) ) f |= FLAG_P | FLAG_Z;
        ${k == 7 ? 'if (val & 0x80) f |= FLAG_S;' : ''}
        F = f;
        contendDirtyRead(ixAddr);
        t++;
    `,
    'BIT k,(IY+n)': (k) => `
        ${valueGetter('(IY+n)', true)}
        let f:u8 = ( F & FLAG_C ) | FLAG_H | ( u8(iyAddr >> 8) & ( FLAG_3 | FLAG_5 ) );
        if( !(val & ${1 << k}) ) f |= FLAG_P | FLAG_Z;
        ${k == 7 ? 'if (val & 0x80) f |= FLAG_S;' : ''}
        F = f;
        contendDirtyRead(iyAddr);
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
            let hi = u16(readMem(pc));
            contendDirtyRead(pc);
            t++;
            pc++;
            let sp = SP;
            sp--;
            writeMem(sp, u8(pc >> 8));
            sp--;
            writeMem(sp, u8(pc & 0xff));
            SP = sp;
            pc = lo + (hi << 8);
        } else {
            contendRead(pc++);
            t += 3;
            contendRead(pc++);
            t += 3;
        }
    `,
    'CALL nn': () => `
        let lo = u16(readMem(pc++));
        let hi = u16(readMem(pc));
        contendDirtyRead(pc);
        t++;
        pc++;
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
        HL = hl - 1;
        const bc:u16 = BC - 1;
        BC = bc;
        const f:u8 = (F & FLAG_C) | (bc ? (FLAG_V | FLAG_N) : FLAG_N) | halfcarrySubTable[lookup] | (result ? 0 : FLAG_Z) | (result & FLAG_S);
        if (f & FLAG_H) result--;
        F = f | (result & FLAG_3) | ( (result & 0x02) ? FLAG_5 : 0 );
        contendDirtyRead(hl);
        t++;
        contendDirtyRead(hl);
        t++;
        contendDirtyRead(hl);
        t++;
        contendDirtyRead(hl);
        t++;
        contendDirtyRead(hl);
        t++;
    `,
    'CPDR': () => `
        const hl:u16 = HL;
        const val:u8 = readMem(hl);
        const a:u8 = A;
        let result:u8 = a - val;
        const lookup:u8 = ((a & 0x08) >> 3) | ((val & 0x08) >> 2) | ((result & 0x08) >> 1);
        HL = hl - 1;
        const bc:u16 = BC - 1;
        BC = bc;
        let f:u8 = (F & FLAG_C) | (bc ? (FLAG_V | FLAG_N) : FLAG_N) | halfcarrySubTable[lookup] | (result ? 0 : FLAG_Z) | (result & FLAG_S);
        if (f & FLAG_H) result--;
        f |= (result & FLAG_3) | ( (result & 0x02) ? FLAG_5 : 0 );
        F = f;
        contendDirtyRead(hl);
        t++;
        contendDirtyRead(hl);
        t++;
        contendDirtyRead(hl);
        t++;
        contendDirtyRead(hl);
        t++;
        contendDirtyRead(hl);
        t++;
        if ((f & (FLAG_V | FLAG_Z)) == FLAG_V) {
            pc -= 2;
            contendDirtyRead(hl);
            t++;
            contendDirtyRead(hl);
            t++;
            contendDirtyRead(hl);
            t++;
            contendDirtyRead(hl);
            t++;
            contendDirtyRead(hl);
            t++;    
        }
    `,
    'CPI': () => `
        const hl:u16 = HL;
        const val:u8 = readMem(hl);
        const a:u8 = A;
        let result:u8 = a - val;
        const lookup:u8 = ((a & 0x08) >> 3) | ((val & 0x08) >> 2) | ((result & 0x08) >> 1);
        HL = hl + 1;
        const bc:u16 = BC - 1;
        BC = bc;
        const f:u8 = (F & FLAG_C) | (bc ? (FLAG_V | FLAG_N) : FLAG_N) | halfcarrySubTable[lookup] | (result ? 0 : FLAG_Z) | (result & FLAG_S);
        if (f & FLAG_H) result--;
        F = f | (result & FLAG_3) | ( (result & 0x02) ? FLAG_5 : 0 );
        contendDirtyRead(hl);
        t++;
        contendDirtyRead(hl);
        t++;
        contendDirtyRead(hl);
        t++;
        contendDirtyRead(hl);
        t++;
        contendDirtyRead(hl);
        t++;
    `,
    'CPIR': () => `
        const hl:u16 = HL;
        const val:u8 = readMem(hl);
        const a:u8 = A;
        let result:u8 = a - val;
        const lookup:u8 = ((a & 0x08) >> 3) | ((val & 0x08) >> 2) | ((result & 0x08) >> 1);
        HL = hl + 1;
        const bc:u16 = BC - 1;
        BC = bc;
        let f:u8 = (F & FLAG_C) | (bc ? (FLAG_V | FLAG_N) : FLAG_N) | halfcarrySubTable[lookup] | (result ? 0 : FLAG_Z) | (result & FLAG_S);
        if (f & FLAG_H) result--;
        f |= (result & FLAG_3) | ( (result & 0x02) ? FLAG_5 : 0 );
        F = f;
        contendDirtyRead(hl);
        t++;
        contendDirtyRead(hl);
        t++;
        contendDirtyRead(hl);
        t++;
        contendDirtyRead(hl);
        t++;
        contendDirtyRead(hl);
        t++;
        if ((f & (FLAG_V | FLAG_Z)) == FLAG_V) {
            pc -= 2;
            contendDirtyRead(hl);
            t++;
            contendDirtyRead(hl);
            t++;
            contendDirtyRead(hl);
            t++;
            contendDirtyRead(hl);
            t++;
            contendDirtyRead(hl);
            t++;
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
        const ir:u16 = IR;
        contendDirtyRead(ir);
        t++;
        contendDirtyRead(ir);
        t++;
    `,
    'DEC v': (v) => `
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
        contendDirtyRead(IR);
        t++;
        const b:u8 = B - 1;
        B = b;
        if (b) {
            /* take branch */
            const offset = i8(readMem(pc));
            contendDirtyRead(pc);
            t++;
            contendDirtyRead(pc);
            t++;
            contendDirtyRead(pc);
            t++;
            contendDirtyRead(pc);
            t++;
            contendDirtyRead(pc);
            t++;
            pc += i16(offset) + 1;
        } else {
            /* do not take branch */
            contendRead(pc++);
            t += 3;
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
        contendDirtyRead(sp + 1);
        t++;
        const rr:u16 = ${rr};
        writeMem(sp + 1, u8(rr >> 8));
        writeMem(sp, u8(rr & 0xff));
        ${rr} = lo | (hi << 8);
        contendDirtyWrite(sp);
        t++;
        contendDirtyWrite(sp);
        t++;
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
        const result:u8 = readPort(BC);
        ${r} = result;
        F = (F & FLAG_C) | sz53pTable[result];
    `,
    'IN A,(n)': () => `
        const port:u16 = (u16(A) << 8) | u16(readMem(pc++));
        A = readPort(port);
    `,
    'IN F,(C)': () => `
        const result:u8 = readPort(BC);
        F = (F & FLAG_C) | sz53pTable[result];
    `,
    'INC v': (v) => `
        ${valueGetter(v)}
        const result:u8 = val + 1;
        ${valueSetter(v)}
        F = (F & FLAG_C) | (result == 0x80 ? FLAG_V : 0) | (result & 0x0f ? 0 : FLAG_H) | sz53Table[result];
    `,
    'INC rr': (rr) => `
        ${rr} = ${rr} + 1;
        const ir:u16 = IR;
        contendDirtyRead(ir);
        t++;
        contendDirtyRead(ir);
        t++;
    `,
    'IND': () => `
        contendDirtyRead(IR);
        t++;
        const bc:u16 = BC;
        const result:u8 = readPort(bc);
        const hl:u16 = HL;
        writeMem(hl, result);
        const b:u8 = u8(bc >> 8) - 1;
        B = b;
        HL = hl - 1;

        const initemp2:u8 = (result + u8(bc & 0xff) - 1);

        F = (result & 0x80 ? FLAG_N : 0) | ((initemp2 < result) ? (FLAG_H | FLAG_C) : 0) | (parityTable[(initemp2 & 0x07) ^ b] ? FLAG_P : 0) | sz53Table[b];
    `,
    'INDR': () => `
        contendDirtyRead(IR);
        t++;
        const bc:u16 = BC;
        const result:u8 = readPort(bc);
        const hl:u16 = HL;
        writeMem(hl, result);
        const b:u8 = u8(bc >> 8) - 1;
        B = b;
        HL = hl - 1;

        const initemp2:u8 = (result + u8(bc & 0xff) - 1);

        F = (result & 0x80 ? FLAG_N : 0) | ((initemp2 < result) ? (FLAG_H | FLAG_C) : 0) | (parityTable[(initemp2 & 0x07) ^ b] ? FLAG_P : 0) | sz53Table[b];
        if (b) {
            contendDirtyWrite(hl);
            t++;
            contendDirtyWrite(hl);
            t++;
            contendDirtyWrite(hl);
            t++;
            contendDirtyWrite(hl);
            t++;
            contendDirtyWrite(hl);
            t++;
            pc -= 2;
        }
    `,
    'INI': () => `
        contendDirtyRead(IR);
        t++;
        const bc:u16 = BC;
        const result:u8 = readPort(bc);
        const hl:u16 = HL;
        writeMem(hl, result);
        const b:u8 = u8(bc >> 8) - 1;
        B = b;
        HL = hl + 1;

        const initemp2:u8 = (result + u8(bc & 0xff) + 1);

        F = (result & 0x80 ? FLAG_N : 0) | ((initemp2 < result) ? (FLAG_H | FLAG_C) : 0) | (parityTable[(initemp2 & 0x07) ^ b] ? FLAG_P : 0) | sz53Table[b];
    `,
    'INIR': () => `
        contendDirtyRead(IR);
        t++;
        const bc:u16 = BC;
        const result:u8 = readPort(bc);
        const hl:u16 = HL;
        writeMem(hl, result);
        const b:u8 = u8(bc >> 8) - 1;
        B = b;
        HL = hl + 1;

        const initemp2:u8 = (result + u8(bc & 0xff) + 1);

        F = (result & 0x80 ? FLAG_N : 0) | ((initemp2 < result) ? (FLAG_H | FLAG_C) : 0) | (parityTable[(initemp2 & 0x07) ^ b] ? FLAG_P : 0) | sz53Table[b];
        if (b) {
            contendDirtyWrite(hl);
            t++;
            contendDirtyWrite(hl);
            t++;
            contendDirtyWrite(hl);
            t++;
            contendDirtyWrite(hl);
            t++;
            contendDirtyWrite(hl);
            t++;
            pc -= 2;
        }
    `,
    'JP c,nn': (cond) => `
        if (${CONDITIONS[cond]}) {
            let lo = u16(readMem(pc++));
            let hi = u16(readMem(pc++));
            pc = lo + (hi << 8);
        } else {
            contendRead(pc++);
            t += 3;
            contendRead(pc++);
            t += 3;
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
            let offset = i8(readMem(pc));
            contendDirtyRead(pc);
            t++;
            contendDirtyRead(pc);
            t++;
            contendDirtyRead(pc);
            t++;
            contendDirtyRead(pc);
            t++;
            contendDirtyRead(pc);
            t++;
            pc += i16(offset) + 1;
        } else {
            contendRead(pc++);
            t += 3;
        }
    `,
    'JR n': () => `
        let offset = i8(readMem(pc));
        contendDirtyRead(pc);
        t++;
        contendDirtyRead(pc);
        t++;
        contendDirtyRead(pc);
        t++;
        contendDirtyRead(pc);
        t++;
        contendDirtyRead(pc);
        t++;
        pc += i16(offset) + 1;
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
    'LD SP,rr': (rr2) => `
        SP = ${rr2};
        const ir:u16 = IR;
        contendDirtyRead(ir);
        t++;
        contendDirtyRead(ir);
        t++;
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
    'LD (IX+n),n': () => `
        const ixAddr:u16 = IX + i8(readMem(pc++));
        const result = readMem(pc);
        contendDirtyRead(pc);
        t++;
        contendDirtyRead(pc);
        t++;
        pc++;
        writeMem(ixAddr, result);
    `,
    'LD (IX+n),r': (r) => `
        const ixAddr:u16 = IX + i8(readMem(pc));
        contendDirtyRead(pc);
        t++;
        contendDirtyRead(pc);
        t++;
        contendDirtyRead(pc);
        t++;
        contendDirtyRead(pc);
        t++;
        contendDirtyRead(pc);
        t++;
        pc++;
        writeMem(ixAddr, ${r});
    `,
    'LD (IY+n),n': () => `
        const iyAddr:u16 = IY + i8(readMem(pc++));
        const result = readMem(pc);
        contendDirtyRead(pc);
        t++;
        contendDirtyRead(pc);
        t++;
        pc++;
        writeMem(iyAddr, result);
    `,
    'LD (IY+n),r': (r) => `
        const iyAddr:u16 = IY + i8(readMem(pc));
        contendDirtyRead(pc);
        t++;
        contendDirtyRead(pc);
        t++;
        contendDirtyRead(pc);
        t++;
        contendDirtyRead(pc);
        t++;
        contendDirtyRead(pc);
        t++;
        pc++;
        writeMem(iyAddr, ${r});
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
        const ir:u16 = IR;
        contendDirtyRead(ir);
        t++;
        const val:u8 = u8(ir >> 8);
        A = val;
        F = (F & FLAG_C) | sz53Table[val] | (iff2 ? FLAG_V : 0);
    `,
    'LD A,R': () => `
        const ir:u16 = IR;
        contendDirtyRead(ir);
        t++;
        const val:u8 = u8(ir & 0xff);
        A = val;
        F = (F & FLAG_C) | sz53Table[val] | (iff2 ? FLAG_V : 0);
    `,
    'LD I,A': () => `
        contendDirtyRead(IR);
        I = A;
        t++;
    `,
    'LD R,A': () => `
        contendDirtyRead(IR);
        R = A;
        t++;
    `,
    'LDD': () => `
        const hl:u16 = HL;
        const de:u16 = DE;
        let val:u8 = readMem(hl);
        writeMem(de, val);
        const bc = BC - 1;
        BC = bc;
        val += A;
        F = (F & ( FLAG_C | FLAG_Z | FLAG_S )) | (bc ? FLAG_V : 0) | (val & FLAG_3) | ((val & 0x02) ? FLAG_5 : 0);
        HL = hl - 1;
        DE = de - 1;
        contendDirtyWrite(de);
        t++;
        contendDirtyWrite(de);
        t++;
    `,
    'LDDR': () => `
        const hl:u16 = HL;
        const de:u16 = DE;
        let val:u8 = readMem(hl);
        writeMem(de, val);
        const bc = BC - 1;
        BC = bc;
        val += A;
        F = (F & ( FLAG_C | FLAG_Z | FLAG_S )) | (bc ? FLAG_V : 0) | (val & FLAG_3) | ((val & 0x02) ? FLAG_5 : 0);
        HL = hl - 1;
        DE = de - 1;
        contendDirtyWrite(de);
        t++;
        contendDirtyWrite(de);
        t++;
        if (bc) {
            pc -= 2;
            contendDirtyWrite(de);
            t++;
            contendDirtyWrite(de);
            t++;
            contendDirtyWrite(de);
            t++;
            contendDirtyWrite(de);
            t++;
            contendDirtyWrite(de);
            t++;
        }
    `,
    'LDI': () => `
        const hl:u16 = HL;
        const de:u16 = DE;
        let val:u8 = readMem(hl);
        writeMem(de, val);
        const bc = BC - 1;
        BC = bc;
        val += A;
        F = (F & ( FLAG_C | FLAG_Z | FLAG_S )) | (bc ? FLAG_V : 0) | (val & FLAG_3) | ((val & 0x02) ? FLAG_5 : 0);
        HL = hl + 1;
        DE = de + 1;
        contendDirtyWrite(de);
        t++;
        contendDirtyWrite(de);
        t++;
    `,
    'LDIR': () => `
        const hl:u16 = HL;
        const de:u16 = DE;
        let val:u8 = readMem(hl);
        writeMem(de, val);
        const bc = BC - 1;
        BC = bc;
        val += A;
        F = (F & ( FLAG_C | FLAG_Z | FLAG_S )) | (bc ? FLAG_V : 0) | (val & FLAG_3) | ((val & 0x02) ? FLAG_5 : 0);
        HL = hl + 1;
        DE = de + 1;
        contendDirtyWrite(de);
        t++;
        contendDirtyWrite(de);
        t++;
        if (bc) {
            pc -= 2;
            contendDirtyWrite(de);
            t++;
            contendDirtyWrite(de);
            t++;
            contendDirtyWrite(de);
            t++;
            contendDirtyWrite(de);
            t++;
            contendDirtyWrite(de);
            t++;
        }
    `,
    'NEG': () => `
        const a:i32 = i32(A);
        const result:i32 = -a;
        const lookup:i32 = ((a & 0x88) >> 2) | ((result & 0x88) >> 1);
        A = result;
        F = (result & 0x100 ? FLAG_C : 0) | FLAG_N | halfcarrySubTable[lookup & 0x07] | overflowSubTable[lookup >> 4] | sz53Table[u8(result)];
    `,
    'NOP': () => '',
    'OR A': () => `
        F = sz53pTable[A];
    `,
    'OR v': (v) => `
        ${valueGetter(v)}
        const result:u8 = A | val;
        A = result;
        F = sz53pTable[result];
    `,
    'OTDR': () => `
        contendDirtyRead(IR);
        t++;
        let hl:u16 = HL;
        const val:u8 = readMem(hl);
        const bc:u16 = BC - 0x100;  /* the decrement does happen first, despite what the specs say */
        const b:u8 = u8(bc >> 8);
        B = b;
        writePort(bc, val);
        hl--;
        HL = hl;
        const outitemp2:u8 = val + u8(hl & 0xff);
        F = (val & 0x80 ? FLAG_N : 0) | ((outitemp2 < val) ? (FLAG_H | FLAG_C) : 0) | (parityTable[(outitemp2 & 0x07) ^ b ] ? FLAG_P : 0 ) | sz53Table[b];
        if (b) {
            pc -= 2;
            contendDirtyRead(bc);
            t++;
            contendDirtyRead(bc);
            t++;
            contendDirtyRead(bc);
            t++;
            contendDirtyRead(bc);
            t++;
            contendDirtyRead(bc);
            t++;
        }
    `,
    'OTIR': () => `
        contendDirtyRead(IR);
        t++;
        let hl:u16 = HL;
        const val:u8 = readMem(hl);
        const bc:u16 = BC - 0x100;  /* the decrement does happen first, despite what the specs say */
        const b:u8 = u8(bc >> 8);
        B = b;
        writePort(bc, val);
        hl++;
        HL = hl;
        const outitemp2:u8 = val + u8(hl & 0xff);
        F = (val & 0x80 ? FLAG_N : 0) | ((outitemp2 < val) ? (FLAG_H | FLAG_C) : 0) | (parityTable[(outitemp2 & 0x07) ^ b ] ? FLAG_P : 0 ) | sz53Table[b];
        if (b) {
            pc -= 2;
            contendDirtyRead(bc);
            t++;
            contendDirtyRead(bc);
            t++;
            contendDirtyRead(bc);
            t++;
            contendDirtyRead(bc);
            t++;
            contendDirtyRead(bc);
            t++;
        }
    `,
    'OUT (n),A': () => `
        const lo:u16 = u16(readMem(pc++));
        const a:u8 = A;
        writePort(lo | (u16(a) << 8), a);
    `,
    'OUT (C),0': () => `
        writePort(BC, 0);
    `,
    'OUT (C),r': (r) => `
        writePort(BC, ${r});
    `,
    'OUTD': () => `
        contendDirtyRead(IR);
        t++;
        let hl:u16 = HL;
        const val:u8 = readMem(hl);
        const bc:u16 = BC - 0x100;  /* the decrement does happen first, despite what the specs say */
        const b:u8 = u8(bc >> 8);
        B = b;
        writePort(bc, val);
        hl--;
        HL = hl;
        const outitemp2:u8 = val + u8(hl & 0xff);
        F = (val & 0x80 ? FLAG_N : 0) | ((outitemp2 < val) ? (FLAG_H | FLAG_C) : 0) | (parityTable[(outitemp2 & 0x07) ^ b ] ? FLAG_P : 0 ) | sz53Table[b];
    `,
    'OUTI': () => `
        contendDirtyRead(IR);
        t++;
        let hl:u16 = HL;
        const val:u8 = readMem(hl);
        const bc:u16 = BC - 0x100;  /* the decrement does happen first, despite what the specs say */
        const b:u8 = u8(bc >> 8);
        B = b;
        writePort(bc, val);
        hl++;
        HL = hl;
        const outitemp2:u8 = val + u8(hl & 0xff);
        F = (val & 0x80 ? FLAG_N : 0) | ((outitemp2 < val) ? (FLAG_H | FLAG_C) : 0) | (parityTable[(outitemp2 & 0x07) ^ b ] ? FLAG_P : 0 ) | sz53Table[b];
    `,
    'POP rr': (rr) => `
        let sp = SP;
        const lo = u16(readMem(sp++));
        const hi = u16(readMem(sp++));
        SP = sp;
        ${rr} = lo | (hi << 8);
    `,
    'PUSH rr': (rr) => `
        contendDirtyRead(IR);
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
        ${valueGetter(v, true)}
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
        contendDirtyRead(IR);
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
        ${valueGetter(v, true)}
        const result:u8 = (val << 1) | (F & FLAG_C);
        F = (val >> 7) | sz53pTable[result];
        ${valueSetter(v)}
    `,
    'RLA': () => `
        const val:u8 = A;
        const f:u8 = F;
        const result:u8 = (val << 1) | (f & FLAG_C);
        A = result;
        F = (f & (FLAG_P | FLAG_Z | FLAG_S)) | (result & (FLAG_3 | FLAG_5)) | (val >> 7);
    `,
    'RLC v': (v) => `
        ${valueGetter(v, true)}
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
        contendDirtyRead(hl);
        t++;
        contendDirtyRead(hl);
        t++;
        contendDirtyRead(hl);
        t++;
        contendDirtyRead(hl);
        t++;
        const a:u8 = A;
        const result:u8 = (val << 4) | (a & 0x0f);
        writeMem(hl, result);
        const finalA:u8 = (a & 0xf0) | (val >> 4);
        A = finalA;
        F = (F & FLAG_C) | sz53pTable[finalA];
    `,
    'RR v': (v) => `
        ${valueGetter(v, true)}
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
        ${valueGetter(v, true)}
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
        contendDirtyRead(hl);
        t++;
        contendDirtyRead(hl);
        t++;
        contendDirtyRead(hl);
        t++;
        contendDirtyRead(hl);
        t++;
        const a:u8 = A;
        const result:u8 = (a << 4) | (val >> 4);
        writeMem(hl, result);
        const finalA:u8 = (a & 0xf0) | (val & 0x0f);
        A = finalA;
        F = (F & FLAG_C) | sz53pTable[finalA];
    `,
    'RST k': (k) => `
        contendDirtyRead(IR);
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
        const ir:u16 = IR;
        contendDirtyRead(ir);
        t++;
        contendDirtyRead(ir);
        t++;
        contendDirtyRead(ir);
        t++;
        contendDirtyRead(ir);
        t++;
        contendDirtyRead(ir);
        t++;
        contendDirtyRead(ir);
        t++;
        contendDirtyRead(ir);
        t++;
    `,
    'SCF': () => `
        F = (F & (FLAG_P | FLAG_Z | FLAG_S)) | (A & (FLAG_3 | FLAG_5)) | FLAG_C;
    `,
    'SET k,v': (k, v) => `
        ${valueGetter(v, true)}
        const result:u8 = val | ${1 << k};
        ${valueSetter(v)}
    `,
    'SLA v': (v) => `
        ${valueGetter(v, true)}
        const f:u8 = val >> 7;
        const result:u8 = val << 1;
        F = f | sz53pTable[result];
        ${valueSetter(v)}
    `,
    'SLL v': (v) => `
        ${valueGetter(v, true)}
        const f:u8 = val >> 7;
        const result:u8 = (val << 1) | 0x01;
        F = f | sz53pTable[result];
        ${valueSetter(v)}
    `,
    'SRA v': (v) => `
        ${valueGetter(v, true)}
        const f:u8 = val & FLAG_C;
        const result:u8 = (val & 0x80) | (val >> 1);
        F = f | sz53pTable[result];
        ${valueSetter(v)}
    `,
    'SRL v': (v) => `
        ${valueGetter(v, true)}
        const f:u8 = val & FLAG_C;
        const result:u8 = val >> 1;
        F = f | sz53pTable[result];
        ${valueSetter(v)}
    `,
    'SUB v': (v) => `
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
        ${valueGetter(v)}
        const result:u8 = A ^ val;
        A = result;
        F = sz53pTable[result];
    `,
}