module.exports = [
    {
        output: {
            filename: 'jsspeccy.js',
        },
        name: 'jsspeccy',
        entry: './js/jsspeccy.js',
        mode: 'production',
    },
    {
        output: {
            filename: 'jsspeccy-worker.js',
        },
        name: 'worker',
        entry: './js/worker.js',
        mode: 'production',
    },
];
