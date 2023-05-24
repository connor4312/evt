import { Emitter, EmitterOptions, Event, IDisposable } from '..';
/**
 * A safe disposable can be `unset` so that a leaked reference (listener)
 * can be cut-off.
 */
export class SafeDisposable implements IDisposable {
  dispose: () => void = () => {};
  unset: () => void = () => {};
  isset: () => boolean = () => false;

  constructor() {}

  set(fn: Function) {
    let callback: Function | undefined = fn;
    this.unset = () => (callback = undefined);
    this.isset = () => callback !== undefined;
    this.dispose = () => {
      if (callback) {
        callback();
        callback = undefined;
      }
    };
    return this;
  }
}

class Stacktrace {
  static create() {
    return new Stacktrace(new Error().stack ?? '');
  }

  private constructor(readonly value: string) {}

  print() {
    console.warn(this.value.split('\n').slice(2).join('\n'));
  }
}

class Listener<T> {
  readonly subscription = new SafeDisposable();

  constructor(
    readonly callback: (e: T) => void,
    readonly callbackThis: any | undefined,
    readonly stack: Stacktrace | undefined,
  ) {}

  invoke(e: T) {
    this.callback.call(this.callbackThis, e);
  }
}

/**
 * The Emitter can be used to expose an Event to the public
 * to fire it from the insides.
 * Sample:
	class Document {

		private readonly _onDidChange = new Emitter<(value:string)=>any>();

		public onDidChange = this._onDidChange.event;

		// getter-style
		// get onDidChange(): Event<(value:string)=>any> {
		// 	return this._onDidChange.event;
		// }

		private _doIt() {
			//...
			this._onDidChange.fire(value);
		}
	}
 */
export default class CodeEmitter<T> implements Emitter<T> {
  private readonly _options?: EmitterOptions;
  private _disposed: boolean = false;
  private _event?: Event<T>;
  private _deliveryQueue?: EventDeliveryQueue;
  protected _listeners?: LinkedList<Listener<T>>;

  constructor(options?: EmitterOptions) {
    this._options = options;
  }

  public get size() {
    return this._listeners?.size || 0;
  }

  dispose() {
    if (!this._disposed) {
      this._disposed = true;

      // It is bad to have listeners at the time of disposing an emitter, it is worst to have listeners keep the emitter
      // alive via the reference that's embedded in their disposables. Therefore we loop over all remaining listeners and
      // unset their subscriptions/disposables. Looping and blaming remaining listeners is done on next tick because the
      // the following programming pattern is very popular:
      //
      // const someModel = this._disposables.add(new ModelObject()); // (1) create and register model
      // this._disposables.add(someModel.onDidChange(() => { ... }); // (2) subscribe and register model-event listener
      // ...later...
      // this._disposables.dispose(); disposes (1) then (2): don't warn after (1) but after the "overall dispose" is done

      if (this._listeners) {
        this._listeners.clear();
      }
      this._deliveryQueue?.clear(this);
      this._options?.onDidRemoveLastListener?.(this);
    }
  }

  /**
   * For the public to allow to subscribe
   * to events from this Emitter
   */
  get event(): Event<T> {
    if (!this._event) {
      this._event = (callback: (e: T) => any, thisArgs?: any, disposables?: IDisposable[]) => {
        if (!this._listeners) {
          this._listeners = new LinkedList();
        }

        const firstListener = this._listeners.isEmpty();

        if (firstListener && this._options?.onWillAddFirstListener) {
          this._options.onWillAddFirstListener(this);
        }

        let removeMonitor: Function | undefined;
        let stack: Stacktrace | undefined;

        const listener = new Listener(callback, thisArgs, stack);
        const removeListener = this._listeners.push(listener);

        if (firstListener && this._options?.onDidAddFirstListener) {
          this._options.onDidAddFirstListener(this);
        }

        if (this._options?.onDidAddListener) {
          this._options.onDidAddListener(this, callback, thisArgs);
        }

        const result = listener.subscription.set(() => {
          removeMonitor?.();
          if (!this._disposed) {
            this._options?.onWillRemoveListener?.(this);
            removeListener();
            if (this._options && this._options.onDidRemoveLastListener) {
              const hasListeners = this._listeners && !this._listeners.isEmpty();
              if (!hasListeners) {
                this._options.onDidRemoveLastListener(this);
              }
            }
          }
        });

        if (Array.isArray(disposables)) {
          disposables.push(result);
        }

        return result;
      };
    }
    return this._event;
  }

  /**
   * To be kept private to fire an event to
   * subscribers
   */
  fire(event: T): void {
    if (this._listeners) {
      // put all [listener,event]-pairs into delivery queue
      // then emit all event. an inner/nested event might be
      // the driver of this

      if (!this._deliveryQueue) {
        this._deliveryQueue = new PrivateEventDeliveryQueue(this._options?.onListenerError);
      }

      for (const listener of this._listeners) {
        this._deliveryQueue.push(this, listener, event);
      }

      // start/stop performance insight collection

      this._deliveryQueue.deliver();
    }
  }

