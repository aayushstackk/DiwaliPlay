/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert';
import { chooseTracker, medianMs } from '../src/utils/trackerSelection';

// A fast worker is kept without looking at the main thread
assert.strictEqual(chooseTracker(4, 1), 'worker');
assert.strictEqual(chooseTracker(25, 1), 'worker');

// A slow worker gives way to a clearly faster main thread
assert.strictEqual(chooseTracker(90, 20), 'main');
assert.strictEqual(chooseTracker(90, 40), 'main');

// A slow device stays on the worker, so at least the animation stays smooth
assert.strictEqual(chooseTracker(90, 90), 'worker');
assert.strictEqual(chooseTracker(90, 41), 'worker');

// A small gain isn't worth blocking drawing
assert.strictEqual(chooseTracker(30, 25), 'worker');

// A main-thread benchmark that couldn't run never wins
assert.strictEqual(chooseTracker(90, Infinity), 'worker');

assert.strictEqual(medianMs([5, 1, 3]), 3);
assert.strictEqual(medianMs([4, 1, 3, 2]), 2.5);
assert.strictEqual(medianMs([]), Infinity);

console.log('tracker-selection: all passed');
