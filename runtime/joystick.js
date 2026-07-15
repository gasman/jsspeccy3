import { SPECCY } from './keyboard.js';

/*
    Reads a physical joystick / gamepad connected to the host PC (via the browser
    Gamepad API) and translates its movements into the emulated machine's joystick
    or keyboard input.

    Supported joystick types:
      - 'kempston': reported directly on the Kempston port
      - 'cursor':   mapped to the cursor (Protek / AGF) keys 5,6,7,8 + 0
      - 'sinclair1': mapped to Sinclair Interface 2 joystick 1 (keys 6-0)
      - 'sinclair2': mapped to Sinclair Interface 2 joystick 2 (keys 1-5)
*/

// Kempston port bit values (active high)
const KEMPSTON_RIGHT = 0x01;
const KEMPSTON_LEFT = 0x02;
const KEMPSTON_DOWN = 0x04;
const KEMPSTON_UP = 0x08;
const KEMPSTON_FIRE = 0x10;

// Keyboard-based joystick mappings: which Spectrum key each direction / fire maps to
const KEY_MAPPINGS = {
    cursor: {
        up: SPECCY.SEVEN, down: SPECCY.SIX, left: SPECCY.FIVE, right: SPECCY.EIGHT, fire: SPECCY.ZERO,
    },
    sinclair1: {
        up: SPECCY.NINE, down: SPECCY.EIGHT, left: SPECCY.SIX, right: SPECCY.SEVEN, fire: SPECCY.ZERO,
    },
    sinclair2: {
        up: SPECCY.FOUR, down: SPECCY.THREE, left: SPECCY.ONE, right: SPECCY.TWO, fire: SPECCY.FIVE,
    },
};

// Above what magnitude an analogue stick axis counts as a direction press
const AXIS_THRESHOLD = 0.5;

export class JoystickHandler {
    constructor(worker, joystickType, deviceSelector) {
        this.worker = worker;
        this.type = joystickType || 'kempston';
        // which physical controller to read. null / '' / 'auto' = use the first
        // connected one; otherwise a (case-insensitive) substring matched against
        // the gamepad's id, so the menu can pass an exact id and config can pass
        // a partial name such as 'Wireless'.
        this.deviceSelector = (deviceSelector && deviceSelector != 'auto') ? deviceSelector : null;
        this.running = false;

        // last reported direction / fire state, so we only emit input on changes
        this.lastState = {up: false, down: false, left: false, right: false, fire: false};

        this.pollHandler = () => {
            if (!this.running) return;
            this.poll();
            requestAnimationFrame(this.pollHandler);
        };
    }

    setType(joystickType) {
        // release anything currently held under the old mapping before switching
        this.releaseAll();
        this.type = joystickType || 'kempston';
    }

    setDevice(deviceSelector) {
        // release anything held on the old device before switching
        this.releaseAll();
        this.deviceSelector = (deviceSelector && deviceSelector != 'auto') ? deviceSelector : null;
    }

    // Does the given gamepad id match the currently selected device?
    deviceMatches(id) {
        return !!this.deviceSelector && id.toLowerCase().includes(this.deviceSelector.toLowerCase());
    }

    // List the controllers the browser can currently see. Note that a gamepad
    // only appears here once the user has pressed a button on it (a browser
    // requirement), so this may be empty until then.
    getDevices() {
        if (!this.supported()) return [];
        const devices = [];
        for (const gamepad of navigator.getGamepads()) {
            if (gamepad && gamepad.connected) {
                devices.push({
                    id: gamepad.id,
                    // strip the trailing "(Vendor: .... Product: ....)" for display
                    label: gamepad.id.split(' (')[0] || gamepad.id,
                });
            }
        }
        return devices;
    }

    supported() {
        return (typeof navigator !== 'undefined' && !!navigator.getGamepads);
    }

    start() {
        if (this.running || !this.supported()) return;
        this.running = true;
        requestAnimationFrame(this.pollHandler);
    }

    stop() {
        this.running = false;
        this.releaseAll();
    }

