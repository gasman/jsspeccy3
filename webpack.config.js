export default [
    {
        output: {
            filename: 'jsspeccy.js',
        },
        name: 'jsspeccy',
        entry: './runtime/jsspeccy.js',
        mode: 'production',
    },
    {
        output: {
            filename: 'jsspeccy-worker.js',
        },
        name: 'worker',
        entry: './runtime/worker.js',
        mode: 'production',
    },
];
