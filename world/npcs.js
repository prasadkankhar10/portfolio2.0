import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { getGroundHeight } from '../physics/physics.js';

// ─── NPC Definitions ──────────────────────────────────────────────────────────
const NPC_CONFIGS = [
    {
        id: 'wanderer',
        // Patrol in a slow oval around the town square/stalls
        patrolCenter: new THREE.Vector3(-15, 0, -10),
        patrolRadius: 5,
        patrolSpeed: 0.35,      // radians per second
        behaviorType: 'patrol',
        // Blue-grey tunic tint to differentiate from the player
        colorTint: new THREE.Color(0.72, 0.78, 0.92),
    },
    {
        id: 'guard',
        // Stands right near the village start point (facing the player)
        spawnX: -7,
        spawnZ: -8,
        behaviorType: 'idle_sway',
        // Warm red-brown guard tunic tint
        colorTint: new THREE.Color(0.90, 0.62, 0.55),
        swaySpeed: 0.3,         // very slow look-around
    },
];

// Per-NPC live state
const npcInstances = [];

// Shared reusable objects to avoid GC pressure
const _tempQuat  = new THREE.Quaternion();
const _upAxis    = new THREE.Vector3(0, 1, 0);

// ─── Setup ───────────────────────────────────────────────────────────────────
export async function setupNPCs(scene) {
    const loader = new GLTFLoader();

    // Load the Adventurer model once, then clone for each NPC
    let baseGltf;
    try {
        baseGltf = await loader.loadAsync('./assets/Adventurer (2).glb');
    } catch (e) {
        console.warn('⚠️ NPC model load failed:', e);
        return;
    }

    for (const cfg of NPC_CONFIGS) {
        // Deep-clone scene so each NPC has independent materials & animations
        const modelClone = SkeletonUtils.clone(baseGltf.scene);

        // Apply tint to all mesh materials so NPCs look distinct from player
        modelClone.traverse((child) => {
            if (child.isMesh && child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach((mat) => {
                    if (mat.color) {
                        mat = mat.clone();
                        mat.color.multiply(cfg.colorTint);
                        child.material = mat;
                    }
                });
            }
        });

        modelClone.scale.setScalar(0.293); // Match the player character scale

        const group = new THREE.Group();

        let initialX, initialZ;
        if (cfg.behaviorType === 'patrol') {
            initialX = cfg.patrolCenter.x + cfg.patrolRadius;
            initialZ = cfg.patrolCenter.z;
        } else {
            initialX = cfg.spawnX;
            initialZ = cfg.spawnZ;
        }

        // Snap to ground height
        const groundY = getGroundHeight(initialX, initialZ);
        group.position.set(initialX, groundY, initialZ);

        group.add(modelClone);
        scene.add(group);

        // Set up animation mixer
        const mixer = new THREE.AnimationMixer(modelClone);
        const animations = {};

        baseGltf.animations.forEach((clip) => {
            const action = mixer.clipAction(clip);
            const lowerName = clip.name.toLowerCase();
            if (lowerName.includes('idle') && !animations['idle']) animations['idle'] = action;
            if (lowerName.includes('walk') && !animations['walk']) animations['walk'] = action;
            if (lowerName.includes('run')  && !animations['run'])  animations['run']  = action;
            if (lowerName === 'idle') animations['idle'] = action;
            if (lowerName === 'walk') animations['walk'] = action;
        });

        // Start the correct default animation
        const startAnim = cfg.behaviorType === 'patrol'
            ? (animations['walk'] || animations['idle'])
            : animations['idle'];

        if (startAnim) {
            startAnim.play();
        }

        npcInstances.push({
            cfg,
            group,
            mixer,
            animations,
            currentAction: startAnim,
            patrolAngle: 0,
        });

        console.log(`✅ NPC "${cfg.id}" spawned at y=${groundY.toFixed(2)}`);
    }
}

// ─── Update (called every frame) ─────────────────────────────────────────────
export function updateNPCs(delta, totalTime) {
    for (const npc of npcInstances) {
        npc.mixer.update(delta);

        if (npc.cfg.behaviorType === 'patrol') {
            _updatePatrol(npc, delta);
        } else {
            _updateIdleSway(npc, delta, totalTime);
        }
    }
}

// ─── Patrol Behaviour ─────────────────────────────────────────────────────────
function _updatePatrol(npc, delta) {
    const cfg = npc.cfg;
    npc.patrolAngle += cfg.patrolSpeed * delta;

    const nx = cfg.patrolCenter.x + Math.sin(npc.patrolAngle) * cfg.patrolRadius;
    const nz = cfg.patrolCenter.z + Math.cos(npc.patrolAngle) * (cfg.patrolRadius * 0.7);

    // Face the direction of travel
    const tanX = Math.cos(npc.patrolAngle);
    const tanZ = -Math.sin(npc.patrolAngle) * 0.7;
    const targetAngle = Math.atan2(tanX, tanZ);

    _tempQuat.setFromAxisAngle(_upAxis, targetAngle);
    npc.group.quaternion.slerp(_tempQuat, 6 * delta);

    // Update position and keep snapped to terrain
    npc.group.position.x = nx;
    npc.group.position.z = nz;
    npc.group.position.y = getGroundHeight(nx, nz);
}

// ─── Idle Sway Behaviour ──────────────────────────────────────────────────────
function _updateIdleSway(npc, delta, totalTime) {
    // Gentle slow look-around
    const swayYaw = Math.sin(totalTime * npc.cfg.swaySpeed) * 0.5;
    _tempQuat.setFromAxisAngle(_upAxis, swayYaw);
    npc.group.quaternion.slerp(_tempQuat, 2 * delta);
}
