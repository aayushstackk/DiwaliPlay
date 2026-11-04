# Native golden fixtures

Generates JSON fixtures from the web implementation (`src/utils/*.ts`) so the Kotlin port in
`android-native/` can be tested for identical behaviour.

    npx tsx scripts/native-golden/generate.ts --out android-native/core/game/src/test/resources/golden

- `mulberry32.ts` is the seeded PRNG; `Mulberry32` in `core:game` is bit-identical.
- Add a fixture: add an entry to `generators` in `generate.ts` (`target` picks `--out` or
  `--out-tracking`). For randomness, wrap the web call in `withSeededRandom(seed, ...)` and pass
  `Mulberry32(seed)` to the Kotlin port; call order must match the TS source.
- Commit the generated JSON.
