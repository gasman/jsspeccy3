import * as fs from 'fs';

/* Load the emulator core for tests.

   The obvious approach - `import * as core from '.../jsspeccy-core.wasm'` -
   relies on Node's WebAssembly ES module integration, which is still
   experimental and needs --experimental-wasm-modules. That makes the test
   suite sensitive to the Node version it runs under, which is exactly what we
   do not want in CI.

   The core imports nothing, so instantiating it directly is straightforward
   and works on every supported Node version without flags. The one wrinkle is
   that the ESM integration exposes an exported global as its value, whereas
   instance.exports exposes a WebAssembly.Global object, so unwrap those to
   keep the same shape the tests expect. */
const wasmPath = new URL('../dist/jsspeccy/jsspeccy-core.wasm', import.meta.url);
const { instance } = await WebAssembly.instantiate(fs.readFileSync(wasmPath), {});

const core = {};
for (const [name, value] of Object.entries(instance.exports)) {
    core[name] = (value instanceof WebAssembly.Global) ? value.value : value;
}

export default core;
