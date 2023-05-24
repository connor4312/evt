import { describe, expect, it, vi } from 'vitest';
import { once, toPromise } from '.';
import { IDisposable } from './impl-c4312-evt';
import { allImplementations } from './meta/test-util';

for (const { name, impl: EventEmitter } of allImplementations) {
  describe(name, () => {
    describe('Event', () => {
      it('Emitter to multiple', () => {
        const fn1 = vi.fn();
        const fn2 = vi.fn();
        const emitter = new EventEmitter<string>();

        const s1 = emitter.event(fn1);
        const s2 = emitter.event(fn2);
        emitter.fire('foo');
        emitter.fire('bar');

        s1.dispose();
        emitter.fire('boo');
        s2.dispose();
        emitter.fire('boz');

        expect(fn1.mock.calls).to.deep.equal([['foo'], ['bar']]);
        expect(fn2.mock.calls).to.deep.equal([['foo'], ['bar'], ['boo']]);
      });

      it('Emitter plain', () => {
        const fn = vi.fn();
        const emitter = new EventEmitter<string>();

        const s = emitter.event(fn);
        emitter.fire('foo');
        emitter.fire('bar');

        s.dispose();
        emitter.fire('boo');
        expect(fn.mock.calls).to.deep.equal([['foo'], ['bar']]);
      });

      it('Emitter, bucket', () => {
        const bucket: IDisposable[] = [];
        const fn = vi.fn();
        const emitter = new EventEmitter<string>();

        emitter.event(fn, undefined, bucket);
        emitter.fire('foo');
        emitter.fire('bar');

        while (bucket.length) {
          bucket.pop()!.dispose();
        }

        emitter.fire('boo');
        expect(fn.mock.calls).to.deep.equal([['foo'], ['bar']]);
      });

      it('reusing event function and context', function () {
        let counter = 0;
        function listener() {
          counter += 1;
        }
        const context = {};

        const emitter = new EventEmitter<undefined>();
        const reg1 = emitter.event(listener, context);
        const reg2 = emitter.event(listener, context);

        emitter.fire(undefined);
        expect(counter).toStrictEqual(2);

        reg1.dispose();
        emitter.fire(undefined);
        expect(counter).toStrictEqual(3);

        reg2.dispose();
        emitter.fire(undefined);
        expect(counter).toStrictEqual(3);
      });

      it('Emitter - In Order Delivery', function () {
        const a = new EventEmitter<string>();
        const listener2Events: string[] = [];
        a.event(function listener1(event) {
          if (event === 'e1') {
            a.fire('e2');
            // assert that all events are delivered at this point
            expect(listener2Events).toEqual(['e1', 'e2']);
          }
        });
        a.event(function listener2(event) {
          listener2Events.push(event);
        });
        a.fire('e1');

        // assert that all events are delivered in order
        expect(listener2Events).toEqual(['e1', 'e2']);
      });

      it('Emitter - In Order Delivery 3x', function () {
        const a = new EventEmitter<string>();
        const listener2Events: string[] = [];
        a.event(function listener1(event) {
          if (event === 'e2') {
            a.fire('e3');
            // assert that all events are delivered at this point
            expect(listener2Events).toEqual(['e1', 'e2', 'e3']);
          }
        });
        a.event(function listener1(event) {
          if (event === 'e1') {
            a.fire('e2');
            // assert that all events are delivered at this point
            expect(listener2Events).toEqual(['e1', 'e2', 'e3']);
          }
        });
        a.event(function listener2(event) {
          listener2Events.push(event);
        });
        a.fire('e1');

        // assert that all events are delivered in order
        expect(listener2Events).toEqual(['e1', 'e2', 'e3']);
      });

      it('onFirstAdd|onLastRemove', () => {
        let firstCount = 0;
        let lastCount = 0;
        const a = new EventEmitter({
          onWillAddFirstListener() {
            firstCount += 1;
          },
          onDidRemoveLastListener() {
            lastCount += 1;
          },
        });

        expect(firstCount).toBe(0);
        expect(lastCount).toBe(0);

        let subscription = a.event(function () {});
        expect(firstCount).toBe(1);
        expect(lastCount).toBe(0);

        subscription.dispose();
        expect(firstCount).toBe(1);
        expect(lastCount).toBe(1);

        subscription = a.event(function () {});
        expect(firstCount).toBe(2);
        expect(lastCount).toBe(1);
      });

      it('onWillRemoveListener', () => {
        let count = 0;
        const a = new EventEmitter({
          onWillRemoveListener() {
            count += 1;
          },
        });

        expect(count).toBe(0);

        let subscription = a.event(function () {});
        expect(count).toBe(0);

        subscription.dispose();
        expect(count).toBe(1);

        subscription = a.event(function () {});
        expect(count).toBe(1);
      });

      it('throwingListener (custom handler)', () => {
        const allError: any[] = [];

        const a = new EventEmitter<undefined>({
          onListenerError(e) {
            allError.push(e);
          },
        });
        let hit = false;
        a.event(function () {
          // eslint-disable-next-line no-throw-literal
          throw 9;
        });
        a.event(function () {
          hit = true;
        });
        a.fire(undefined);
        expect(hit).toBe(true);
        expect(allError).toStrictEqual([9]);
      });

      it('Emitter handles removal during 3', () => {
        const fn1 = vi.fn();
        const fn2 = vi.fn();
        const emitter = new EventEmitter<string>();

        emitter.event(fn1);
        const h = emitter.event(() => {
          h.dispose();
        });
        emitter.event(fn2);
        emitter.fire('foo');

        expect(fn2.mock.calls).to.deep.equal([['foo']]);
        expect(fn1.mock.calls).to.deep.equal([['foo']]);
      });

      it('Emitter handles removal during 2', () => {
        const fn1 = vi.fn();
        const emitter = new EventEmitter<string>();

        emitter.event(fn1);
        const h = emitter.event(() => {
          h.dispose();
        });
        emitter.fire('foo');

        expect(fn1.mock.calls).to.deep.equal([['foo']]);
      });

      describe('utils', () => {
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
    });
  });
}
