import { strict as assert } from 'node:assert';
import { test } from 'node:test';

test('seed and settings survive a storage round trip, including pre-refinement settings', async () => {
  const originalMedia = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const entries = new Map<string, string>();
  Object.defineProperty(globalThis, 'matchMedia', { configurable: true, value: () => ({ matches: false }) });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value)
    }
  });
  try {
    const { loadPreferences, savePreferences } = await import('../src/preferences.ts');
    const key = 'powder-empire.first-snow';
    entries.set(key, JSON.stringify({ seed: 'SNOW-JG70AC', quality: 'high' }));
    assert.deepEqual(loadPreferences(), {
      seed: 'SNOW-JG70AC', quality: 'high', trees: true, reducedMotion: false
    });
    const selected = { seed: 'powder/雪', quality: 'low', trees: false, reducedMotion: true } as const;
    savePreferences(selected);
    assert.deepEqual(loadPreferences(), selected);
    entries.set(key, 'invalid JSON');
    assert.equal(loadPreferences().seed, 'FROST-001');
  } finally {
    if (originalMedia) Object.defineProperty(globalThis, 'matchMedia', originalMedia);
    else Reflect.deleteProperty(globalThis, 'matchMedia');
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
