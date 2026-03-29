import * as THREE from 'three';
import { movePlayer, isGrounded, getPlayerPhysicsPosition, raycastCamera, moveSpectator, setSpectatorPosition } from '../physics/physics.js';
import { fadeToAction } from './characterController.js';
import { playFootstep } from '../world/soundscape.js';

// ─── Input State ────────────────────────────────────────────────────────────
const keys = {
    w: false, a: false, s: false, d: false,
    shift: false, space: false, v: false,
    control: false, q: false
};
export let isSpectatorMode = false;
let spectatorJustToggled = false;

// ─── Camera Orbit State ─────────────────────────────────────────────────────
let CAM_DIST = 2.5;
let targetCamDist = 2.5;
const CAM_MIN_DIST = 1.0;
const CAM_MAX_DIST = 8.0;
const CAM_MIN_PITCH = 0.05;
const CAM_MAX_PITCH = Math.PI / 2.1;

let camYaw   = 0;
let camPitch = Math.PI / 8;
let isLocked = false;

// Over-the-shoulder offset (Q toggles)
let shoulderSide = 0;        // 0 = center, 1 = right, -1 = left
let currentShoulderOffset = 0;

// ─── Camera Dynamics ────────────────────────────────────────────────────────
let currentFOV  = 75;
let bobTime     = 0;
let bobAmp      = 0;
let targetSpectatorFOV = 75;

// Spring-damped camera state
const currentCamPos  = new THREE.Vector3();
const currentLookAt  = new THREE.Vector3();
let isFirstFrame = true;

// Look-ahead target
const lookAheadOffset = new THREE.Vector3();

// Idle sway state
let idleTimer   = 0;
let idleSwyTime = 0;

// ─── Physics State ──────────────────────────────────────────────────────────
let verticalVelocity = 0;
let coyoteTimer      = 0;
let jumpBufferTimer  = 0;
let doubleJumpAvail  = false;  // Double jump
let wasGrounded      = true;

// ─── Momentum System ────────────────────────────────────────────────────────
const currentMomentum = new THREE.Vector3(); // Smoothed horizontal velocity

// ─── Stamina System ─────────────────────────────────────────────────────────
const MAX_STAMINA  = 5.0;   // Seconds of sprint
const REGEN_RATE   = 0.5;   // Stamina per second at rest
let stamina        = MAX_STAMINA;
let staminaDepleted = false;

// ─── Squash State ────────────────────────────────────────────────────────────
let squashY         = 1.0;
let prevVerticalVel = 0;

// ─── Footstep State ──────────────────────────────────────────────────────────
let footstepTimer   = 0;

// Move speeds
const WALK_SPEED   = 1.2;
const RUN_SPEED    = 3.0;
const CROUCH_SPEED = 0.6;
const GRAVITY      = -20.0;
const JUMP_VELOCITY = 3.5;
const DOUBLE_JUMP_VEL = 2.5;

// ─── Setup ──────────────────────────────────────────────────────────────────
export function setupControls(camera, renderer) {
    window.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        if (keys.hasOwnProperty(k)) keys[k] = true;
        if (e.code === 'Space') keys.space = true;
        if (e.code === 'ControlLeft' || e.code === 'ControlRight') keys.control = true;

        if (k === 'v' && !spectatorJustToggled) {
            isSpectatorMode = !isSpectatorMode;
            spectatorJustToggled = true;
            if (isSpectatorMode) {
                setSpectatorPosition(camera.position);
                targetSpectatorFOV = 75;
            }
        }

        // Over-the-shoulder toggle
        if (k === 'q') {
            shoulderSide = shoulderSide === 0 ? 1 : (shoulderSide === 1 ? -1 : 0);
        }
    });

    window.addEventListener('keyup', (e) => {
        const k = e.key.toLowerCase();
        if (keys.hasOwnProperty(k)) keys[k] = false;
        if (e.code === 'Space') keys.space = false;
        if (e.code === 'ControlLeft' || e.code === 'ControlRight') keys.control = false;
        if (k === 'v') spectatorJustToggled = false;
    });

    // Pointer Lock
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
        startBtn.addEventListener('click', () => document.body.requestPointerLock());
    }
    if (renderer && renderer.domElement) {
        renderer.domElement.addEventListener('click', () => {
            if (!isLocked) {
                const p = document.body.requestPointerLock();
                if (p) p.catch(() => {});
            }
        });
    }

    document.addEventListener('pointerlockchange', () => {
        isLocked = document.pointerLockElement === document.body;
    });

    // Mouse Look
    document.addEventListener('mousemove', (e) => {
        if (!isLocked) return;
        const sensitivity = 0.002;
        camYaw   -= e.movementX * sensitivity;
        camPitch -= e.movementY * sensitivity;
        camPitch = isSpectatorMode
            ? Math.max(0.01, Math.min(Math.PI - 0.01, camPitch))
            : Math.max(CAM_MIN_PITCH, Math.min(CAM_MAX_PITCH, camPitch));
    });

    // Scroll Zoom
    window.addEventListener('wheel', (e) => {
        if (!isLocked) return;
        if (isSpectatorMode) {
            targetSpectatorFOV += Math.sign(e.deltaY) * 10;
            targetSpectatorFOV = Math.max(15, Math.min(120, targetSpectatorFOV));
        } else {
            targetCamDist += Math.sign(e.deltaY) * 0.4;
            targetCamDist = Math.max(CAM_MIN_DIST, Math.min(CAM_MAX_DIST, targetCamDist));
        }
    });
}

