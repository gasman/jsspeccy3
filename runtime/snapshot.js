function extractMemoryBlock(data, fileOffset, isCompressed, unpackedLength) {
    if (!isCompressed) {
        /* uncompressed; extract a byte array directly from data */
        return new Uint8Array(data, fileOffset, unpackedLength);
    } else {
        /* compressed */
        const fileBytes = new Uint8Array(data, fileOffset);
        const memoryBytes = new Uint8Array(unpackedLength);
        let filePtr = 0;
        let memoryPtr = 0;
        while (memoryPtr < unpackedLength) {
            /* check for coded ED ED nn bb sequence */
            if (
                unpackedLength - memoryPtr >= 2 && /* at least two bytes left to unpack */
                fileBytes[filePtr] == 0xed &&
                fileBytes[filePtr + 1] == 0xed
            ) {
                /* coded sequence */
                const count = fileBytes[filePtr + 2];
                const value = fileBytes[filePtr + 3];
                for (let i = 0; i < count; i++) {
                    memoryBytes[memoryPtr++] = value;
                }
                filePtr += 4;
            } else {
                /* plain byte */
                memoryBytes[memoryPtr++] = fileBytes[filePtr++];
            }
        }
        return memoryBytes;
    }
}

export function parseZ80File(data) {
    const file = new DataView(data);

    const iReg = file.getUint8(10);
    const byte12 = file.getUint8(12);
    const rReg = (file.getUint8(11) & 0x7f) | ((byte12 & 0x01) << 7);
    const byte29 = file.getUint8(29);

    const snapshot = {
        registers: {
            'AF': file.getUint16(0, false), /* NB Big-endian */
            'BC': file.getUint16(2, true),
            'HL': file.getUint16(4, true),
            'PC': file.getUint16(6, true),
            'SP': file.getUint16(8, true),
            'IR': (iReg << 8) | rReg,
            'DE': file.getUint16(13, true),
            'BC_': file.getUint16(15, true),
            'DE_': file.getUint16(17, true),
            'HL_': file.getUint16(19, true),
            'AF_': file.getUint16(21, false), /* Big-endian */
            'IY': file.getUint16(23, true),
            'IX': file.getUint16(25, true),
            'iff1': !!file.getUint8(27),
            'iff2': !!file.getUint8(28),
            'im': byte29 & 0x03
        },
        ulaState: {
            borderColour: (byte12 & 0x0e) >> 1
        },
        memoryPages: {}
    };

    if (snapshot.registers.PC !== 0) {
        /* a non-zero value for PC at offset 6 indicates a version 1 file */
        snapshot.model = 48;
        const memory = extractMemoryBlock(data, 30, byte12 & 0x20, 0xc000);

        /* construct byte arrays of length 0x4000 at the appropriate offsets into the data stream */
        snapshot.memoryPages[5] = new Uint8Array(memory, 0, 0x4000);
        snapshot.memoryPages[2] = new Uint8Array(memory, 0x4000, 0x4000);
        snapshot.memoryPages[0] = new Uint8Array(memory, 0x8000, 0x4000);
    } else {
        /* version 2-3 snapshot */
        const additionalHeaderLength = file.getUint16(30, true);
        const isVersion2 = (additionalHeaderLength == 23);
        snapshot.registers.PC = file.getUint16(32, true);
        const machineId = file.getUint8(34);
        const is48K = (isVersion2 ? machineId < 3 : machineId < 4);
        snapshot.model = (is48K ? 48 : 128);
        if (!is48K) {
            snapshot.ulaState.pagingFlags = file.getUint8(35);
        }
        const tstateChunkSize = (is48K ? 69888 : 70908) / 4;
        snapshot.tstates = (
            (((file.getUint8(57) + 1) % 4) + 1) * tstateChunkSize
            - (file.getUint16(55, true) + 1)
        );
        if (snapshot.tstates >= tstateChunkSize * 4) snapshot.tstates = 0;

        let offset = 32 + additionalHeaderLength;

        /* translation table from the IDs Z80 assigns to pages, to the page numbers they
        actually get loaded into */
        let pageIdToNumber;
        if (is48K) {
            pageIdToNumber = {
                4: 2,
                5: 0,
                8: 5
            };
        } else {
            pageIdToNumber = {
                3: 0,
                4: 1,
                5: 2,
                6: 3,
                7: 4,
                8: 5,
                9: 6,
                10: 7
            };
        }
        while (offset < data.byteLength) {
            let compressedLength = file.getUint16(offset, true);
            let isCompressed = true;
            if (compressedLength == 0xffff) {
                compressedLength = 0x4000;
                isCompressed = false;
            }
            const pageId = file.getUint8(offset + 2);
            if (pageId in pageIdToNumber) {
                const pageNumber = pageIdToNumber[pageId];
                const pageData = extractMemoryBlock(data, offset + 3, isCompressed, 0x4000);
                snapshot.memoryPages[pageNumber] = pageData;
            }
            offset += compressedLength + 3;
        }
    }

    return snapshot;
}


