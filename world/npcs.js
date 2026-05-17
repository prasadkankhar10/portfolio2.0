import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// ─── NPC Definitions ──────────────────────────────────────────────────────────
export let NPC_CONFIGS = [
    {
        id: 'wanderer',
        patrolCenter: new THREE.Vector3(-9, 0, -12),
        patrolRadius: 4,
        patrolSpeed: 0.35,
        behaviorType: 'patrol',
        colorTint: new THREE.Color(0.72, 0.78, 0.92),
    },
    {
        id: 'guard',
        spawnX: -7,
        spawnZ: -9,
        behaviorType: 'idle_sway',
        colorTint: new THREE.Color(0.90, 0.62, 0.55),
        swaySpeed: 0.3,
    },
    {
        id: 'follower',
        spawnX: -5,
        spawnZ: -10,
        behaviorType: 'follow',
        colorTint: new THREE.Color(0.55, 0.90, 0.62),
        followDistance: 3,
        moveSpeed: 2.0,
    }
];

export let npcInstances = [];
let _baseGltf = null;
let _currentScene = null;

const _raycaster = new THREE.Raycaster();
const _rayDown   = new THREE.Vector3(0, -1, 0);
const _tempQuat  = new THREE.Quaternion();
const _upAxis    = new THREE.Vector3(0, 1, 0);
let _islandMeshes = [];

// ─── Ground height via THREE.js raycaster ─────────────────────────────────────
function getGroundHeightVisual(x, z) {
    if (_islandMeshes.length === 0) return null;
    _raycaster.set(new THREE.Vector3(x, 500, z), _rayDown);
    _raycaster.far = 600;
    const hits = _raycaster.intersectObjects(_islandMeshes, false);
    if (hits.length > 0) return hits[0].point.y;
    return null;
}

// ─── Setup ───────────────────────────────────────────────────────────────────
export async function setupNPCs(scene, islandScene) {
    _currentScene = scene;
    if (islandScene) {
        islandScene.traverse((child) => {
            if (child.isMesh) _islandMeshes.push(child);
        });
    }

    const loader = new GLTFLoader();
    try {
        _baseGltf = await loader.loadAsync('./assets/Adventurer (2).glb');
    } catch (e) {
        console.warn('⚠️ NPC model load failed:', e);
        return;
    }

    // Spawn initial config
    for (const cfg of NPC_CONFIGS) {
        spawnNPC(cfg);
    }
}

// ─── Spawn a Single NPC ───────────────────────────────────────────────────────
export function spawnNPC(cfg) {
    if (!_baseGltf || !_currentScene) return;

    const modelClone = SkeletonUtils.clone(_baseGltf.scene);
    
    // Tinting
    const tintColor = cfg.colorTint instanceof THREE.Color ? cfg.colorTint : new THREE.Color(cfg.colorTint);
    modelClone.traverse((child) => {
        if (child.isMesh) {
            child.castShadow    = true;
            child.receiveShadow = true;
            child.frustumCulled = false;
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material = child.material.map(mat => {
                        const m = mat.clone();
                        if (m.color) m.color.multiply(tintColor);
                        return m;
                    });
                } else {
                    const m = child.material.clone();
                    if (m.color) m.color.multiply(tintColor);
                    child.material = m;
                }
            }
        }
    });

    modelClone.scale.setScalar(0.293);

    let initialX = cfg.spawnX || 0;
    let initialZ = cfg.spawnZ || 0;
    if (cfg.behaviorType === 'patrol' && cfg.patrolCenter) {
        initialX = cfg.patrolCenter.x + cfg.patrolRadius;
        initialZ = cfg.patrolCenter.z;
    }

    const groundY = getGroundHeightVisual(initialX, initialZ);
    const startY  = (groundY !== null && !isNaN(groundY)) ? groundY + 0.05 : 50;

    const group = new THREE.Group();
    group.position.set(initialX, startY, initialZ);
    group.add(modelClone);
    _currentScene.add(group);

    const mixer = new THREE.AnimationMixer(modelClone);
    const animations = {};
    _baseGltf.animations.forEach((clip) => {
        const action    = mixer.clipAction(clip);
        const lowerName = clip.name.toLowerCase();
        if (lowerName.includes('idle') && !animations['idle']) animations['idle'] = action;
        if (lowerName.includes('walk') && !animations['walk']) animations['walk'] = action;
        if (lowerName.includes('run')  && !animations['run'])  animations['run']  = action;
        if (lowerName === 'idle') animations['idle'] = action;
        if (lowerName === 'walk') animations['walk'] = action;
        if (lowerName === 'run')  animations['run']  = action;
    });

    const startAnim = (cfg.behaviorType === 'patrol' || cfg.behaviorType === 'follow' || cfg.behaviorType === 'flee')
        ? (animations['walk'] || animations['idle'])
        : (animations['idle'] || Object.values(animations)[0]);
    if (startAnim) startAnim.play();

    npcInstances.push({
        cfg,
        group,
        mixer,
        animations,
        currentAction: startAnim,
        patrolAngle: 0,
        needsSnap: (startY === 50),
    });
}

export function clearAllNPCs() {
    for (const npc of npcInstances) {
        _currentScene.remove(npc.group);
    }
    npcInstances = [];
}

