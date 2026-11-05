import assert from 'assert';
import { assetIdFromUrl } from '../src/utils/assetIdFromUrl';

assert.strictEqual(assetIdFromUrl('/api/assets/asset_1/content'), 'asset_1');
assert.strictEqual(assetIdFromUrl('https://host.example:3001/api/assets/asset_1/content'), 'asset_1');
assert.strictEqual(assetIdFromUrl(''), null);
assert.strictEqual(assetIdFromUrl('https://x/y.png'), null);
console.log('assetIdFromUrl tests passed');