// ─── Main Update ────────────────────────────────────────────────────────────
export function updateMovement(characterData, camera, delta) {
    if (!characterData.isLoaded) return;

    // ── STAMINA HUD ──────────────────────────────────────────────────────────
    _updateStaminaHUD();

    if (isSpectatorMode) {
        _updateSpectator(characterData, camera, delta);
        return;
    }

    _updatePlayer(characterData, camera, delta);
}

// ─── Spectator (Drone) ───────────────────────────────────────────────────────
function _updateSpectator(characterData, camera, delta) {
    const safePos = movePlayer(new THREE.Vector3(0, GRAVITY * delta, 0), delta);
    if (safePos) {
        characterData.mesh.position.copy(safePos);
        characterData.mesh.position.y -= 0.30;
    }
    fadeToAction(characterData, 'idle', 0.2);

    currentFOV += (targetSpectatorFOV - currentFOV) * 10 * delta;
    if (Math.abs(currentFOV - camera.fov) > 0.1) {
        camera.fov = currentFOV;
        camera.updateProjectionMatrix();
    }

    const lookDir = new THREE.Vector3(
        -Math.sin(camPitch) * Math.sin(camYaw),
        -Math.cos(camPitch),
        -Math.sin(camPitch) * Math.cos(camYaw)
    ).normalize();
    const rightDir = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw)).normalize();

    const moveDir = new THREE.Vector3();
    if (keys.w) moveDir.add(lookDir);
    if (keys.s) moveDir.sub(lookDir);
    if (keys.a) moveDir.sub(rightDir);
    if (keys.d) moveDir.add(rightDir);
    if (moveDir.lengthSq() > 0) moveDir.normalize();

    const speed = keys.shift ? RUN_SPEED * 6 : RUN_SPEED * 2.5;
    const desiredMove = moveDir.clone().multiplyScalar(speed * delta);
    if (keys.space) desiredMove.y += speed * delta;

    const newCamPos = moveSpectator(desiredMove);
    if (newCamPos) {
        camera.position.copy(newCamPos);
        currentCamPos.copy(newCamPos);
    }

    const idealLookAt = new THREE.Vector3().addVectors(camera.position, lookDir);
    camera.lookAt(idealLookAt);
    currentLookAt.copy(idealLookAt);
}

