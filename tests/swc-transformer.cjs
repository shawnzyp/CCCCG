const crypto = require('node:crypto');
const { transformSync, transform, version: swcVersion } = require('@swc/core');

const baseOptions = {
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
};

function buildOptions(filename, jestOptions, isAsync) {
  return {
    ...baseOptions,
    filename,
    module: {
      type: isAsync || (jestOptions && jestOptions.supportsStaticESM) ? 'es6' : 'commonjs',
    },
  };
}

module.exports = {
  canInstrument: false,
  process(src, filename, jestOptions) {
    const result = transformSync(src, buildOptions(filename, jestOptions, false));
    return {
      code: result.code,
      map: result.map,
    };
  },
  async processAsync(src, filename, jestOptions) {
    const result = await transform(src, buildOptions(filename, jestOptions, true));
    return {
      code: result.code,
      map: result.map,
    };
  },
  getCacheKey(src, filename, ...rest) {
    return crypto
      .createHash('sha1')
      .update(src)
      .update('\0', 'utf8')
      .update(filename)
      .update('\0', 'utf8')
      .update(JSON.stringify(baseOptions))
      .update('\0', 'utf8')
      .update(String(rest[0]))
      .update('\0', 'utf8')
      .update(JSON.stringify(rest.slice(1)))
      .update('\0', 'utf8')
      .update(swcVersion)
      .digest('hex');
  },
};
