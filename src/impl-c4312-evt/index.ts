import { Emitter, EmitterOptions } from '..';

export interface IDisposable {
  dispose(): void;
}

export interface Event<T> {
  (listener: (e: T) => any, thisArgs?: any, disposables?: IDisposable[]): IDisposable;
}

const noOptions: EmitterOptions = {};
const unset = Symbol('unset');
const compactionThreshold = 2;

class UniqueContainer<T> {
  constructor(public readonly value: T) {}
}

/**
 * Base event emitter. Calls listeners when data is emitted.
 */
export default class C4312Emitter<T> implements Emitter<T> {
  private listeners?:
    | Array<UniqueContainer<(data: T) => void> | undefined>
    | UniqueContainer<(data: T) => void>;
  private dispatching!: { value: T | typeof unset; lastL: number };
  public size = 0;

  constructor(private readonly options: EmitterOptions = noOptions) {}

  /**
   * Event<T> function.
   */
  public readonly event: Event<T> = (listener, thisArg, disposables) => {
    const d = this.add(thisArg ? listener.bind(thisArg) : listener);
    disposables?.push(d);
    this.options.onDidAddListener?.(this, listener, thisArg);
    return d;
  };

  /**
   * Emits event data.
   */
  public fire(value: T) {
    if (!this.listeners) {
      // no-op
    } else if (this.listeners instanceof UniqueContainer) {
      this.deliver(this.listeners, value);
    } else {
      if (this.dispatching.value !== unset) {
        while (this.dispatching.lastL < this.listeners.length) {
          this.deliver(this.listeners[this.dispatching.lastL++], this.dispatching.value);
        }
      }

      this.dispatching.lastL = 0;
      this.dispatching.value = value;
      while (this.dispatching.lastL < this.listeners.length) {
        this.deliver(this.listeners[this.dispatching.lastL++], this.dispatching.value);
      }
      this.dispatching.value = unset;
    }
  }

  private deliver(listener: undefined | UniqueContainer<(value: T) => void>, value: T) {
    if (!listener) {
      return;
    }

    if (!this.options.onListenerError) {
      listener.value(value);
      return;
    }

    try {
      listener.value(value);
    } catch (e) {
      this.options.onListenerError(e);
    }
  }

  /**
   * Disposes of the emitter.
   */
  public dispose() {
    if (this.dispatching.value === unset) {
      this.listeners = undefined;
    } else {
      this.listeners = [];
    }
  }

  private add(listener: (data: T) => void): IDisposable {
    const contained = new UniqueContainer(listener);
    if (!this.listeners) {
      this.options.onWillAddFirstListener?.(this);
      this.listeners = contained;
      this.options.onDidAddFirstListener?.(this);
    } else if (this.listeners instanceof UniqueContainer) {
      this.dispatching = { value: unset, lastL: 0 };
      this.listeners = [this.listeners, contained];
    } else {
      this.listeners.push(contained);
    }

    this.size++;

    return { dispose: () => this.rm(contained) };
  }

  private rm(listener: UniqueContainer<(data: T) => void>) {
    this.options.onWillRemoveListener?.(this);

    if (!this.listeners) {
      return;
    }

    if (this.listeners instanceof UniqueContainer) {
      if (this.listeners === listener) {
        this.listeners = undefined;
        this.options.onDidRemoveLastListener?.(this);
        this.size = 0;
      }
      return;
    }

    const index = this.listeners.indexOf(listener);
    if (index === -1) {
      return;
    }

    this.size--;

    if (this.listeners.length === 2 && this.dispatching.value === unset) {
      this.listeners = index === 0 ? this.listeners[1] : this.listeners[0];
    } else {
      this.listeners[index] = undefined;

      if (this.size * compactionThreshold <= this.listeners.length) {
        let n = 0;
        for (let i = 0; i < this.listeners.length; i++) {
          if (this.listeners[i]) {
            this.listeners[n++] = this.listeners[i];
          } else if (this.dispatching.lastL >= i) {
            this.dispatching.lastL--;
          }
        }
        this.listeners.length = n;
      }
    }
  }
}
