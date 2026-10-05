import './ui/styles.css';
import { Game } from './game';
import { webHaptics } from './platform/haptics';
import { webStorage } from './platform/storage';
import { createGameStore, loadPersisted } from './state/store';

const randomSeed = (): number => (Math.random() * 0x100000000) >>> 0 || 1;

async function boot(): Promise<void> {
  const canvas = document.getElementById('c');
  const uiRoot = document.getElementById('ui');
  if (!(canvas instanceof HTMLCanvasElement) || !uiRoot) throw new Error('Missing #c or #ui');
  const deps = { storage: webStorage(), randomSeed };
  const store = createGameStore(deps, await loadPersisted(deps));
  const game = new Game({ canvas, uiRoot, store, haptics: webHaptics() });
  if (import.meta.env.DEV || import.meta.env.VITE_DEBUG_HOOKS === '1') {
    // dev / test-build only: hooks for scripted screenshots and soak checks
    Object.assign(window, { __grain: { store, game } });
  }
}

void boot();
