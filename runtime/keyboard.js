// Mapping from Spectrum key identifiers to keyboard matrix info
const SPECCY = {
    ONE: {row: 3, mask: 0x01},
    TWO: {row: 3, mask: 0x02},
    THREE: {row: 3, mask: 0x04},
    FOUR: {row: 3, mask: 0x08},
    FIVE: {row: 3, mask: 0x10},
    SIX: {row: 4, mask: 0x10},
    SEVEN: {row: 4, mask: 0x08},
    EIGHT: {row: 4, mask: 0x04},
    NINE: {row: 4, mask: 0x02},
    ZERO: {row: 4, mask: 0x01},

    Q: {row: 2, mask: 0x01},
    W: {row: 2, mask: 0x02},
    E: {row: 2, mask: 0x04},
    R: {row: 2, mask: 0x08},
    T: {row: 2, mask: 0x10},
    Y: {row: 5, mask: 0x10},
    U: {row: 5, mask: 0x08},
    I: {row: 5, mask: 0x04},
    O: {row: 5, mask: 0x02},
    P: {row: 5, mask: 0x01},

    A: {row: 1, mask: 0x01},
    S: {row: 1, mask: 0x02},
    D: {row: 1, mask: 0x04},
    F: {row: 1, mask: 0x08},
    G: {row: 1, mask: 0x10},
    H: {row: 6, mask: 0x10},
    J: {row: 6, mask: 0x08},
    K: {row: 6, mask: 0x04},
    L: {row: 6, mask: 0x02},
    ENTER: {row: 6, mask: 0x01},

    CAPS_SHIFT: {row: 0, mask: 0x01, isCaps: true},
    Z: {row: 0, mask: 0x02},
    X: {row: 0, mask: 0x04},
    C: {row: 0, mask: 0x08},
    V: {row: 0, mask: 0x10},
    B: {row: 7, mask: 0x10},
    N: {row: 7, mask: 0x08},
    M: {row: 7, mask: 0x04},
    SYMBOL_SHIFT: {row: 7, mask: 0x02, isSymbol: true},
    BREAK_SPACE: {row: 7, mask: 0x01},
};

function sym(speccyKey) {
    // patch key definition to indicate that symbol shift should be activated
    return {...speccyKey, sym: true}
}

function caps(speccyKey) {
    // patch key definition to indicate that caps shift should be activated
    return {...speccyKey, caps: true}
}

// Mapping from JS key codes to Spectrum key definitions
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
KEY_CODES[String.fromCharCode(0x2264)] = sym(SPECCY.Q); // LESS_THAN_EQUAL symbol (≤)
KEY_CODES[String.fromCharCode(0x2265)] = sym(SPECCY.E); // GREATER_THAN_EQUAL symbol (≥)
KEY_CODES[String.fromCharCode(0x2260)] = sym(SPECCY.W); // NOT_EQUAL symbol (≠)


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
        super(worker, rootElement);

        // if true, the real symbol shift key is being held (as opposed to being active through a
        // virtual key combination)
        this.symbolIsShifted = false;

        // if true, the real caps shift key is being held (as opposed to being active through a
        // virtual key combination)
        this.capsIsShifted = false;

        // When a keypress is recognised by its character rather than its numeric key code, store
        // the resolved key info struct here, indexed by key code. If the state of shift keys
        // changes while that key is held down, we will see subsequent keydown events with a
        // different character but the same key code. For example, if the user holds the semicolon
        // key and then presses shift, we will see a keydown event with {keyCode: 186, key: ';'},
        // and then another keydown event with {keyCode: 186, key=':'}. In this case, we would need
        // to simulate a keyup event for the semicolon before registering the colon as a new
        // keypress. This table allows us to recognise when changes like this happen.
        this.seenKeyCodes = {};

        this.keydownHandler = (evt) => {
            let keyInfo = KEY_CODES[evt.keyCode];
            if (keyInfo) {
                this.keyDown(keyInfo);
            } else {
                keyInfo = KEY_CODES[evt.key];
                if (keyInfo) {
                    const lastKeyInfo = this.seenKeyCodes[evt.keyCode];
                    if (lastKeyInfo && lastKeyInfo !== keyInfo) {
                        this.keyUp(lastKeyInfo);
                    }
                    this.seenKeyCodes[evt.keyCode] = keyInfo;
                    this.keyDown(keyInfo);
                }
            }
            if (!evt.metaKey) evt.preventDefault();
        };

        this.keyupHandler = (evt) => {
            const keyInfo = KEY_CODES[evt.keyCode];
            if (keyInfo) {
                this.keyUp(keyInfo);
            } else {
                const lastKeyInfo = this.seenKeyCodes[evt.keyCode];
                if (lastKeyInfo) {
                    this.seenKeyCodes[evt.keyCode] = null;
                    this.keyUp(lastKeyInfo);
                }
            }
            if (!evt.metaKey) evt.preventDefault();
        };
    }

    sendKeyMessage(speccyKey, downNotUp) {
        this.worker.postMessage({
            message: downNotUp ? 'keyDown' : 'keyUp', row: speccyKey.row, mask: speccyKey.mask,
        });
    }

    keyDown(speccyKey) {
        this.sendKeyMessage(speccyKey, true);
        if ('caps' in speccyKey || 'sym' in speccyKey) {
            this.sendKeyMessage(SPECCY.CAPS_SHIFT, 'caps' in speccyKey);
            this.sendKeyMessage(SPECCY.SYMBOL_SHIFT, 'sym' in speccyKey);
        } else if (speccyKey.isCaps) {
            this.capsIsShifted = true;
        } else if (speccyKey.isSymbol) {
            this.symbolIsShifted = true;
        }
    }

    keyUp(speccyKey) {
        this.sendKeyMessage(speccyKey, false);
        if ('caps' in speccyKey || 'sym' in speccyKey) {
            this.sendKeyMessage(SPECCY.CAPS_SHIFT, this.capsIsShifted);
            this.sendKeyMessage(SPECCY.SYMBOL_SHIFT, this.symbolIsShifted);
        } else if (speccyKey.isCaps) {
            this.capsIsShifted = false;
        } else if (speccyKey.isSymbol) {
            this.symbolIsShifted = false;
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
};
let recreatedUpDown = {};

for (const [pair, key] of Object.entries(RECREATED_SPECTRUM_GAME_LAYER)) {
    recreatedUpDown[pair.charAt(0)] = { ...key, message: "keyDown" };
    recreatedUpDown[pair.charAt(1)] = { ...key, message: "keyUp" };
}

export class RecreatedZXSpectrumHandler extends BaseKeyboardHandler {
    constructor(worker, rootElement) {
        super(worker, rootElement);

        this.keydownHandler = (evt) => {
            const specialCode = recreatedUpDown[evt.key];
            if (specialCode) {
                this.worker.postMessage({
                    message: specialCode.message, row: specialCode.row, mask: specialCode.mask,
                });
            }
            if (!evt.metaKey) evt.preventDefault();
        };

        this.keyupHandler = (evt) => {
            if (!evt.metaKey) evt.preventDefault();
        };
    }
}
