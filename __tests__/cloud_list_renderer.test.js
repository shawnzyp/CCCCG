import { renderCloudCharacterList } from '../scripts/cloud-list-renderer.js';

describe('cloud list renderer', () => {
  test('renders an Open button when configured', () => {
    document.body.innerHTML = '<div id="list"></div>';
    const container = document.getElementById('list');
    renderCloudCharacterList(container, [{
      characterId: 'char-1',
      name: 'Hero',
      updatedAt: 1234,
    }], {
      actionLabel: 'Open',
      onOpen: () => {},
    });
    const button = container.querySelector('button');
    expect(button).not.toBeNull();
    expect(button.textContent).toBe('Open');
  });

  test('clicking Open triggers the handler', () => {
    document.body.innerHTML = '<div id="list"></div>';
    const container = document.getElementById('list');
    const loadCloudCharacter = jest.fn();
    const saveLocal = jest.fn();
    const onOpen = jest.fn((entry) => {
      loadCloudCharacter(entry.characterId);
      saveLocal(entry.name);
    });
    renderCloudCharacterList(container, [{
      characterId: 'char-1',
      name: 'Hero',
      updatedAt: 1234,
    }], {
      actionLabel: 'Open',
      onOpen,
    });
    const button = container.querySelector('button');
    button.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(loadCloudCharacter).toHaveBeenCalledWith('char-1');
    expect(saveLocal).toHaveBeenCalledWith('Hero');
  });
});
