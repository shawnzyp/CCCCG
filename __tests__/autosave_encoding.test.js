import { jest } from '@jest/globals';

describe('cloud autosave path encoding', () => {
  afterEach(() => {
    localStorage.removeItem('cc:device-id');
    jest.resetModules();
    jest.restoreAllMocks();
  });

  test('uses uid and character ids in autosave paths', async () => {
    const calls = [];
    const { saveCloudAutosave, setActiveAuthUserId, setDatabaseRefFactory } = await import('../scripts/storage.js');

    setDatabaseRefFactory(path => {
      calls.push(path);
      return {
        set: jest.fn().mockResolvedValue(),
        once: jest.fn().mockResolvedValue({ val: () => ({}) }),
        remove: jest.fn().mockResolvedValue(),
        on: jest.fn(),
        off: jest.fn(),
        child: jest.fn().mockReturnThis(),
        orderByKey: jest.fn().mockReturnThis(),
        limitToLast: jest.fn().mockReturnThis(),
      };
    });

    setActiveAuthUserId('user-123');
    await saveCloudAutosave('Al.ice.Bob', { foo: 'bar', character: { characterId: 'character-456' } });
    setActiveAuthUserId('');
    setDatabaseRefFactory(null);

    const encodedUid = 'user-123';
    const encodedCharacter = 'character-456';
    expect(calls.some((path) => path.includes(`autosaves/${encodedUid}/${encodedCharacter}/`))).toBe(true);
  });

  test('lists autosaves using encoded uid and character ids', async () => {
    const calls = [];
    const { listCloudAutosaves, setActiveAuthUserId, setDatabaseRefFactory } = await import('../scripts/storage.js');

    setDatabaseRefFactory(path => {
      calls.push(path);
      return {
        set: jest.fn().mockResolvedValue(),
        once: jest.fn().mockResolvedValue({ val: () => ({ 123: { foo: 'bar' } }) }),
        remove: jest.fn().mockResolvedValue(),
        on: jest.fn(),
        off: jest.fn(),
        child: jest.fn().mockReturnThis(),
        orderByKey: jest.fn().mockReturnThis(),
        limitToLast: jest.fn().mockReturnThis(),
      };
    });

    setActiveAuthUserId('user.id');
    await listCloudAutosaves('MyChar', { characterId: 'char.id' });
    setActiveAuthUserId('');
    setDatabaseRefFactory(null);

    const encodedUid = 'user%2Eid';
    const encodedCharacter = 'char%2Eid';
    expect(calls.some((path) => path.includes(`autosaves/${encodedUid}/${encodedCharacter}`))).toBe(true);
  });
});
