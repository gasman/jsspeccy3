const SPECCY = {
    ONE: {row: 3, mask: 0x01}, /* 1 */
    TWO: {row: 3, mask: 0x02}, /* 2 */
    THREE: {row: 3, mask: 0x04}, /* 3 */
    FOUR: {row: 3, mask: 0x08}, /* 4 */
    FIVE: {row: 3, mask: 0x10}, /* 5 */
    SIX: {row: 4, mask: 0x10}, /* 6 */
    SEVEN: {row: 4, mask: 0x08}, /* 7 */
    EIGHT: {row: 4, mask: 0x04}, /* 8 */
    NINE: {row: 4, mask: 0x02}, /* 9 */
    ZERO: {row: 4, mask: 0x01}, /* 0 */

    Q: {row: 2, mask: 0x01}, /* Q */
    W: {row: 2, mask: 0x02}, /* W */
    E: {row: 2, mask: 0x04}, /* E */
    R: {row: 2, mask: 0x08}, /* R */
    T: {row: 2, mask: 0x10}, /* T */
    Y: {row: 5, mask: 0x10}, /* Y */
    U: {row: 5, mask: 0x08}, /* U */
    I: {row: 5, mask: 0x04}, /* I */
    O: {row: 5, mask: 0x02}, /* O */
    P: {row: 5, mask: 0x01}, /* P */

    A: {row: 1, mask: 0x01}, /* A */
    S: {row: 1, mask: 0x02}, /* S */
    D: {row: 1, mask: 0x04}, /* D */
    F: {row: 1, mask: 0x08}, /* F */
    G: {row: 1, mask: 0x10}, /* G */
    H: {row: 6, mask: 0x10}, /* H */
    J: {row: 6, mask: 0x08}, /* J */
    K: {row: 6, mask: 0x04}, /* K */
    L: {row: 6, mask: 0x02}, /* L */
    ENTER: {row: 6, mask: 0x01}, /* enter */

    CAPS_SHIFT: {row: 0, mask: 0x01, isCaps: true}, /* caps */
    Z: {row: 0, mask: 0x02}, /* Z */
    X: {row: 0, mask: 0x04}, /* X */
    C: {row: 0, mask: 0x08}, /* C */
    V: {row: 0, mask: 0x10}, /* V */
    B: {row: 7, mask: 0x10}, /* B */
    N: {row: 7, mask: 0x08}, /* N */
    M: {row: 7, mask: 0x04}, /* M */
    SYMBOL_SHIFT: {row: 7, mask: 0x02, isSymbol: true}, /* sym - gah, firefox screws up ctrl+key too */
    BREAK_SPACE: {row: 7, mask: 0x01}, /* space */
}

function sym(speccyKey) {
    return {...speccyKey, sym: true}
}

function caps(speccyKey) {
    return {...speccyKey, caps: true}
}

