const fs = require('node:fs');
const path = require('node:path');

const setupFile = path.resolve(__dirname, 'tests', 'setup-env.js');

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  extensionsToTreatAsEsm: ['.jsx'],
  setupFilesAfterEnv: fs.existsSync(setupFile) ? [setupFile] : [],
  transform: {
    '^.+\\.[jt]sx?$': [path.resolve(__dirname, 'tests', 'swc-transformer.cjs'), {}],
  },
};
