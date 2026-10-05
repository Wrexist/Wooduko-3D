// The game code still uses the global THREE object from the prototype.
// This shim keeps it working offline (bundled, no CDN) until the TS port.
import * as THREE from 'three';
window.THREE = THREE;
