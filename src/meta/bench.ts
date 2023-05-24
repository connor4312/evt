import { spawnSync } from 'child_process';
import { allImplementations } from './test-util';
const listenerCounts = [0, 1, 3, 10, 1000];
const listenerFns = new Array(listenerCounts[listenerCounts.length - 1])
  .fill(undefined)
  .map(() => () => {});

const warmup = 10_000;
const listenersForMemory = 100_00;
const eventDispatchForTest = 100_000;

if (!global.gc) {
  spawnSync(process.argv0, ['--expose-gc', __filename], { stdio: 'inherit' });
  process.exit(0);
}

const slowGc = () => {
  // seems like a single gc call is not reliable in cleaning up data. So run it for a period of time.
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) global.gc!();
};

for (const { name, impl: EventEmitter } of allImplementations) {
  for (let i = 0; i < warmup; i++) {
    const ee = new EventEmitter();
    for (let i = 0; i < 5; i++) {
      ee.fire(42);
      ee.event(listenerFns[i]);
    }
  }

  const table: Record<string, Record<string, any>> = {};
  for (const n of listenerCounts) {
    const emitters = [];
    const disposeHandle = [];

    //#region setup listeners
    slowGc();
    const startAdd = performance.now();
    const startMemory = process.memoryUsage.rss();
    for (let i = 0; i < listenersForMemory; i++) {
      const ee = new EventEmitter();
      for (let i = 0; i < n; i++) {
        disposeHandle.push(ee.event(listenerFns[i]));
      }
      emitters.push(ee);
    }
    const timeToAdd = performance.now() - startAdd;
    slowGc();
    const memory = Math.round((process.memoryUsage.rss() - startMemory) / listenersForMemory);
    //#endregion

    //#region dispatch
    const dispatchStart = performance.now();
    const emitter = emitters[emitters.length - 1];
    for (let i = 0; i < eventDispatchForTest; i++) {
      emitter.fire(i);
    }
    const dispatchTime = Math.round(
      (performance.now() - dispatchStart) / (eventDispatchForTest / 1_000_000),
    );
    //#endregion

    const addRemoveMulti = 1_000_000 / disposeHandle.length;
    shuffle(disposeHandle);

    //#region remove listeners
    const removeStart = performance.now();
    for (const handle of disposeHandle) {
      handle.dispose();
    }
    const timeToRemove = performance.now() - removeStart;
    //#endregion

    table[`${n} Listeners`] = {
      'Memory per Emitter (B)': memory,
      'Dispatch 1M events (ms)': dispatchTime,
      'Add 1M listeners (ms)': Math.round(timeToAdd * addRemoveMulti),
      'Remove 1M listeners (ms)': Math.round(timeToRemove * addRemoveMulti),
    };
  }

  console.log(`${name}:`);
  console.table(table);
}

function shuffle(array: unknown[]) {
  for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
  }
}
