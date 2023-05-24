export interface IDisposable {
  dispose(): void;
}

export interface Event<T> {
  (listener: (e: T) => any, thisArgs?: any, disposables?: IDisposable[]): IDisposable;
}

export interface Emitter<T> extends IDisposable {
  readonly event: Event<T>;
  readonly size: number;
  fire(value: T): void;
}

export interface EmitterOptions<T = any> {
	/**
	 * Optional function that's called *before* the very first listener is added
	 */
	onWillAddFirstListener?: (self: Emitter<T>) => void;
	/**
	 * Optional function that's called *after* the very first listener is added
	 */
	onDidAddFirstListener?: (self: Emitter<T>) => void;
	/**
	 * Optional function that's called after a listener is added
	 */
	onDidAddListener?: (self: Emitter<T>, listener: (fn: T) => void, thisArg?: unknown) => void;
	/**
	 * Optional function that's called *after* remove the very last listener
	 */
	onDidRemoveLastListener?: (self: Emitter<T>) => void;
	/**
	 * Optional function that's called *before* a listener is removed
	 */
	onWillRemoveListener?: (self: Emitter<T>) => void;
	/**
	 * Optional function that's called when a listener throws an error. Defaults to
	 * {@link onUnexpectedError}
	 */
	onListenerError?: (e: any) => void;
}

/**
 * Returns a promise that resolves when the event fires, or when cancellation
 * is requested, whichever happens first.
 */
export function toPromise<T>(event: Event<T>): Promise<T>;
export function toPromise<T>(event: Event<T>, signal: AbortSignal): Promise<T | undefined>;
export function toPromise<T>(event: Event<T>, signal?: AbortSignal): Promise<T | undefined> {
  if (!signal) {
    return new Promise<T>((resolve) => once(event, resolve));
  }

  if (signal.aborted) {
    return Promise.resolve(undefined);
  }

  return new Promise((resolve) => {
    const d2 = once(event, (data) => {
      signal.removeEventListener('abort', d1);
      resolve(data);
    });

    const d1 = () => {
      d2.dispose();
      signal.removeEventListener('abort', d1);
      resolve(undefined);
    };

    signal.addEventListener('abort', d1);
  });
}

/**
 * Adds a handler that handles one event on the emitter, then disposes itself.
 */
export const once = <T>(event: Event<T>, listener: (data: T) => void): IDisposable => {
  const disposable = event((value) => {
    listener(value);
    disposable.dispose();
  });

  return disposable;
};
