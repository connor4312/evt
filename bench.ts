import * as matcha from '@c4312/matcha';
import { EventEmitter } from './index.js';

matcha.benchmark({
  //@ts-ignore
  reporter: new matcha.PrettyReporter(process.stdout),
  prepare: (api) => {
    let n = 0;
    for (const count of [0, 1, 2]) {
      const emitter = new EventEmitter<number>();
      for (let i = 0; i < count; i++) {
        emitter.event((v) => {
          n ^= v;
        });
      }

      api.bench(`emit ${count}`, () => emitter.fire(42));
    }
  },
});
