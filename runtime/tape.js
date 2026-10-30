class ToneSegment {
    constructor(pulseLength, pulseCount) {
        this.pulseLength = pulseLength;
        this.pulseCount = pulseCount;
        this.pulsesGenerated = 0;
    }
    isFinished() {
        return this.pulsesGenerated >= this.pulseCount || this.pulseLength === 0;
    }
    getNextPulseLength() {
        this.pulsesGenerated++;
        return this.pulseLength;
    }
}

class PulseSequenceSegment {
    constructor(pulses) {
        this.pulses = pulses;
        this.index = 0;
    }
    isFinished() {
        return this.index >= this.pulses.length;
    }
    getNextPulseLength() {
        return this.pulses[this.index++];
    }
}

class DataSegment {
    constructor(data, zeroPulseLength, onePulseLength, lastByteBits) {
        this.data = data;
        this.zeroPulseLength = zeroPulseLength;
        this.onePulseLength = onePulseLength;
        this.bitCount = this.data.length === 0 ? 0 : (this.data.length - 1) * 8 + lastByteBits;
        this.pulsesOutput = 0;
        this.lastPulseLength = null;
    }
    isFinished() {
        return this.pulsesOutput >= this.bitCount * 2;
    }
    getNextPulseLength() {
        if (this.pulsesOutput & 0x01) {
            this.pulsesOutput++;
            return this.lastPulseLength;
        } else {
            const bitIndex = this.pulsesOutput >> 1;
            const byteIndex = bitIndex >> 3;
            const bitMask = 1 << (7 - (bitIndex & 0x07));
            this.lastPulseLength = (this.data[byteIndex] & bitMask) ? this.onePulseLength : this.zeroPulseLength;
            this.pulsesOutput++;
            return this.lastPulseLength;
        }
    }
}

class DirectRecordingSegment {
    constructor(data, tstatesPerSample, lastByteBits) {
        this.data = data;
        this.tstatesPerSample = tstatesPerSample;
        this.bitCount = this.data.length === 0 ? 0 : (this.data.length - 1) * 8 + lastByteBits;
        this.bitIndex = 0;
    }
    isFinished() {
        return this.bitIndex >= this.bitCount;
    }
    getBit(index) {
        const byteIndex = index >> 3;
        const bitMask = 1 << (7 - (index & 0x07));
        return (this.data[byteIndex] & bitMask) ? 1 : 0;
    }
    getNextPulse() {
        const bit = this.getBit(this.bitIndex);
        let count = 1;
        this.bitIndex++;
        while (this.bitIndex < this.bitCount && this.getBit(this.bitIndex) === bit) {
            count++;
            this.bitIndex++;
        }
        return {
            level: bit ? 0x8000 : 0x0000,
            length: count * this.tstatesPerSample,
        };
    }
}

class GeneralizedPilotSegment {
    constructor(alphabet, prle) {
        this.alphabet = alphabet;
        this.prle = prle;
        this.prleIndex = 0;
        this.repeatRemaining = 0;
        this.currentSymbol = null;
        this.pulseIndex = 0;
        this.advanceState();
    }
    advanceState() {
        while (true) {
            if (this.currentSymbol && this.pulseIndex < this.currentSymbol.pulses.length) {
                return;
            }
            if (this.repeatRemaining > 0) {
                this.repeatRemaining--;
                this.pulseIndex = 0;
                if (this.currentSymbol.pulses.length > 0) return;
            }
            if (this.prleIndex >= this.prle.length) {
                this.currentSymbol = null;
                return;
            }
            const entry = this.prle[this.prleIndex++];
            this.currentSymbol = this.alphabet[entry.symbol];
            this.repeatRemaining = entry.repeat > 0 ? entry.repeat - 1 : 0;
            this.pulseIndex = 0;
            if (entry.repeat > 0 && this.currentSymbol && this.currentSymbol.pulses.length > 0) {
                return;
            }
        }
    }
    isFinished() {
        return this.currentSymbol === null;
    }
    getNextPulse(currentLevel) {
        const symbol = this.currentSymbol;
        const isFirstPulse = (this.pulseIndex === 0);
        const length = symbol.pulses[this.pulseIndex++];
        this.advanceState();
        let level;
        if (isFirstPulse) {
            switch (symbol.flags & 0x03) {
                case 0: level = currentLevel ^ 0x8000; break;
                case 1: level = currentLevel; break;
                case 2: level = 0x0000; break;
                case 3: level = 0x8000; break;
            }
        } else {
            level = currentLevel ^ 0x8000;
        }
        return { level, length };
    }
}