const KEY_CODES = {
    49: SPECCY.ONE,
    50: SPECCY.TWO,
    51: SPECCY.THREE,
    52: SPECCY.FOUR,
    53: SPECCY.FIVE,
    54: SPECCY.SIX,
    55: SPECCY.SEVEN,
    56: SPECCY.EIGHT,
    57: SPECCY.NINE,
    48: SPECCY.ZERO,

    81: SPECCY.Q,
    87: SPECCY.W,
    69: SPECCY.E,
    82: SPECCY.R,
    84: SPECCY.T,
    89: SPECCY.Y,
    85: SPECCY.U,
    73: SPECCY.I,
    79: SPECCY.O,
    80: SPECCY.P,

    65: SPECCY.A,
    83: SPECCY.S,
    68: SPECCY.D,
    70: SPECCY.F,
    71: SPECCY.G,
    72: SPECCY.H,
    74: SPECCY.J,
    75: SPECCY.K,
    76: SPECCY.L,
    13: SPECCY.ENTER,

    16: SPECCY.CAPS_SHIFT, /* caps */
    192: SPECCY.CAPS_SHIFT, /* backtick as caps - because firefox screws up a load of key codes when pressing shift */
    90: SPECCY.Z,
    88: SPECCY.X,
    67: SPECCY.C,
    86: SPECCY.V,
    66: SPECCY.B,
    78: SPECCY.N,
    77: SPECCY.M,
    17: SPECCY.SYMBOL_SHIFT, /* sym - gah, firefox screws up ctrl+key too */
    32: SPECCY.BREAK_SPACE, /* space */

    /* shifted combinations */
    8: caps(SPECCY.ZERO), /* backspace */
    37: caps(SPECCY.FIVE), /* left arrow */
    38: caps(SPECCY.SEVEN), /* up arrow */
    39: caps(SPECCY.EIGHT), /* right arrow */
    40: caps(SPECCY.SIX), /* down arrow */

    /* symbol keys */
    '-': sym(SPECCY.J),
    '_': sym(SPECCY.ZERO),
    '=': sym(SPECCY.L),
    '+': sym(SPECCY.K),
    ';': sym(SPECCY.O),
    ':': sym(SPECCY.Z),
    '\'': sym(SPECCY.SEVEN),
    '"': sym(SPECCY.P),
    ',': sym(SPECCY.N),
    '<': sym(SPECCY.R),
    '.': sym(SPECCY.M),
    '>': sym(SPECCY.T),
    '/': sym(SPECCY.V),
    '?': sym(SPECCY.C),
    '*': sym(SPECCY.B),
    '@': sym(SPECCY.TWO),
    '#': sym(SPECCY.THREE),
};
KEY_CODES[String.fromCharCode(0x2264)] = sym(SPECCY.Q) // LESS_THAN_EQUAL symbol (≤)
KEY_CODES[String.fromCharCode(0x2265)] = sym(SPECCY.E) // GREATER_THAN_EQUAL symbol (≥)
KEY_CODES[String.fromCharCode(0x2260)] = sym(SPECCY.W) // NOT_EQUAL symbol (≠)


export class BaseKeyboardHandler {
    constructor(worker, rootElement) {
        this.worker = worker;
        this.rootElement = rootElement;  // where we attach keyboard event listeners
        this.eventsAreBound = false;

        this.keypressHandler = (evt) => {
            if (!evt.metaKey) evt.preventDefault();
        };
    }

    start() {
        this.rootElement.addEventListener('keydown', this.keydownHandler);
        this.rootElement.addEventListener('keyup', this.keyupHandler);
        this.rootElement.addEventListener('keypress', this.keypressHandler);
        this.eventsAreBound = true;
    }

    stop() {
        this.rootElement.removeEventListener('keydown', this.keydownHandler);
        this.rootElement.removeEventListener('keyup', this.keyupHandler);
        this.rootElement.removeEventListener('keypress', this.keypressHandler);
        this.eventsAreBound = false;
    }

    setRootElement(newRootElement) {
        if (this.eventsAreBound) {
            this.stop();
            this.rootElement = newRootElement;
            this.start();
        } else {
            this.rootElement = newRootElement;
        }
    }
}

export class StandardKeyboardHandler extends BaseKeyboardHandler {
    constructor(worker, rootElement) {
        super(worker, rootElement)

        this.symbolIsShifted = false
        this.capsIsShifted = false
        
        this.keydownHandler = (evt) => {
            const keyCode = KEY_CODES[evt.keyCode] ?? KEY_CODES[evt.key];
            if (keyCode) {
                this.keyDown(keyCode)
            }
            if (!evt.metaKey) evt.preventDefault();
        };

        this.keyupHandler = (evt) => {
            const keyCode = KEY_CODES[evt.keyCode] ?? KEY_CODES[evt.key];
            if (keyCode) {
                this.keyUp(keyCode)
            }
            if (!evt.metaKey) evt.preventDefault();
        };
    }

