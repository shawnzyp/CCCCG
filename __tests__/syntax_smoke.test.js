describe('syntax smoke', () => {
  test('scripts/auth.js loads without syntax errors', () => {
    expect(() => {
      require('../scripts/auth.js');
    }).not.toThrow();
  });
});
