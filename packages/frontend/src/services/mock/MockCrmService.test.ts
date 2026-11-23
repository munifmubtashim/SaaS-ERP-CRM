import { followUpListResponseSchema } from '@erp/shared';
import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../HttpClient';
import { MockCrmService } from './MockCrmService';

const mock = new MockCrmService(0);

describe('MockCrmService (stands in for GET /v1/follow-ups)', () => {
  it('answers in the shape the API will, newest first', async () => {
    const page = followUpListResponseSchema.parse(await mock.listFollowUps({ limit: 100 }));
    const times = page.items.map((r) => r.contactedAt);
    expect(times).toEqual([...times].sort().reverse());
    expect(page.nextCursor).toBeNull();
  });

  it('filters by promise status and by customer', async () => {
    const broken = await mock.listFollowUps({ promiseStatus: 'broken', limit: 100 });
    expect(broken.items.length).toBeGreaterThan(0);
    expect(broken.items.every((r) => r.promise?.status === 'broken')).toBe(true);

    const partyId = broken.items[0]?.partyId ?? '';
    const own = await mock.listFollowUps({ partyId, limit: 100 });
    expect(own.items.every((r) => r.partyId === partyId)).toBe(true);
  });

  it('pages with an opaque cursor and refuses an unknown one', async () => {
    const first = await mock.listFollowUps({ limit: 2 });
    const second = await mock.listFollowUps({ limit: 2, cursor: first.nextCursor ?? undefined });
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
    await expect(mock.listFollowUps({ cursor: 'nonsense' })).rejects.toBeInstanceOf(ApiRequestError);
  });
});