    keyRaw(speccyKey, downNotUp) {
        this.worker.postMessage({
            message: downNotUp ? 'keyDown' : 'keyUp', row: speccyKey.row, mask: speccyKey.mask,
        })
    }

    symbolShift(trueOrFalse) {
        this.keyRaw(SPECCY.SYMBOL_SHIFT, trueOrFalse)
    }

    capsShift(trueOrFalse) {
        this.keyRaw(SPECCY.CAPS_SHIFT, trueOrFalse)
    }

    keyDown(speccyKey) {
        this.keyRaw(speccyKey, true)
        if ('caps' in speccyKey || 'sym' in speccyKey) {
            this.capsShift('caps' in speccyKey)
            this.symbolShift('sym' in speccyKey)
        } else if (speccyKey.isCaps) {
            this.capsIsShifted = true
        } else if (speccyKey.isSymbol) {
            this.symbolIsShifted = true
        }
    }

    keyUp(speccyKey) {
        this.keyRaw(speccyKey, false)
        if ('caps' in speccyKey || 'sym' in speccyKey) {
            this.capsShift(this.capsIsShifted)
            this.symbolShift(this.symbolIsShifted)
        } else if (speccyKey.isCaps) {
            this.capsIsShifted = false
        } else if (speccyKey.isSymbol) {
            this.symbolIsShifted = false
        }
    }
}

const RECREATED_SPECTRUM_GAME_LAYER = {
    "ab": SPECCY.ONE,
    "cd": SPECCY.TWO,
    "ef": SPECCY.THREE,
    "gh": SPECCY.FOUR,
    "ij": SPECCY.FIVE,
    "kl": SPECCY.SIX,
    "mn": SPECCY.SEVEN,
    "op": SPECCY.EIGHT,
    "qr": SPECCY.NINE,
    "st": SPECCY.ZERO,

    "uv": SPECCY.Q,
    "wx": SPECCY.W,
    "yz": SPECCY.E,
    "AB": SPECCY.R,
    "CD": SPECCY.T,
    "EF": SPECCY.Y,
    "GH": SPECCY.U,
    "IJ": SPECCY.I,
    "KL": SPECCY.O,
    "MN": SPECCY.P,

    "OP": SPECCY.A,
    "QR": SPECCY.S,
    "ST": SPECCY.D,
    "UV": SPECCY.F,
    "WX": SPECCY.G,
    "YZ": SPECCY.H,
    "01": SPECCY.J,
    "23": SPECCY.K,
    "45": SPECCY.L,
    "67": SPECCY.ENTER,

    "89": SPECCY.CAPS_SHIFT,
    "<>": SPECCY.Z,
    "-=": SPECCY.X,
    "[]": SPECCY.C,
    ";:": SPECCY.V,
    ",.": SPECCY.B,
    "/?": SPECCY.N,
    "{}": SPECCY.M,
    "!$": SPECCY.SYMBOL_SHIFT,
    "%^": SPECCY.BREAK_SPACE,
}
let recreatedUpDown = {}

for (const [pair, key] of Object.entries(RECREATED_SPECTRUM_GAME_LAYER)) {
    recreatedUpDown[pair.charAt(0)] = { ...key, message: "keyDown" }
    recreatedUpDown[pair.charAt(1)] = { ...key, message: "keyUp" }
}

export class RecreatedZXSpectrumHandler extends BaseKeyboardHandler {
    constructor(worker, rootElement) {
        super(worker, rootElement)

        this.keydownHandler = (evt) => {
            const specialCode = recreatedUpDown[evt.key]
            if (specialCode) {
                this.worker.postMessage({
                    message: specialCode.message, row: specialCode.row, mask: specialCode.mask,
                })
            }
            if (!evt.metaKey) evt.preventDefault();
        };

        this.keyupHandler = (evt) => {
            if (!evt.metaKey) evt.preventDefault();
        };
    }
}