  hasListeners(): boolean {
    if (!this._listeners) {
      return false;
    }
    return !this._listeners.isEmpty();
  }
}

const onUnexpectedError = (err: Error) => {
  throw err;
};

export class EventDeliveryQueue {
  protected _queue = new LinkedList<EventDeliveryQueueElement>();

  constructor(private readonly _onListenerError: (e: any) => void = onUnexpectedError) {}

  get size(): number {
    return this._queue.size;
  }

  push<T>(emitter: Emitter<T>, listener: Listener<T>, event: T): void {
    this._queue.push(new EventDeliveryQueueElement(emitter, listener, event));
  }

  clear<T>(emitter: Emitter<T>): void {
    const newQueue = new LinkedList<EventDeliveryQueueElement>();
    for (const element of this._queue) {
      if (element.emitter !== emitter) {
        newQueue.push(element);
      }
    }
    this._queue = newQueue;
  }

  deliver(): void {
    while (this._queue.size > 0) {
      const element = this._queue.shift()!;
      try {
        element.listener.invoke(element.event);
      } catch (e) {
        this._onListenerError(e);
      }
    }
  }
}

class EventDeliveryQueueElement<T = any> {
  constructor(readonly emitter: Emitter<T>, readonly listener: Listener<T>, readonly event: T) {}
}

class Node<E> {
  static readonly Undefined = new Node<any>(undefined);

  element: E;
  next: Node<E>;
  prev: Node<E>;

  constructor(element: E) {
    this.element = element;
    this.next = Node.Undefined;
    this.prev = Node.Undefined;
  }
}

export class LinkedList<E> {
  private _first: Node<E> = Node.Undefined;
  private _last: Node<E> = Node.Undefined;
  private _size: number = 0;

  get size(): number {
    return this._size;
  }

  isEmpty(): boolean {
    return this._first === Node.Undefined;
  }

  clear(): void {
    let node = this._first;
    while (node !== Node.Undefined) {
      const next = node.next;
      node.prev = Node.Undefined;
      node.next = Node.Undefined;
      node = next;
    }

    this._first = Node.Undefined;
    this._last = Node.Undefined;
    this._size = 0;
  }

  unshift(element: E): () => void {
    return this._insert(element, false);
  }

  push(element: E): () => void {
    return this._insert(element, true);
  }

  private _insert(element: E, atTheEnd: boolean): () => void {
    const newNode = new Node(element);
    if (this._first === Node.Undefined) {
      this._first = newNode;
      this._last = newNode;
    } else if (atTheEnd) {
      // push
      const oldLast = this._last!;
      this._last = newNode;
      newNode.prev = oldLast;
      oldLast.next = newNode;
    } else {
      // unshift
      const oldFirst = this._first;
      this._first = newNode;
      newNode.next = oldFirst;
      oldFirst.prev = newNode;
    }
    this._size += 1;

    let didRemove = false;
    return () => {
      if (!didRemove) {
        didRemove = true;
        this._remove(newNode);
      }
    };
  }

  shift(): E | undefined {
    if (this._first === Node.Undefined) {
      return undefined;
    } else {
      const res = this._first.element;
      this._remove(this._first);
      return res;
    }
  }

  pop(): E | undefined {
    if (this._last === Node.Undefined) {
      return undefined;
    } else {
      const res = this._last.element;
      this._remove(this._last);
      return res;
    }
  }

  private _remove(node: Node<E>): void {
    if (node.prev !== Node.Undefined && node.next !== Node.Undefined) {
      // middle
      const anchor = node.prev;
      anchor.next = node.next;
      node.next.prev = anchor;
    } else if (node.prev === Node.Undefined && node.next === Node.Undefined) {
      // only node
      this._first = Node.Undefined;
      this._last = Node.Undefined;
    } else if (node.next === Node.Undefined) {
      // last
      this._last = this._last!.prev!;
      this._last.next = Node.Undefined;
    } else if (node.prev === Node.Undefined) {
      // first
      this._first = this._first!.next!;
      this._first.prev = Node.Undefined;
    }

    // done
    this._size -= 1;
  }

  *[Symbol.iterator](): Iterator<E> {
    let node = this._first;
    while (node !== Node.Undefined) {
      yield node.element;
      node = node.next;
    }
  }
}

/**
 * An `EventDeliveryQueue` that is guaranteed to be used by a single `Emitter`.
 */
class PrivateEventDeliveryQueue extends EventDeliveryQueue {
  override clear<T>(emitter: Emitter<T>): void {
    // Here we can just clear the entire linked list because
    // all elements are guaranteed to belong to this emitter
    this._queue.clear();
  }
}
