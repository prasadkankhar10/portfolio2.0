import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

// ─── MODULE STATE ─────────────────────────────────────────────────────────────
let world               = null;
let playerBody          = null;
let playerCollider      = null;
let characterController = null;

let spectatorBody       = null;
let spectatorCollider   = null;
let spectatorController = null;

const GRAVITY        = -20.0;  // m/s² downward
const PLAYER_HALF_H  = 0.10;   // Half-height of the player capsule (Total H: 0.5m)
const PLAYER_RADIUS  = 0.15;   // Radius to prevent feet clipping into rocks
const STEP_HEIGHT    = 0.10;    // Reduced step height to prevent hovering over small bumps
const SLOPE_LIMIT    = Math.PI / 3; // 60° max walkable slope so character slides up rocks rather than snagging

// ─── INIT RAPIER WASM ─────────────────────────────────────────────────────────
export async function initPhysics() {
    await RAPIER.init();
    const gravity = { x: 0.0, y: GRAVITY, z: 0.0 };
    world = new RAPIER.World(gravity);
    console.log('✅ Rapier physics world initialised');
}

// ─── VISUAL RAYCASTER (For perfect ground snapping) ───────────────────────────
const _raycaster = new THREE.Raycaster();
const _rayDown = new THREE.Vector3(0, -1, 0);
let _islandMeshes = [];

// ─── BUILD ISLAND TRIMESH COLLIDER ────────────────────────────────────────────
export function createIslandCollider(islandScene) {
    if (!world) { console.error('Physics world not initialised!'); return; }

    const allVertices = [];
    const allIndices  = [];
    let   indexOffset = 0;

    islandScene.traverse((child) => {
        if (!child.isMesh) return;
        
        _islandMeshes.push(child); // Store for visual raycasting

        const geom = child.geometry.clone();
        geom.applyMatrix4(child.matrixWorld);

        if (!geom.index) {
            const positions = geom.attributes.position.array;
            for (let i = 0; i < positions.length / 3; i++) allIndices.push(indexOffset + i);
            for (let v = 0; v < positions.length; v++)     allVertices.push(positions[v]);
            indexOffset += positions.length / 3;
        } else {
            const positions = geom.attributes.position.array;
            const indices   = geom.index.array;
            for (let v = 0; v < positions.length; v++) allVertices.push(positions[v]);
            for (let i = 0; i < indices.length; i++)   allIndices.push(indexOffset + indices[i]);
            indexOffset += positions.length / 3;
        }
        geom.dispose();
    });

    const vertices = new Float32Array(allVertices);
    const indices  = new Uint32Array(allIndices);

    const bodyDesc     = RAPIER.RigidBodyDesc.fixed();
    const body         = world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
    
    world.createCollider(colliderDesc, body);
    console.log(`✅ Island trimesh collider: ${(vertices.length / 3).toFixed(0)} vertices`);
}

// ─── CREATE PLAYER CAPSULE + CHARACTER CONTROLLER ────────────────────────────
export function createPlayerController(spawnX = 0, spawnY = 50, spawnZ = 0) {
    if (!world) { console.error('Physics world not initialised!'); return; }

    const bodyDesc = RAPIER.RigidBodyDesc
        .kinematicPositionBased()
        .setTranslation(spawnX, spawnY, spawnZ);
    playerBody = world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc
        .capsule(PLAYER_HALF_H, PLAYER_RADIUS)
        .setFriction(0.0)         
        .setRestitution(0.0);    
    playerCollider = world.createCollider(colliderDesc, playerBody);

    characterController = world.createCharacterController(0.01); 
    characterController.setMaxSlopeClimbAngle(SLOPE_LIMIT);
    characterController.setMinSlopeSlideAngle(SLOPE_LIMIT);
    characterController.enableSnapToGround(STEP_HEIGHT);    
    characterController.setApplyImpulsesToDynamicBodies(true);
    characterController.setUp({ x: 0, y: 1, z: 0 }); 

    console.log('✅ Player physics ready');
}