// ─── Update (called every frame) ─────────────────────────────────────────────
export function updateNPCs(delta, totalTime, playerPos) {
    for (const npc of npcInstances) {
        npc.mixer.update(delta);

        if (npc.needsSnap) {
            let x = npc.cfg.spawnX || 0, z = npc.cfg.spawnZ || 0;
            if (npc.cfg.behaviorType === 'patrol' && npc.cfg.patrolCenter) {
                x = npc.cfg.patrolCenter.x + npc.cfg.patrolRadius;
                z = npc.cfg.patrolCenter.z;
            }
            const y = getGroundHeightVisual(x, z);
            if (y !== null && !isNaN(y)) {
                npc.group.position.set(x, y + 0.05, z);
                npc.needsSnap = false;
            }
            continue; // Wait until snapped
        }

        switch(npc.cfg.behaviorType) {
            case 'patrol': _updatePatrol(npc, delta); break;
            case 'follow': _updateFollow(npc, delta, playerPos); break;
            case 'flee': _updateFlee(npc, delta, playerPos); break;
            case 'idle_sway': default: _updateIdleSway(npc, delta, totalTime); break;
        }
    }
}

// ─── Behaviors ───────────────────────────────────────────────────────────────
function fadeAnim(npc, name) {
    const newAction = npc.animations[name];
    if (!newAction || newAction === npc.currentAction) return;
    if (npc.currentAction) npc.currentAction.fadeOut(0.2);
    newAction.reset().fadeIn(0.2).play();
    npc.currentAction = newAction;
}

function _updatePatrol(npc, delta) {
    const cfg = npc.cfg;
    npc.patrolAngle += cfg.patrolSpeed * delta;
    const nx = cfg.patrolCenter.x + Math.sin(npc.patrolAngle) * cfg.patrolRadius;
    const nz = cfg.patrolCenter.z + Math.cos(npc.patrolAngle) * (cfg.patrolRadius * 0.7);
    const tanX = Math.cos(npc.patrolAngle);
    const tanZ = -Math.sin(npc.patrolAngle) * 0.7;
    _tempQuat.setFromAxisAngle(_upAxis, Math.atan2(tanX, tanZ));
    npc.group.quaternion.slerp(_tempQuat, 6 * delta);

    const groundY = getGroundHeightVisual(nx, nz);
    npc.group.position.set(nx, (groundY !== null && !isNaN(groundY)) ? groundY + 0.05 : npc.group.position.y, nz);
    fadeAnim(npc, 'walk');
}

function _updateFollow(npc, delta, playerPos) {
    if (!playerPos) { fadeAnim(npc, 'idle'); return; }
    const dist = npc.group.position.distanceTo(playerPos);
    const followDist = npc.cfg.followDistance || 3;
    
    if (dist > followDist) {
        const dir = new THREE.Vector3().subVectors(playerPos, npc.group.position);
        dir.y = 0; dir.normalize();
        
        _tempQuat.setFromAxisAngle(_upAxis, Math.atan2(dir.x, dir.z));
        npc.group.quaternion.slerp(_tempQuat, 10 * delta);
        
        const speed = npc.cfg.moveSpeed || 2.0;
        const nx = npc.group.position.x + dir.x * speed * delta;
        const nz = npc.group.position.z + dir.z * speed * delta;
        const groundY = getGroundHeightVisual(nx, nz);
        
        npc.group.position.set(nx, (groundY !== null && !isNaN(groundY)) ? groundY + 0.05 : npc.group.position.y, nz);
        fadeAnim(npc, dist > followDist * 2 ? 'run' : 'walk');
    } else {
        fadeAnim(npc, 'idle');
    }
}

function _updateFlee(npc, delta, playerPos) {
    if (!playerPos) { fadeAnim(npc, 'idle'); return; }
    const dist = npc.group.position.distanceTo(playerPos);
    const fleeDist = npc.cfg.fleeDistance || 8;
    
    if (dist < fleeDist) {
        const dir = new THREE.Vector3().subVectors(npc.group.position, playerPos); // away from player
        dir.y = 0; dir.normalize();
        
        _tempQuat.setFromAxisAngle(_upAxis, Math.atan2(dir.x, dir.z));
        npc.group.quaternion.slerp(_tempQuat, 10 * delta);
        
        const speed = (npc.cfg.moveSpeed || 2.0) * 1.5; // run fast
        const nx = npc.group.position.x + dir.x * speed * delta;
        const nz = npc.group.position.z + dir.z * speed * delta;
        const groundY = getGroundHeightVisual(nx, nz);
        
        npc.group.position.set(nx, (groundY !== null && !isNaN(groundY)) ? groundY + 0.05 : npc.group.position.y, nz);
        fadeAnim(npc, 'run');
    } else {
        fadeAnim(npc, 'idle');
    }
}

function _updateIdleSway(npc, delta, totalTime) {
    const swayYaw = Math.sin(totalTime * (npc.cfg.swaySpeed || 0.3)) * 0.5;
    _tempQuat.setFromAxisAngle(_upAxis, swayYaw);
    npc.group.quaternion.slerp(_tempQuat, 2 * delta);
    fadeAnim(npc, 'idle');
}

// ─── Debug: expose NPC positions for the HUD ─────────────────────────────────
export function getNPCDebugInfo() {
    return npcInstances.map(npc => ({
        id:      npc.cfg.id,
        x:       npc.group.position.x,
        y:       npc.group.position.y,
        z:       npc.group.position.z,
        snapped: !npc.needsSnap,
    }));
}
