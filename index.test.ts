import { describe, expect, it, vi } from 'vitest';
import { EventEmitter, once, toPromise } from '.';

describe('Event', () => {
  it('emits events', () => {
    const s1 = vi.fn();
    const s2 = vi.fn();
    const s3 = vi.fn();
    const emitter = new EventEmitter<number>();

    const l1 = emitter.event(s1);
    emitter.fire(1);
    const l2 = emitter.event(s2);
    emitter.fire(2);
    const l3 = emitter.event(s3);
    emitter.fire(3);

    l1.dispose();
    emitter.fire(4);
    l2.dispose();
    emitter.fire(5);
    l3.dispose();
    emitter.fire(6);

    expect(s1.mock.calls).to.deep.equal([[1], [2], [3]]);
    expect(s2.mock.calls).to.deep.equal([[2], [3], [4]]);
    expect(s3.mock.calls).to.deep.equal([[3], [4], [5]]);
  });

  it('emits events once', () => {
    const s = vi.fn();
    const emitter = new EventEmitter<number>();

    once(emitter.event, s);
    emitter.fire(42);
    emitter.fire(42);

    expect(s).toHaveBeenCalledWith(42);
    expect(s).toHaveBeenCalledOnce();
  });

  it('converts to promise', async () => {
    const emitter = new EventEmitter<number>();
    const v = toPromise(emitter.event);
    emitter.fire(42);
    expect(await v).to.equal(42);

    expect(emitter.size).to.equal(0);
  });

  it('cancels conversion to promise', async () => {
    const emitter = new EventEmitter<number>();
    const cts = new AbortController();
    setTimeout(() => cts.abort(), 1);
    const v = toPromise(emitter.event, cts.signal);
    expect(await v).to.be.undefined;
    expect(emitter.size).to.equal(0);
  });

  it('cancels conversion to promise sync', async () => {
    const s = new AbortController();
    s.abort();

    const emitter = new EventEmitter<number>();
    const v = toPromise(emitter.event, s.signal);
    expect(await v).to.be.undefined;
    expect(emitter.size).to.equal(0);
  });
});