// ─── CREATE SPECTATOR CAPSULE ────────────────────────────────────────────────
export function createSpectatorController(spawnX = 0, spawnY = 50, spawnZ = 0) {
    if (!world) { console.error('Physics world not initialised!'); return; }

    const bodyDesc = RAPIER.RigidBodyDesc
        .kinematicPositionBased()
        .setTranslation(spawnX, spawnY, spawnZ);
    spectatorBody = world.createRigidBody(bodyDesc);

    // Tiny sphere for camera collision
    const colliderDesc = RAPIER.ColliderDesc
        .ball(0.25)
        .setFriction(0.0)         
        .setRestitution(0.0);
        
    spectatorCollider = world.createCollider(colliderDesc, spectatorBody);

    spectatorController = world.createCharacterController(0.01); 
    spectatorController.setMaxSlopeClimbAngle(Math.PI / 2); // 90 degrees to slide up vertical walls
    spectatorController.setApplyImpulsesToDynamicBodies(false); 

    console.log('✅ Spectator physics ready');
}

// ─── MOVE PLAYER (called every frame) ─────────────────────────────────────────
export function movePlayer(desiredMove, delta) {
    if (!world || !playerBody || !characterController) return null;

    const move = { x: desiredMove.x, y: desiredMove.y, z: desiredMove.z };

    characterController.computeColliderMovement(
        playerCollider,
        move,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS
    );

    const computed = characterController.computedMovement();
    const pos = playerBody.translation();
    
    playerBody.setNextKinematicTranslation({
        x: pos.x + computed.x,
        y: pos.y + computed.y,
        z: pos.z + computed.z
    });

    world.step();

    const newPos = playerBody.translation();
    return new THREE.Vector3(newPos.x, newPos.y, newPos.z);
}

// ─── MOVE SPECTATOR (CAMERA DRONE) ───────────────────────────────────────────
export function moveSpectator(desiredMove) {
    if (!world || !spectatorBody || !spectatorController) return null;

    spectatorController.computeColliderMovement(
        spectatorCollider,
        desiredMove,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS
    );

    const computed = spectatorController.computedMovement();
    const pos = spectatorBody.translation();
    
    // We do NOT call world.step() here because movePlayer already ticks the physics engine
    const nextPos = {
        x: pos.x + computed.x,
        y: pos.y + computed.y,
        z: pos.z + computed.z
    };
    
    spectatorBody.setNextKinematicTranslation(nextPos);
    return new THREE.Vector3(nextPos.x, nextPos.y, nextPos.z);
}

export function setSpectatorPosition(pos) {
    if (!spectatorBody) return;
    spectatorBody.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
}

export function setPlayerPosition(pos) {
    if (!playerBody) return;
    playerBody.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
export function getPlayerPhysicsPosition() {
    if (!playerBody) return null;
    const t = playerBody.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
}

export function isGrounded() {
    if (!characterController) return false;
    return characterController.computedGrounded();
}

export function raycastCamera(origin, direction, maxToi) {
    if (!world) return maxToi;
    // Ray from target to camera
    const ray = new RAPIER.Ray(origin, direction);
    
    // Cast ray against static geometry only (EXCLUDE_DYNAMIC avoids hitting player)
    const hit = world.castRay(
        ray, 
        maxToi, 
        true, 
        RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC
    );
    
    if (hit && hit.toi < maxToi) {
        return hit.toi;
    }
    return maxToi;
}

export function getGroundHeight(x, z, startY = 100) {
    if (!world) return 0;
    // Ray from high in the sky pointing straight down
    const ray = new RAPIER.Ray({ x, y: startY, z }, { x: 0, y: -1, z: 0 });
    
    // Cast ray against static geometry
    const hit = world.castRay(
        ray, 
        startY + 20, 
        true, 
        RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC
    );
    
    if (hit) {
        return startY - hit.toi;
    }
    return 0;
}

export function getVisualGroundHeight(x, y, z) {
    if (_islandMeshes.length === 0) return null;
    // Start raycast slightly above current physics Y (e.g. head height) to find the ground below feet
    _raycaster.set(new THREE.Vector3(x, y + 2.0, z), _rayDown);
    _raycaster.far = 10.0; // Don't raycast infinitely, just enough to find floor
    const hits = _raycaster.intersectObjects(_islandMeshes, false);
    if (hits.length > 0) {
        return hits[0].point.y;
    }
    return null;
}
