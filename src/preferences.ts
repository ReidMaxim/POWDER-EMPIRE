export type Quality = 'low' | 'standard' | 'high';
export interface Preferences {
  seed: string;
  quality: Quality;
  trees: boolean;
  reducedMotion: boolean;
}
const key = 'powder-empire.first-snow';
const defaults: Preferences = {
  seed: 'FROST-001',
  quality: 'standard',
  trees: true,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches
};
export function loadPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '{}') ?? {};
    return {
      seed: typeof value.seed === 'string' && value.seed.trim() ? value.seed.trim().slice(0, 40) : defaults.seed,
      quality: ['low', 'standard', 'high'].includes(value.quality) ? value.quality : defaults.quality,
      trees: typeof value.trees === 'boolean' ? value.trees : defaults.trees,
      reducedMotion: typeof value.reducedMotion === 'boolean' ? value.reducedMotion : defaults.reducedMotion
    };
  } catch {
    return { ...defaults };
  }
}
export function savePreferences(preferences: Preferences) {
  try {
    localStorage.setItem(key, JSON.stringify(preferences));
  } catch {
    // Storage may be unavailable in private or restricted browsing.
  }
}
