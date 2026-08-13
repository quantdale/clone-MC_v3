import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '../../src/config';
import { Player } from '../../src/player/Player';

describe('Player', () => {
  it('reports eye height on the first read at the origin', () => {
    const player = new Player();

    expect(player.eyePosition).toEqual(new THREE.Vector3(0, CONFIG.player.eyeHeight, 0));
  });

  it('refreshes the cached eye position after movement', () => {
    const player = new Player({ position: new THREE.Vector3(2, 3, 4) });

    expect(player.eyePosition.y).toBe(3 + CONFIG.player.eyeHeight);
    player.position.set(5, 6, 7);
    expect(player.eyePosition).toEqual(new THREE.Vector3(5, 6 + CONFIG.player.eyeHeight, 7));
  });
});
