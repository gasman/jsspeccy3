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
            filename: 'worker.js',
        },
        name: 'worker',
        entry: './js/worker.js',
        mode: 'production',
    },
];