class GeneralizedDataSegment {
    constructor(alphabet, data, symbolCount, bitsPerSymbol) {
        this.alphabet = alphabet;
        this.data = data;
        this.symbolCount = symbolCount;
        this.bitsPerSymbol = bitsPerSymbol;
        this.symbolIndex = 0;
        this.bitOffset = 0;
        this.currentSymbol = null;
        this.pulseIndex = 0;
        this.advanceState();
    }
    readNextSymbolCode() {
        let code = 0;
        for (let i = 0; i < this.bitsPerSymbol; i++) {
            const byteIndex = this.bitOffset >> 3;
            const bitMask = 1 << (7 - (this.bitOffset & 0x07));
            code = (code << 1) | ((this.data[byteIndex] & bitMask) ? 1 : 0);
            this.bitOffset++;
        }
        return code;
    }
    advanceState() {
        while (true) {
            if (this.currentSymbol && this.pulseIndex < this.currentSymbol.pulses.length) {
                return;
            }
            if (this.symbolIndex >= this.symbolCount) {
                this.currentSymbol = null;
                return;
            }
            this.symbolIndex++;
            const code = this.readNextSymbolCode();
            this.currentSymbol = this.alphabet[code];
            this.pulseIndex = 0;
            if (this.currentSymbol && this.currentSymbol.pulses.length > 0) {
                return;
            }
        }
    }
    isFinished() {
        return this.currentSymbol === null;
    }
    getNextPulse(currentLevel) {
        const symbol = this.currentSymbol;
        const isFirstPulse = (this.pulseIndex === 0);
        const length = symbol.pulses[this.pulseIndex++];
        this.advanceState();
        let level;
        if (isFirstPulse) {
            switch (symbol.flags & 0x03) {
                case 0: level = currentLevel ^ 0x8000; break;
                case 1: level = currentLevel; break;
                case 2: level = 0x0000; break;
                case 3: level = 0x8000; break;
            }
        } else {
            level = currentLevel ^ 0x8000;
        }
        return { level, length };
    }
}

class SetSignalLevelSegment {
    constructor(level) {
        this.targetLevel = level ? 0x8000 : 0x0000;
        this.emitted = false;
    }
    isFinished() {
        return this.emitted;
    }
    getNextPulse() {
        this.emitted = true;
        // Set generator.level to opposite of targetLevel so that the next standard pulse flips to targetLevel
        return {
            level: this.targetLevel ^ 0x8000,
            length: 0,
        };
    }
}

class PauseSegment {
    constructor(duration) {
        this.duration = duration;
        this.remainingCycles = duration * 3500;
    }
    isFinished() {
        return this.remainingCycles === 0;
    }
    getNextPulseLength(currentLevel) {
        if (currentLevel === 0x0000 && this.remainingCycles > 3500) {
            // Level will flip to 0x8000 (high) to complete the trailing edge of the previous pulse;
            // hold high for 1ms (3500 T-states), then flip back to 0x0000 (low) for the rest of the pause.
            this.remainingCycles -= 3500;
            return 3500;
        }
        const cycles = this.remainingCycles;
        this.remainingCycles = 0;
        return cycles;
    }
}

