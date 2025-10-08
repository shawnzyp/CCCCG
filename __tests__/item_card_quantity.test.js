import { buildCardInfo } from '../scripts/card-info.js';

describe('buildCardInfo quantity parsing', () => {
  it('parses trailing quantity indicators in item names', () => {
    const entry = { type: 'Item', name: 'Spark Flares x3' };
    const card = buildCardInfo(entry);
    expect(card).toEqual({
      kind: 'item',
      listId: 'items',
      data: expect.objectContaining({
        name: 'Spark Flares',
        qty: 3,
      }),
    });
  });

  it('uses explicit qty when provided', () => {
    const entry = { type: 'Item', name: 'Spark Flares x3', qty: 5 };
    const card = buildCardInfo(entry);
    expect(card.data.qty).toBe(5);
    expect(card.data.name).toBe('Spark Flares');
  });
});
