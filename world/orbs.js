import * as THREE from 'three';
import { playOrbCollect } from './soundscape.js';
import { showToast } from '../ui/uiController.js';

// 5 random positions scattered around the island — adjust XZ if needed!
const ORB_POSITIONS = [
    new THREE.Vector3(-18, 2,  -8),
    new THREE.Vector3( 12, 2, -20),
    new THREE.Vector3(-25, 2,  15),
    new THREE.Vector3( 20, 2,  10),
    new THREE.Vector3(  5, 2, -30),
];

const COLLECT_RADIUS = 1.5;
const orbMeshes = [];
let collectedCount = 0;

export function setupOrbs(scene) {
    const geometry = new THREE.IcosahedronGeometry(0.35, 1);
    
    ORB_POSITIONS.forEach((pos, i) => {
        const material = new THREE.MeshBasicMaterial({
            color: 0xffd700,
            wireframe: false,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        const orb = new THREE.Mesh(geometry, material.clone());
        orb.position.copy(pos);
        orb.userData.baseY = pos.y;
        orb.userData.seed = i * 1.37;
        orb.userData.collected = false;

        // Outer glow halo
        const haloMat = new THREE.MeshBasicMaterial({
            color: 0xffaa00,
            transparent: true,
            opacity: 0.2,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide,
            depthWrite: false,
        });
        const halo = new THREE.Mesh(geometry, haloMat);
        halo.scale.setScalar(1.8);
        orb.add(halo);

        scene.add(orb);
        orbMeshes.push(orb);
    });

    // Restore from localStorage if any were collected in a previous session
    const saved = localStorage.getItem('orbs_collected');
    if (saved) {
        const savedIds = JSON.parse(saved);
        savedIds.forEach(idx => {
            if (orbMeshes[idx]) {
                orbMeshes[idx].visible = false;
                orbMeshes[idx].userData.collected = true;
                collectedCount++;
            }
        });
    }
    
    _updateOrbHUD();
}

export function updateOrbs(delta, playerPos, time) {
    orbMeshes.forEach((orb, i) => {
        if (orb.userData.collected) return;

        // Gentle float + spin
        orb.position.y = orb.userData.baseY + Math.sin(time * 1.5 + orb.userData.seed) * 0.25;
        orb.rotation.y += delta * 1.2;
        orb.rotation.x += delta * 0.4;

        // Inner pulse
        const pulse = 0.9 + 0.1 * Math.sin(time * 3.0 + orb.userData.seed);
        orb.scale.setScalar(pulse);

        // Proximity check
        const dx = playerPos.x - orb.position.x;
        const dz = playerPos.z - orb.position.z;
        const distSq = dx * dx + dz * dz;

        if (distSq < COLLECT_RADIUS * COLLECT_RADIUS) {
            _collectOrb(i);
        }
    });
}

function _collectOrb(index) {
    const orb = orbMeshes[index];
    if (!orb || orb.userData.collected) return;

    orb.userData.collected = true;
    orb.visible = false;
    collectedCount++;

    // Persist to localStorage
    const saved = JSON.parse(localStorage.getItem('orbs_collected') || '[]');
    saved.push(index);
    localStorage.setItem('orbs_collected', JSON.stringify(saved));

    playOrbCollect();
    _updateOrbHUD();

    if (collectedCount >= ORB_POSITIONS.length) {
        // Show the collection toast first
        showToast('💎 Orb Collected!', `${collectedCount} / ${ORB_POSITIONS.length} island treasures found.`, 4000);
        // Then after 4.5 seconds, show the final completion toast
        setTimeout(() => {
            showToast('✨ All Treasures Found!', 'You have discovered all the secrets of this island. The creator salutes you!', 8000);
        }, 4500);
    } else {
        showToast('💎 Orb Collected!', `${collectedCount} / ${ORB_POSITIONS.length} island treasures found.`, 4000);
    }
}

function _updateOrbHUD() {
    const el = document.getElementById('orb-counter');
    if (el) el.textContent = `💎 ${collectedCount} / ${ORB_POSITIONS.length}`;
}