class PulseGenerator {
    constructor(getSegments) {
        this.segments = [];
        this.getSegments = getSegments;
        this.level = 0x0000;
        this.tapeIsFinished = false;  // if true, don't call getSegments again
        this.pendingCycles = 0;
        this.currentSegmentIsPause = false;
        this.emittedAnyPulses = false;
    }
    reset() {
        this.segments = [];
        this.level = 0x0000;
        this.tapeIsFinished = false;
        this.pendingCycles = 0;
        this.currentSegmentIsPause = false;
        this.emittedAnyPulses = false;
    }
    hasActiveData() {
        if (this.pendingCycles > 0 && !this.currentSegmentIsPause) {
            return true;
        }
        return this.segments.some(segment => !(segment instanceof PauseSegment) && !segment.isFinished());
    }
    addSegment(segment) {
        this.segments.push(segment);
    }
    emitPulses(buffer, startIndex, cycleCount) {
        let cyclesEmitted = 0;
        let index = startIndex;
        let isFinished = false;
        while (cyclesEmitted < cycleCount) {
            if (this.pendingCycles > 0) {
                this.emittedAnyPulses = true;
                if (this.pendingCycles >= 0x8000) {
                    // emit a pulse of length 0x7fff
                    buffer[index++] = this.level | 0x7fff;
                    cyclesEmitted += 0x7fff;
                    this.pendingCycles -= 0x7fff;
                } else {
                    // emit the remainder of this pulse in full
                    buffer[index++] = this.level | this.pendingCycles;
                    cyclesEmitted += this.pendingCycles;
                    this.pendingCycles = 0;
                }
            } else if (this.segments.length === 0) {
                if (this.tapeIsFinished) {
                    // mark end of tape and reset tapeIsFinished so tape can be played again if requested
                    isFinished = true;
                    this.tapeIsFinished = false;
                    this.emittedAnyPulses = false;
                    break;
                } else {
                    // get more segments
                    const hasMore = this.getSegments(this);
                    if (!hasMore) {
                        this.tapeIsFinished = true;
                        if (this.emittedAnyPulses && !this.currentSegmentIsPause) {
                            // Ensure the final data pulse on the tape is terminated by a trailing edge
                            this.addSegment(new PauseSegment(1));
                        }
                    }
                }
            } else if (this.segments[0].isFinished()) {
                // discard finished segment
                this.segments.shift();
            } else {
                // new pulse
                const segment = this.segments[0];
                this.currentSegmentIsPause = segment instanceof PauseSegment;
                if (segment.getNextPulse) {
                    const pulse = segment.getNextPulse(this.level);
                    this.level = pulse.level;
                    this.pendingCycles = pulse.length;
                } else {
                    this.pendingCycles = segment.getNextPulseLength(this.level);
                    this.level ^= 0x8000;
                }
            }
        }
        return [index, cyclesEmitted, isFinished];
    }
}

export class TAPFile {
    constructor(data) {
        let i = 0;
        this.blocks = [];
        var tap = new DataView(data);

        while ((i+1) < data.byteLength) {
            const blockLength = tap.getUint16(i, true);
            i += 2;
            this.blocks.push(new Uint8Array(data, i, blockLength));
            i += blockLength;
        }

        this.nextBlockIndex = 0;
        this.currentBlock = null;

        this.pulseGenerator = new PulseGenerator((generator) => {
            if (this.blocks.length === 0) return false;
            const block = this.blocks[this.nextBlockIndex];
            this.currentBlock = block;
            this.nextBlockIndex = (this.nextBlockIndex + 1) % this.blocks.length;

            if (block[0] & 0x80) {
                // add short leader tone for data block
                generator.addSegment(new ToneSegment(2168, 3223));
            } else {
                // add long leader tone for header block
                generator.addSegment(new ToneSegment(2168, 8063));
            }
            generator.addSegment(new PulseSequenceSegment([667, 735]));
            generator.addSegment(new DataSegment(block, 855, 1710, 8));
            generator.addSegment(new PauseSegment(1000));

            // return false if tape has ended
            return this.nextBlockIndex != 0;
        });
    }

    getNextLoadableBlock() {
        if (this.blocks.length === 0) return null;
        let block;
        if (this.currentBlock && this.pulseGenerator.hasActiveData()) {
            block = this.currentBlock;
        } else {
            block = this.blocks[this.nextBlockIndex];
            this.nextBlockIndex = (this.nextBlockIndex + 1) % this.blocks.length;
        }
        this.currentBlock = null;
        this.pulseGenerator.reset();
        this.pulseGenerator.addSegment(new PauseSegment(1000));
        return block;
    }

    hasMoreBlocks() {
        return this.blocks.length > 0 && (this.nextBlockIndex !== 0 || this.pulseGenerator.hasActiveData());
    }

    static isValid(data) {
        /* test whether the given ArrayBuffer is a valid TAP file, i.e. EOF is consistent with the
        block lengths we read from the file */
        let pos = 0;
        const tap = new DataView(data);

        while (pos < data.byteLength) {
            if (pos + 1 >= data.byteLength) return false; /* EOF in the middle of a length word */
            const blockLength = tap.getUint16(pos, true);
            pos += blockLength + 2;
        }

        return (pos == data.byteLength); /* file is a valid TAP if pos is exactly at EOF and no further */
    }
};