// ─── Standard Player ─────────────────────────────────────────────────────────
function _updatePlayer(characterData, camera, delta) {
    const grounded = isGrounded();

    // ── Movement Direction ───────────────────────────────────────────────────
    const forward = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    const right   = new THREE.Vector3( Math.cos(camYaw), 0, -Math.sin(camYaw));
    forward.normalize(); right.normalize();

    const rawDir = new THREE.Vector3();
    if (keys.w) rawDir.add(forward);
    if (keys.s) rawDir.sub(forward);
    if (keys.a) rawDir.sub(right);
    if (keys.d) rawDir.add(right);
    const isMoving = rawDir.lengthSq() > 0;
    if (isMoving) rawDir.normalize();

    // ── Stamina & Sprint ─────────────────────────────────────────────────────
    const isCrouching = keys.control;
    const wantsSprint = keys.shift && isMoving && grounded && !isCrouching;
    const canSprint   = !staminaDepleted && stamina > 0;
    const isSprinting = wantsSprint && canSprint;

    if (isSprinting) {
        stamina = Math.max(0, stamina - delta);
        if (stamina <= 0) staminaDepleted = true;
    } else {
        stamina = Math.min(MAX_STAMINA, stamina + delta * REGEN_RATE);
        if (stamina > MAX_STAMINA * 0.2) staminaDepleted = false;
    }

    let targetSpeed = isCrouching ? CROUCH_SPEED : (isSprinting ? RUN_SPEED : WALK_SPEED);
    if (!isMoving) targetSpeed = 0;

    // ── Momentum Accel/Decel ─────────────────────────────────────────────────
    const targetMomentum = rawDir.clone().multiplyScalar(targetSpeed);
    const accel = isMoving ? (isSprinting ? 18 : 12) : 20; // Decel faster than accel
    currentMomentum.lerp(targetMomentum, Math.min(1, accel * delta));

    const moveX = currentMomentum.x * delta;
    const moveZ = currentMomentum.z * delta;

    // ── Gravity & Jump ────────────────────────────────────────────────────────
    if (keys.space) { jumpBufferTimer = 0.15; keys.space = false; }
    else jumpBufferTimer -= delta;

    if (grounded && verticalVelocity <= 0) {
        coyoteTimer   = 0.15;
        doubleJumpAvail = true;
    } else {
        coyoteTimer -= delta;
    }

    if (grounded && verticalVelocity <= 0) {
        verticalVelocity = -1;
    } else {
        verticalVelocity += GRAVITY * delta;
    }

    // Primary jump
    if (coyoteTimer > 0 && jumpBufferTimer > 0) {
        verticalVelocity = JUMP_VELOCITY;
        coyoteTimer      = 0;
        jumpBufferTimer  = 0;
    }
    // Double jump
    else if (jumpBufferTimer > 0 && !grounded && doubleJumpAvail) {
        verticalVelocity  = DOUBLE_JUMP_VEL;
        doubleJumpAvail   = false;
        jumpBufferTimer   = 0;
    }

    const moveY = verticalVelocity * delta;

    // ── Physics Move ──────────────────────────────────────────────────────────
    const safePos = movePlayer(new THREE.Vector3(moveX, moveY, moveZ), delta);
    if (!safePos) return;

    // ── Landing Squash ────────────────────────────────────────────────────────
    const justLanded = !wasGrounded && grounded;
    wasGrounded = grounded;
    if (justLanded && prevVerticalVel < -2.0) {
        squashY = Math.max(0.65, 0.85 + prevVerticalVel * 0.03);
    }
    prevVerticalVel = verticalVelocity;
    squashY += (1.0 - squashY) * 18 * delta;

    // ── Mesh Transform ───────────────────────────────────────────────────────
    characterData.mesh.position.copy(safePos);
    characterData.mesh.position.y -= 0.30;

    // Crouch: lower mesh
    const crouchScale = isCrouching ? 0.75 : 1.0;
    characterData.mesh.scale.y = squashY * crouchScale;
    characterData.mesh.scale.x = 1.0 + (1.0 - squashY) * 0.5;
    characterData.mesh.scale.z = 1.0 + (1.0 - squashY) * 0.5;

    if (isMoving) {
        const targetAngle   = Math.atan2(currentMomentum.x, currentMomentum.z);
        const targetRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), targetAngle);
        characterData.mesh.quaternion.slerpQuaternions(characterData.mesh.quaternion, targetRotation, 10 * delta);
    }

    // ── Footstep Sounds ──────────────────────────────────────────────────────
    if (isMoving && grounded) {
        const stepInterval = isSprinting ? 0.28 : 0.42;
        footstepTimer -= delta;
        if (footstepTimer <= 0) {
            footstepTimer = stepInterval;
            try { playFootstep(); } catch(e) {}
        }
    } else {
        footstepTimer = 0; // Reset so next step plays immediately
    }

    // ── Idle Timer ───────────────────────────────────────────────────────────
    if (!isMoving && grounded) {
        idleTimer += delta;
    } else {
        idleTimer = 0;
        idleSwyTime = 0;
    }

    // ── Camera Zoom ──────────────────────────────────────────────────────────
    // Auto-zoom: closer while idle, farther while sprinting
    const autoZoom = isSprinting ? 0.5 : (idleTimer > 2 ? -0.4 : 0);
    CAM_DIST += (targetCamDist + autoZoom - CAM_DIST) * 8 * delta;

    // ── Dynamic FOV ──────────────────────────────────────────────────────────
    const targetFOV = isSprinting && grounded ? 88 : (isCrouching ? 65 : 75);
    currentFOV += (targetFOV - currentFOV) * 5 * delta;
    if (Math.abs(currentFOV - camera.fov) > 0.1) {
        camera.fov = currentFOV;
        camera.updateProjectionMatrix();
    }

    // ── Camera Bob ──────────────────────────────────────────────────────────
    const bobTarget = (isMoving && grounded) ? (isSprinting ? 0.09 : 0.04) : 0;
    bobAmp += (bobTarget - bobAmp) * 10 * delta;
    if (bobAmp > 0.001) {
        bobTime += delta * (isSprinting ? 18 : 10);
    } else {
        bobTime = 0;
    }
    const bobOffset = Math.sin(bobTime) * bobAmp;

    // ── Over-the-Shoulder ────────────────────────────────────────────────────
    currentShoulderOffset += (shoulderSide * 0.55 - currentShoulderOffset) * 8 * delta;

    // ── Look-ahead offset ───────────────────────────────────────────────────
    // Camera subtly shifts in direction of travel
    const lookAheadTarget = currentMomentum.clone().normalize().multiplyScalar(
        isMoving ? currentMomentum.length() * 0.15 : 0
    );
    lookAheadOffset.lerp(lookAheadTarget, 5 * delta);

    // ── Idle Sway ────────────────────────────────────────────────────────────
    let idleSwyX = 0, idleSwyY = 0;
    if (idleTimer > 3.0) {
        idleSwyTime += delta * 0.3;
        idleSwyX = Math.sin(idleSwyTime)        * 0.08;
        idleSwyY = Math.sin(idleSwyTime * 1.7)  * 0.04;
    }

    // ── Sprint Vignette ──────────────────────────────────────────────────────
    _updateSprintVignette(isSprinting && isMoving);

    // ── Build LookAt & Camera Position ──────────────────────────────────────
    const crouchYOffset = isCrouching ? -0.25 : 0;
    const targetHeight  = 0.5 + bobOffset + idleSwyY + crouchYOffset;
    const idealLookAt   = characterData.mesh.position.clone();
    idealLookAt.x += lookAheadOffset.x * 0.5 + idleSwyX;
    idealLookAt.y += targetHeight;
    idealLookAt.z += lookAheadOffset.z * 0.5;

    const offset = new THREE.Vector3();
    offset.x = CAM_DIST * Math.sin(camPitch) * Math.sin(camYaw) + currentShoulderOffset * Math.cos(camYaw);
    offset.y = CAM_DIST * Math.cos(camPitch);
    offset.z = CAM_DIST * Math.sin(camPitch) * Math.cos(camYaw) - currentShoulderOffset * Math.sin(camYaw);

    const idealCamPos = idealLookAt.clone().add(offset);

    // Camera Collision
    const rayDir  = new THREE.Vector3().subVectors(idealCamPos, idealLookAt).normalize();
    const hitDist = raycastCamera(idealLookAt, rayDir, CAM_DIST);
    const safeDist    = Math.max(0.5, hitDist - 0.2);
    const finalCamPos = idealLookAt.clone().add(rayDir.multiplyScalar(safeDist));

    // ── Spring-Damped Camera ─────────────────────────────────────────────────
    if (isFirstFrame) {
        currentCamPos.copy(finalCamPos);
        currentLookAt.copy(idealLookAt);
        isFirstFrame = false;
    } else {
        // Fast reliable lerp — responsive yet smooth
        currentCamPos.lerp(finalCamPos, 15 * delta);
        currentLookAt.lerp(idealLookAt, 20 * delta);
    }

    camera.position.copy(currentCamPos);
    camera.lookAt(currentLookAt);

    // ── Animations ──────────────────────────────────────────────────────────
    if (!grounded) {
        fadeToAction(characterData, 'jump', 0.2);
    } else if (!isMoving) {
        fadeToAction(characterData, 'idle', 0.2);
    } else if (isSprinting) {
        fadeToAction(characterData, 'run', 0.2);
    } else {
        fadeToAction(characterData, 'walk', 0.2);
    }
}

// ─── HUD Updates ────────────────────────────────────────────────────────────
function _updateStaminaHUD() {
    const bar = document.getElementById('stamina-bar-fill');
    const barWrap = document.getElementById('stamina-bar');
    if (!bar || !barWrap) return;
    const pct = stamina / MAX_STAMINA;
    bar.style.width = `${pct * 100}%`;
    bar.style.background = staminaDepleted
        ? '#ff4444'
        : `hsl(${40 + pct * 20}, 90%, 55%)`;
    // Show bar only when not full
    barWrap.style.opacity = pct < 0.99 ? '1' : '0';
}

function _updateSprintVignette(active) {
    let el = document.getElementById('sprint-vignette');
    if (!el) return;
    el.style.opacity = active ? '1' : '0';
}