export function parseSNAFile(data) {
    let mode128 = false;
    let snapshot = null;
    const len = data.byteLength;
    let sna;

    switch (len) {
        case 131103:
        case 147487:
            mode128 = true;
        case 49179:
            sna = new DataView(data, 0, mode128 ? 49182 : len);
            snapshot = {
                model: (mode128 ? 128 : 48),
                registers: {},
                ulaState: {},
            /* construct byte arrays of length 0x4000 at the appropriate offsets into the data stream */
                memoryPages: {
                    5: new Uint8Array(data, 0x0000 + 27, 0x4000),
                    2: new Uint8Array(data, 0x4000 + 27, 0x4000)
                }
            };

            if (mode128) {
                const page = (sna.getUint8(49181) & 7);
                snapshot.memoryPages[page] = new Uint8Array(data, 0x8000 + 27, 0x4000);

                for (let i = 0, ptr = 49183; i < 8; i++) {
                    if (typeof snapshot.memoryPages[i] === 'undefined') {
                        snapshot.memoryPages[i] = new Uint8Array(data, ptr, 0x4000);
                        ptr += 0x4000;
                    }
                }
            }
            else
                snapshot.memoryPages[0] = new Uint8Array(data, 0x8000 + 27, 0x4000);

            snapshot.registers['IR'] = (sna.getUint8(0) << 8) | sna.getUint8(20);
            snapshot.registers['HL_'] = sna.getUint16(1, true);
            snapshot.registers['DE_'] = sna.getUint16(3, true);
            snapshot.registers['BC_'] = sna.getUint16(5, true);
            snapshot.registers['AF_'] = sna.getUint16(7, true);
            snapshot.registers['HL'] = sna.getUint16(9, true);
            snapshot.registers['DE'] = sna.getUint16(11, true);
            snapshot.registers['BC'] = sna.getUint16(13, true);
            snapshot.registers['IY'] = sna.getUint16(15, true);
            snapshot.registers['IX'] = sna.getUint16(17, true);
            snapshot.registers['iff1'] = snapshot.registers['iff2'] = (sna.getUint8(19) & 0x04) >> 2;
            snapshot.registers['AF'] = sna.getUint16(21, true);

            if (mode128) {
                snapshot.registers['SP'] = sna.getUint16(23, true);
                snapshot.registers['PC'] = sna.getUint16(49179, true);
                snapshot.ulaState.pagingFlags = sna.getUint8(49181);
            }
            else {
                /* peek memory at SP to get proper value of PC */
                let sp = sna.getUint16(23, true);
                const l = sna.getUint8(sp - 16384 + 27);
                sp = (sp + 1) & 0xffff;
                const h = sna.getUint8(sp - 16384 + 27);
                sp = (sp + 1) & 0xffff;
                snapshot.registers['PC'] = (h << 8) | l;
                snapshot.registers['SP'] = sp;
            }

            snapshot.registers['im'] = sna.getUint8(25);
            snapshot.ulaState.borderColour = sna.getUint8(26);
            break;

        default:
            throw "Cannot handle SNA snapshots of length " + len;
    }

    return snapshot;
}
