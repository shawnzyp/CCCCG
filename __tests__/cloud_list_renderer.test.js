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
});
