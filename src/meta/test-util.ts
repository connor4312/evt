import { Emitter, EmitterOptions } from '..';

import implC4312 from '../impl-c4312-evt';
import implCode from '../impl-vscode';

export const allImplementations: {
  name: string;
  impl: { new <T>(opts?: EmitterOptions): Emitter<T> };
}[] = [
  { name: '@c4312/evt', impl: implC4312 },
  { name: 'vscode', impl: implCode },
];