    // Read the selected gamepad (or the first connected one, in 'auto' mode) and
    // derive the current joystick state
    readGamepadState() {
        const state = {up: false, down: false, left: false, right: false, fire: false};
        if (!this.supported()) return state;

        const gamepads = navigator.getGamepads();
        let gamepad = null;
        for (let i = 0; i < gamepads.length; i++) {
            const g = gamepads[i];
            if (!g || !g.connected) continue;
            if (this.deviceSelector) {
                // a specific controller was chosen: only read that one, and stay
                // neutral if it isn't currently present (rather than silently
                // falling through to a different controller)
                if (this.deviceMatches(g.id)) { gamepad = g; break; }
            } else {
                gamepad = g;  // 'auto': first connected controller
                break;
            }
        }
        if (!gamepad) return state;

        // analogue stick (axes 0 = horizontal, 1 = vertical)
        const axes = gamepad.axes;
        if (axes.length >= 2) {
            if (axes[0] < -AXIS_THRESHOLD) state.left = true;
            if (axes[0] > AXIS_THRESHOLD) state.right = true;
            if (axes[1] < -AXIS_THRESHOLD) state.up = true;
            if (axes[1] > AXIS_THRESHOLD) state.down = true;
        }

        // d-pad (standard gamepad mapping: 12 = up, 13 = down, 14 = left, 15 = right)
        const buttons = gamepad.buttons;
        const pressed = (i) => (i < buttons.length && buttons[i] && buttons[i].pressed);
        if (pressed(12)) state.up = true;
        if (pressed(13)) state.down = true;
        if (pressed(14)) state.left = true;
        if (pressed(15)) state.right = true;

        // fire: treat any face / shoulder / trigger button as fire
        for (let i = 0; i < buttons.length; i++) {
            if (i >= 12 && i <= 15) continue;  // skip the d-pad buttons handled above
            if (buttons[i] && buttons[i].pressed) {
                state.fire = true;
                break;
            }
        }

        return state;
    }

    poll() {
        const state = this.readGamepadState();
        this.applyState(state);
    }

    applyState(state) {
        if (this.type == 'kempston') {
            let byte = 0;
            if (state.right) byte |= KEMPSTON_RIGHT;
            if (state.left) byte |= KEMPSTON_LEFT;
            if (state.down) byte |= KEMPSTON_DOWN;
            if (state.up) byte |= KEMPSTON_UP;
            if (state.fire) byte |= KEMPSTON_FIRE;

            let lastByte = 0;
            if (this.lastState.right) lastByte |= KEMPSTON_RIGHT;
            if (this.lastState.left) lastByte |= KEMPSTON_LEFT;
            if (this.lastState.down) lastByte |= KEMPSTON_DOWN;
            if (this.lastState.up) lastByte |= KEMPSTON_UP;
            if (this.lastState.fire) lastByte |= KEMPSTON_FIRE;

            if (byte != lastByte) {
                this.worker.postMessage({message: 'setKempstonState', state: byte});
            }
        } else {
            const mapping = KEY_MAPPINGS[this.type];
            if (mapping) {
                for (const dir of ['up', 'down', 'left', 'right', 'fire']) {
                    if (state[dir] != this.lastState[dir]) {
                        this.sendKey(mapping[dir], state[dir]);
                    }
                }
            }
        }
        this.lastState = state;
    }

    sendKey(speccyKey, downNotUp) {
        if (!speccyKey) return;
        this.worker.postMessage({
            message: downNotUp ? 'keyDown' : 'keyUp',
            row: speccyKey.row,
            mask: speccyKey.mask,
        });
    }

    // Release any input currently held, so that switching type or stopping doesn't
    // leave a direction / fire stuck down.
    releaseAll() {
        const cleared = {up: false, down: false, left: false, right: false, fire: false};
        if (this.type == 'kempston') {
            const anyHeld = this.lastState.up || this.lastState.down || this.lastState.left
                || this.lastState.right || this.lastState.fire;
            if (anyHeld) {
                this.worker.postMessage({message: 'setKempstonState', state: 0});
            }
        } else {
            const mapping = KEY_MAPPINGS[this.type];
            if (mapping) {
                for (const dir of ['up', 'down', 'left', 'right', 'fire']) {
                    if (this.lastState[dir]) {
                        this.sendKey(mapping[dir], false);
                    }
                }
            }
        }
        this.lastState = cleared;
    }
}