export class TZXFile {
    static isValid(data) {
        const tzx = new DataView(data);

        const signature = "ZXTape!\x1A";
        for (let i = 0; i < signature.length; i++) {
            if (signature.charCodeAt(i) != tzx.getUint8(i)) {
                return false;
            }
        }
        return true;
    }

    constructor(data) {
        this.blocks = [];
        const tzx = new DataView(data);

        let offset = 0x0a;

        while (offset < data.byteLength) {
            const blockType = tzx.getUint8(offset);
            offset++;
            switch (blockType) {
                case 0x10:
                    (() => {
                        const pause = tzx.getUint16(offset, true);
                        offset += 2;
                        const dataLength = tzx.getUint16(offset, true);
                        offset += 2;
                        const blockData = new Uint8Array(data, offset, dataLength);
                        this.blocks.push({
                            'type': 'StandardSpeedData',
                            'pause': pause,
                            'data': blockData,
                            'generatePulses': (generator) => {
                                if (blockData[0] & 0x80) {
                                    // add short leader tone for data block
                                    generator.addSegment(new ToneSegment(2168, 3223));
                                } else {
                                    // add long leader tone for header block
                                    generator.addSegment(new ToneSegment(2168, 8063));
                                }
                                generator.addSegment(new PulseSequenceSegment([667, 735]));
                                generator.addSegment(new DataSegment(blockData, 855, 1710, 8));
                                if (pause) generator.addSegment(new PauseSegment(pause));
                            }
                        });
                        offset += dataLength;
                    })();
                    break;
                case 0x11:
                    (() => {
                        const pilotPulseLength = tzx.getUint16(offset, true); offset += 2;
                        const syncPulse1Length = tzx.getUint16(offset, true); offset += 2;
                        const syncPulse2Length = tzx.getUint16(offset, true); offset += 2;
                        const zeroBitLength = tzx.getUint16(offset, true); offset += 2;
                        const oneBitLength = tzx.getUint16(offset, true); offset += 2;
                        const pilotPulseCount = tzx.getUint16(offset, true); offset += 2;
                        const lastByteMask = tzx.getUint8(offset); offset += 1;
                        const pause = tzx.getUint16(offset, true); offset += 2;
                        const dataLength = tzx.getUint16(offset, true) | (tzx.getUint8(offset+2) << 16); offset += 3;
                        const blockData = new Uint8Array(data, offset, dataLength);
                        this.blocks.push({
                            'type': 'TurboSpeedData',
                            'pilotPulseLength': pilotPulseLength,
                            'syncPulse1Length': syncPulse1Length,
                            'syncPulse2Length': syncPulse2Length,
                            'zeroBitLength': zeroBitLength,
                            'oneBitLength': oneBitLength,
                            'pilotPulseCount': pilotPulseCount,
                            'lastByteMask': lastByteMask,
                            'pause': pause,
                            'data': blockData,
                            'generatePulses': (generator) => {
                                generator.addSegment(new ToneSegment(pilotPulseLength, pilotPulseCount));
                                generator.addSegment(new PulseSequenceSegment([syncPulse1Length, syncPulse2Length]));
                                generator.addSegment(new DataSegment(blockData, zeroBitLength, oneBitLength, lastByteMask));
                                if (pause) generator.addSegment(new PauseSegment(pause));
                            }
                        });
                        offset += dataLength;
                    })();
                    break;
                case 0x12:
                    (() => {
                        const pulseLength = tzx.getUint16(offset, true); offset += 2;
                        const pulseCount = tzx.getUint16(offset, true); offset += 2;
                        this.blocks.push({
                            'type': 'PureTone',
                            'pulseLength': pulseLength,
                            'pulseCount': pulseCount,
                            'generatePulses': (generator) => {
                                generator.addSegment(new ToneSegment(pulseLength, pulseCount));
                            }
                        });
                    })();
                    break;
                case 0x13:
                    (() => {
                        const pulseCount = tzx.getUint8(offset); offset += 1;
                        const pulseLengths = [];
                        for (let i = 0; i < pulseCount; i++) {
                            pulseLengths[i] = tzx.getUint16(offset + i*2, true);
                        }
                        this.blocks.push({
                            'type': 'PulseSequence',
                            'pulseLengths': pulseLengths,
                            'generatePulses': (generator) => {
                                generator.addSegment(new PulseSequenceSegment(pulseLengths));
                            }
                        });
                        offset += (pulseCount * 2);
                    })();
                    break;
                case 0x14:
                    (() => {
                        const zeroBitLength = tzx.getUint16(offset, true); offset += 2;
                        const oneBitLength = tzx.getUint16(offset, true); offset += 2;
                        const lastByteMask = tzx.getUint8(offset); offset += 1;
                        const pause = tzx.getUint16(offset, true); offset += 2;
                        const dataLength = tzx.getUint16(offset, true) | (tzx.getUint8(offset+2) << 16); offset += 3;
                        const blockData = new Uint8Array(data, offset, dataLength);
                        this.blocks.push({
                            'type': 'PureData',
                            'zeroBitLength': zeroBitLength,
                            'oneBitLength': oneBitLength,
                            'lastByteMask': lastByteMask,
                            'pause': pause,
                            'data': blockData,
                            'generatePulses': (generator) => {
                                generator.addSegment(new DataSegment(blockData, zeroBitLength, oneBitLength, lastByteMask));
                                if (pause) generator.addSegment(new PauseSegment(pause));
                            }
                        });
                        offset += dataLength;
                    })();
                    break;
                case 0x15:
                    (() => {
                        const tstatesPerSample = tzx.getUint16(offset, true); offset += 2;
                        const pause = tzx.getUint16(offset, true); offset += 2;
                        const lastByteMask = tzx.getUint8(offset); offset += 1;
                        const dataLength = tzx.getUint16(offset, true) | (tzx.getUint8(offset+2) << 16); offset += 3;
                        const blockData = new Uint8Array(data, offset, dataLength);
                        this.blocks.push({
                            'type': 'DirectRecording',
                            'tstatesPerSample': tstatesPerSample,
                            'lastByteMask': lastByteMask,
                            'pause': pause,
                            'data': blockData,
                            'generatePulses': (generator) => {
                                generator.addSegment(new DirectRecordingSegment(blockData, tstatesPerSample, lastByteMask));
                                if (pause) generator.addSegment(new PauseSegment(pause));
                            }
                        });
                        offset += dataLength;
                    })();
                    break;
                case 0x19:
                    (() => {
                        const blockLength = tzx.getUint32(offset, true); offset += 4;
                        const blockEnd = offset + blockLength;
                        const pause = tzx.getUint16(offset, true); offset += 2;
                        const totp = tzx.getUint32(offset, true); offset += 4;
                        const npp = tzx.getUint8(offset); offset += 1;
                        let asp = tzx.getUint8(offset); offset += 1;
                        if (asp === 0 && totp > 0) asp = 256;
                        const totd = tzx.getUint32(offset, true); offset += 4;
                        const npd = tzx.getUint8(offset); offset += 1;
                        let asd = tzx.getUint8(offset); offset += 1;
                        if (asd === 0 && totd > 0) asd = 256;

                        const pilotAlphabet = [];
                        const pilotPrle = [];
                        if (totp > 0) {
                            for (let i = 0; i < asp; i++) {
                                const flags = tzx.getUint8(offset); offset += 1;
                                const pulses = [];
                                for (let j = 0; j < npp; j++) {
                                    const len = tzx.getUint16(offset + j * 2, true);
                                    if (len === 0) break;
                                    pulses.push(len);
                                }
                                offset += npp * 2;
                                pilotAlphabet.push({ flags, pulses });
                            }
                            for (let i = 0; i < totp; i++) {
                                const symbol = tzx.getUint8(offset); offset += 1;
                                const repeat = tzx.getUint16(offset, true); offset += 2;
                                pilotPrle.push({ symbol, repeat });
                            }
                        }

                        const dataAlphabet = [];
                        let dataStream = null;
                        let bitsPerSymbol = 0;
                        if (totd > 0) {
                            for (let i = 0; i < asd; i++) {
                                const flags = tzx.getUint8(offset); offset += 1;
                                const pulses = [];
                                for (let j = 0; j < npd; j++) {
                                    const len = tzx.getUint16(offset + j * 2, true);
                                    if (len === 0) break;
                                    pulses.push(len);
                                }
                                offset += npd * 2;
                                dataAlphabet.push({ flags, pulses });
                            }
                            bitsPerSymbol = Math.ceil(Math.log2(asd));
                            const dataByteLength = Math.ceil((bitsPerSymbol * totd) / 8);
                            dataStream = new Uint8Array(data, offset, dataByteLength);
                        }

                        this.blocks.push({
                            'type': 'GeneralizedData',
                            'pause': pause,
                            'generatePulses': (generator) => {
                                if (totp > 0) {
                                    generator.addSegment(new GeneralizedPilotSegment(pilotAlphabet, pilotPrle));
                                }
                                if (totd > 0 && dataStream) {
                                    generator.addSegment(new GeneralizedDataSegment(dataAlphabet, dataStream, totd, bitsPerSymbol));
                                }
                                if (pause) generator.addSegment(new PauseSegment(pause));
                            }
                        });
                        offset = blockEnd;
                    })();
                    break;
                case 0x20:
                    (() => {
                        // TODO: handle pause length of 0 (= stop tape)
                        const pause = tzx.getUint16(offset, true); offset += 2;
                        this.blocks.push({
                            'type': 'Pause',
                            'pause': pause,
                            'generatePulses': (generator) => {
                                generator.addSegment(new PauseSegment(pause));
                            }
                        });
                    })();
                    break;
                case 0x21:
                    (() => {
                        const nameLength = tzx.getUint8(offset); offset += 1;
                        const nameBytes = new Uint8Array(data, offset, nameLength);
                        offset += nameLength;
                        const name = String.fromCharCode.apply(null, nameBytes);
                        this.blocks.push({
                            'type': 'GroupStart',
                            'name': name
                        });
                    })();
                    break;
                case 0x22:
                    (() => {
                        this.blocks.push({
                            'type': 'GroupEnd'
                        });
                    })();
                    break;
                case 0x23:
                    (() => {
                        const jumpOffset = tzx.getInt16(offset, true); offset += 2;
                        this.blocks.push({
                            'type': 'JumpToBlock',
                            'offset': jumpOffset
                        });
                    })();
                    break;
                case 0x24:
                    (() => {
                        const repeatCount = tzx.getUint16(offset, true); offset += 2;
                        this.blocks.push({
                            'type': 'LoopStart',
                            'repeatCount': repeatCount
                        });
                    })();
                    break;
                case 0x25:
                    (() => {
                        this.blocks.push({
                            'type': 'LoopEnd'
                        });
                    })();
                    break;
                case 0x26:
                    (() => {
                        const callCount = tzx.getUint16(offset, true); offset += 2;
                        const offsets = [];
                        for (let i = 0; i < callCount; i++) {
                            offsets[i] = tzx.getInt16(offset + i*2, true);
                        }
                        this.blocks.push({
                            'type': 'CallSequence',
                            'offsets': offsets
                        });
                        offset += (callCount * 2);
                    })();
                    break;
                case 0x27:
                    (() => {
                        this.blocks.push({
                            'type': 'ReturnFromSequence'
                        });
                    })();
                    break;
                case 0x28:
                    (() => {
                        const blockLength = tzx.getUint16(offset, true); offset += 2;
                        /* This is a silly block. Don't bother parsing it further. */
                        this.blocks.push({
                            'type': 'Select',
                            'data': new Uint8Array(data, offset, blockLength)
                        });
                        offset += blockLength;
                    })();
                    break;
                case 0x2A:
                    (() => {
                        const blockLength = tzx.getUint32(offset, true); offset += 4 + blockLength;
                        this.blocks.push({
                            'type': 'StopTape48K'
                        });
                    })();
                    break;
                case 0x2B:
                    (() => {
                        const blockLength = tzx.getUint32(offset, true); offset += 4;
                        const signalLevel = tzx.getUint8(offset); offset += blockLength;
                        this.blocks.push({
                            'type': 'SetSignalLevel',
                            'level': signalLevel,
                            'generatePulses': (generator) => {
                                generator.addSegment(new SetSignalLevelSegment(signalLevel));
                            }
                        });
                    })();
                    break;
                case 0x30:
                    (() => {
                        const textLength = tzx.getUint8(offset); offset += 1;
                        const textBytes = new Uint8Array(data, offset, textLength);
                        offset += textLength;
                        const text = String.fromCharCode.apply(null, textBytes);
                        this.blocks.push({
                            'type': 'TextDescription',
                            'text': text
                        });
                    })();
                    break;
                case 0x31:
                    (() => {
                        const displayTime = tzx.getUint8(offset); offset += 1;
                        const textLength = tzx.getUint8(offset); offset += 1;
                        const textBytes = new Uint8Array(data, offset, textLength);
                        offset += textLength;
                        const text = String.fromCharCode.apply(null, textBytes);
                        this.blocks.push({
                            'type': 'MessageBlock',
                            'displayTime': displayTime,
                            'text': text
                        });
                    })();
                    break;
                case 0x32:
                    (() => {
                        const blockLength = tzx.getUint16(offset, true); offset += 2;
                        this.blocks.push({
                            'type': 'ArchiveInfo',
                            'data': new Uint8Array(data, offset, blockLength)
                        });
                        offset += blockLength;
                    })();
                    break;
                case 0x33:
                    (() => {
                        const blockLength = tzx.getUint8(offset) * 3; offset += 1;
                        this.blocks.push({
                            'type': 'HardwareType',
                            'data': new Uint8Array(data, offset, blockLength)
                        });
                        offset += blockLength;
                    })();
                    break;
                case 0x35:
                    (() => {
                        const identifierBytes = new Uint8Array(data, offset, 10);
                        offset += 10;
                        const identifier = String.fromCharCode.apply(null, identifierBytes);
                        const dataLength = tzx.getUint32(offset, true);
                        offset += 4;
                        this.blocks.push({
                            'type': 'CustomInfo',
                            'identifier': identifier,
                            'data': new Uint8Array(data, offset, dataLength)
                        });
                        offset += dataLength;
                    })();
                    break;
                case 0x5A:
                    (() => {
                        offset += 9;
                        this.blocks.push({
                            'type': 'Glue'
                        });
                    })();
                    break;
                default:
                    (() => {
                        /* follow extension rule: next 4 bytes = length of block */
                        const blockLength = tzx.getUint32(offset, true);
                        offset += 4;
                        this.blocks.push({
                            'type': 'unknown',
                            'data': new Uint8Array(data, offset, blockLength)
                        });
                        offset += blockLength;
                    })();
                }
        }

        this.nextBlockIndex = 0;
        this.loopToBlockIndex;
        this.repeatCount;
        this.callStack = [];
        this.currentBlock = null;

        this.pulseGenerator = new PulseGenerator((generator) => {
            const block = this.getNextMeaningfulBlock(false);
            if (!block) {
                this.currentBlock = null;
                return false;
            }
            if (block.type === 'Pause' && block.pause === 0) {
                /* pause of 0 means stop the tape; playing again resumes at the following block */
                this.currentBlock = null;
                return false;
            }
            if (block.type === 'StopTape48K') {
                this.currentBlock = null;
                /* in 48K mode, end playback here; playing again resumes at the following block */
                return !this.is48K;
            }
            this.currentBlock = block;
            block.generatePulses(generator);
            return true;
        });
    }

