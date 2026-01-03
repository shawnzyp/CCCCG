import { __test__ } from '../src/index.js';

describe('discord worker payload normalization', () => {
  test('valid roll payload yields roll kind', () => {
    const payload = { roll: { who: 'Vigilante', expr: '1d20+5', total: 17 } };
    const result = __test__.normalizeRequestPayload(payload);
    expect(result.kind).toBe('roll');
    expect(result.normalized.roll.expr).toBe('1d20+5');
    expect(result.normalized.roll.total).toBe(17);
  });

  test('invalid roll payload rejects placeholder', () => {
    const payload = { roll: { who: 'Someone', expr: 'roll', total: '?' } };
    const result = __test__.normalizeRequestPayload(payload);
    expect(result.error).toBe('invalid_roll');
    expect(result.details).toEqual({
      expr: 'roll',
      totalType: 'string',
      totalValue: '?',
    });
  });

  test('event wrapper beats roll in payload', () => {
    const payload = {
      event: 'initiative.roll',
      payload: { roll: { who: 'Someone', expr: 'roll', total: '?' } },
    };
    const result = __test__.normalizeRequestPayload(payload);
    expect(result.kind).toBe('event-structured');
    expect(result.build.embeds[0].title).toBe('Event');
  });

  test('blocked content is detected in raw payloads', () => {
    const payload = { content: 'Someone rolled `roll` = **?**' };
    expect(__test__.containsBlockedContent(payload)).toBe(true);
  });
});
