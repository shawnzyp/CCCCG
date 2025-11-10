const fs = require('node:fs');
const path = require('node:path');

const setupFile = path.resolve(__dirname, 'tests', 'setup-env.js');

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  extensionsToTreatAsEsm: ['.jsx'],
  setupFilesAfterEnv: fs.existsSync(setupFile) ? [setupFile] : [],
  transform: {
    '^.+\\.[jt]sx?$': [
      '@swc/jest',
      {
        sourceMaps: 'inline',
        jsc: {
          target: 'es2021',
          parser: {
            syntax: 'ecmascript',
            jsx: true,
            dynamicImport: true,
          },
          transform: {
            react: {
              runtime: 'automatic',
            },
          },
        },
        module: {
          type: 'es6',
        },
      },
    ],
  },
};