    getNextMeaningfulBlock(wrapAtEnd) {
        let startedAtZero = (this.nextBlockIndex === 0);
        while (true) {
            if (this.nextBlockIndex >= this.blocks.length) {
                if (startedAtZero || !wrapAtEnd) return null; /* have looped around; quit now */
                this.nextBlockIndex = 0;
                startedAtZero = true;
            }
            var block = this.blocks[this.nextBlockIndex];
            switch (block.type) {
                case 'StandardSpeedData':
                case 'TurboSpeedData':
                case 'PureTone':
                case 'PulseSequence':
                case 'PureData':
                case 'DirectRecording':
                case 'GeneralizedData':
                case 'Pause':
                case 'SetSignalLevel':
                case 'StopTape48K':
                    /* found a meaningful block */
                    this.nextBlockIndex++;
                    return block;
                case 'JumpToBlock':
                    this.nextBlockIndex += block.offset;
                    break;
                case 'LoopStart':
                    this.loopToBlockIndex = this.nextBlockIndex + 1;
                    this.repeatCount = block.repeatCount;
                    this.nextBlockIndex++;
                    break;
                case 'LoopEnd':
                    this.repeatCount--;
                    if (this.repeatCount > 0) {
                        this.nextBlockIndex = this.loopToBlockIndex;
                    } else {
                        this.nextBlockIndex++;
                    }
                    break;
                case 'CallSequence':
                    /* push the future destinations (where to go on reaching a ReturnFromSequence block)
                        onto the call stack in reverse order, starting with the block immediately
                        after the CallSequence (which we go to when leaving the sequence) */
                    this.callStack.unshift(this.nextBlockIndex+1);
                    for (var i = block.offsets.length - 1; i >= 0; i--) {
                        this.callStack.unshift(this.nextBlockIndex + block.offsets[i]);
                    }
                    /* now visit the first destination on the list */
                    this.nextBlockIndex = this.callStack.shift();
                    break;
                case 'ReturnFromSequence':
                    this.nextBlockIndex = this.callStack.shift();
                    break;
                default:
                    /* not one of the types we care about; skip past it */
                    this.nextBlockIndex++;
            }
        }
    }

