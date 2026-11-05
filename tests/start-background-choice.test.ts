import assert from 'assert';
import { chooseStartBackground } from '../src/utils/startBackground';

assert.deepStrictEqual(chooseStartBackground('', 'image', 50), { kind: 'builtin' });
assert.deepStrictEqual(chooseStartBackground(null, 'image', 50), { kind: 'builtin' });
assert.deepStrictEqual(chooseStartBackground(undefined, 'video', 50), { kind: 'builtin' });
assert.deepStrictEqual(chooseStartBackground('   ', 'image', 50), { kind: 'builtin' });
assert.deepStrictEqual(chooseStartBackground('u', 'video', 30), { kind: 'video', url: 'u', dim: 30 });
assert.deepStrictEqual(chooseStartBackground('u', 'gif', 30), { kind: 'image', url: 'u', dim: 30 });
assert.strictEqual((chooseStartBackground('u', 'image', undefined) as any).dim, 50);
assert.strictEqual((chooseStartBackground('u', 'image', 95) as any).dim, 80);
assert.strictEqual((chooseStartBackground('u', 'image', -5) as any).dim, 0);
console.log('chooseStartBackground tests passed');