    isBlockTrappable(block) {
        if (!block) return false;
        if (block.type === 'StandardSpeedData') {
            return block.data && block.data.length >= 2;
        }
        return false;
    }

    getNextLoadableBlock() {
        this.stopRequested = false;
        if (this.currentBlock && this.pulseGenerator.hasActiveData()) {
            if (this.currentBlock.type === 'Pause' || this.currentBlock.type === 'SetSignalLevel') {
                if (this.currentBlock.type === 'SetSignalLevel') {
                    this.pulseGenerator.level = Boolean(this.currentBlock.level);
                }
                this.currentBlock = null;
                this.pulseGenerator.reset();
            } else if (this.isBlockTrappable(this.currentBlock)) {
                const block = this.currentBlock;
                this.currentBlock = null;
                this.pulseGenerator.reset();
                if (block.pause) {
                    this.pulseGenerator.addSegment(new PauseSegment(block.pause));
                }
                return block.data;
            } else {
                return null;
            }
        }

        while (true) {
            const savedNextBlockIndex = this.nextBlockIndex;
            const savedLoopToBlockIndex = this.loopToBlockIndex;
            const savedRepeatCount = this.repeatCount;
            const savedCallStack = this.callStack.slice();

            const block = this.getNextMeaningfulBlock(true);
            if (!block) return null;
            if (block.type === 'StopTape48K') {
                if (this.is48K) {
                    this.currentBlock = null;
                    this.pulseGenerator.reset();
                    this.stopRequested = true;
                    return null;
                }
                continue;
            }
            if (block.type === 'Pause' && block.pause === 0) {
                this.currentBlock = null;
                this.pulseGenerator.reset();
                this.stopRequested = true;
                return null;
            }
            if (block.type === 'Pause' || block.type === 'SetSignalLevel') {
                if (block.type === 'SetSignalLevel') {
                    this.pulseGenerator.level = Boolean(block.level);
                }
                continue;
            }
            if (this.isBlockTrappable(block)) {
                this.currentBlock = null;
                this.pulseGenerator.reset();
                if (block.pause) {
                    this.pulseGenerator.addSegment(new PauseSegment(block.pause));
                }
                return block.data;
            }
            // Next meaningful block requires pulse playback (e.g. PureTone, PureData, DirectRecording, GeneralizedData);
            // restore tape position and let pulseGenerator handle it.
            this.nextBlockIndex = savedNextBlockIndex;
            this.loopToBlockIndex = savedLoopToBlockIndex;
            this.repeatCount = savedRepeatCount;
            this.callStack = savedCallStack;
            this.currentBlock = null;
            this.pulseGenerator.reset();
            return null;
        }
    }

    hasMoreBlocks() {
        if (this.pulseGenerator.hasActiveData()) {
            return true;
        }
        const savedNextBlockIndex = this.nextBlockIndex;
        const savedLoopToBlockIndex = this.loopToBlockIndex;
        const savedRepeatCount = this.repeatCount;
        const savedCallStack = this.callStack.slice();

        const block = this.getNextMeaningfulBlock(false);

        this.nextBlockIndex = savedNextBlockIndex;
        this.loopToBlockIndex = savedLoopToBlockIndex;
        this.repeatCount = savedRepeatCount;
        this.callStack = savedCallStack;

        return block !== null;
    }
};
