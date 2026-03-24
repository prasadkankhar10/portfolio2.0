import * as THREE from 'three';
import { movePlayer, isGrounded, getPlayerPhysicsPosition, raycastCamera, moveSpectator, setSpectatorPosition } from '../physics/physics.js';
import { fadeToAction } from './characterController.js';

// Input State
const keys = { w: false, a: false, s: false, d: false, shift: false, space: false, v: false };
export let isSpectatorMode = false;
let spectatorJustToggled = false;
let CAM_DIST = 2.0; 
let targetCamDist = 2.5;
let targetSpectatorFOV = 75;
const CAM_MIN_PITCH = 0.05;
const CAM_MAX_PITCH = Math.PI / 2.1;

let camYaw = 0;
let camPitch = Math.PI / 8; // Start viewing more horizontally
let isLocked = false;
let verticalVelocity = 0;

// Movement speeds
const WALK_SPEED = 1.2;
const RUN_SPEED = 3.0;
const GRAVITY = -20.0;
const JUMP_VELOCITY = 3.5;

const currentCamPos = new THREE.Vector3();
const currentLookAt = new THREE.Vector3();
let isFirstFrame = true;

// Camera Dynamics State
let currentFOV = 75;
let bobTime = 0;
let bobAmp = 0;

// Movement Feel State
let coyoteTimer = 0;
let jumpBufferTimer = 0;

export function setupControls(camera, renderer) {
    // Key Listeners
    window.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        if (keys.hasOwnProperty(k)) keys[k] = true;
        if (e.code === 'Space') keys.space = true;
        
        if (k === 'v' && !spectatorJustToggled) {
            isSpectatorMode = !isSpectatorMode;
            spectatorJustToggled = true;
            
            if (isSpectatorMode) {
                // Snap drone to current camera before moving
                setSpectatorPosition(camera.position);
                targetSpectatorFOV = 75; // reset FOV zoom
            }
        }
    });

    window.addEventListener('keyup', (e) => {
        const k = e.key.toLowerCase();
        if (keys.hasOwnProperty(k)) keys[k] = false;
        if (e.code === 'Space') keys.space = false;
        if (k === 'v') spectatorJustToggled = false;
    });

    // Pointer Lock for Camera Orbit
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            document.body.requestPointerLock();
        });
    }

    // Allow re-locking by clicking on the game canvas
    if (renderer && renderer.domElement) {
        renderer.domElement.addEventListener('click', () => {
            if (!isLocked) {
                const promise = document.body.requestPointerLock();
                if (promise) promise.catch(() => {}); // Ignore rapid re-lock errors
            }
        });
    }

    document.addEventListener('pointerlockchange', () => {
        isLocked = document.pointerLockElement === document.body;
    });

    // Mouse Move (Camera Orbit)
    document.addEventListener('mousemove', (e) => {
        if (!isLocked) return;

        const sensitivity = 0.002;
        camYaw -= e.movementX * sensitivity;
        camPitch -= e.movementY * sensitivity;

        // Clamp Pitch depending on mode
        if (isSpectatorMode) {
            // Drone can look anywhere from straight down to straight up
            camPitch = Math.max(0.01, Math.min(Math.PI - 0.01, camPitch));
        } else {
            camPitch = Math.max(CAM_MIN_PITCH, Math.min(CAM_MAX_PITCH, camPitch));
        }
    });

    // Scroll Wheel Zoom
    window.addEventListener('wheel', (e) => {
        if (!isLocked) return;
        
        if (isSpectatorMode) {
            // Freecam FOV Zoom (Binocular effect)
            targetSpectatorFOV += Math.sign(e.deltaY) * 10;
            targetSpectatorFOV = Math.max(15, Math.min(120, targetSpectatorFOV));
        } else {
            // Player Orbit Zoom
            targetCamDist += Math.sign(e.deltaY) * 0.5;
            targetCamDist = Math.max(1.0, Math.min(8.0, targetCamDist));
        }
    });
}

export function updateMovement(characterData, camera, delta) {
    if (!characterData.isLoaded) return;

    if (isSpectatorMode) {
        // --- SPECTATOR MODE (MINECRAFT DRONE) ---
        // 1. Player still gets gravity so they don't float away
        const safePos = movePlayer(new THREE.Vector3(0, GRAVITY * delta, 0), delta);
        if (safePos) {
            characterData.mesh.position.copy(safePos);
            characterData.mesh.position.y -= 0.30;
        }
        fadeToAction(characterData, 'idle', 0.2); // Player just stands there

        // 2. Drone Movement & FOV Zoom
        currentFOV += (targetSpectatorFOV - currentFOV) * 10 * delta;
        if (Math.abs(currentFOV - camera.fov) > 0.1) {
            camera.fov = currentFOV;
            camera.updateProjectionMatrix();
        }

        // Polar look dir (camPitch 0 is looking straight down, PI/2 is horizontal, PI is up)
        const lookDir = new THREE.Vector3(
            -Math.sin(camPitch) * Math.sin(camYaw),
            -Math.cos(camPitch),
            -Math.sin(camPitch) * Math.cos(camYaw)
        ).normalize();
        
        const rightDir = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw)).normalize();
        
        const moveDir = new THREE.Vector3();
        if (keys.w) moveDir.add(lookDir);    // Fly where you look
        if (keys.s) moveDir.sub(lookDir);
        if (keys.a) moveDir.sub(rightDir);   // Strafe left
        if (keys.d) moveDir.add(rightDir);   // Strafe right

        if (moveDir.lengthSq() > 0) moveDir.normalize();

        const speed = keys.shift ? RUN_SPEED * 6 : RUN_SPEED * 2.5; // Smooth flight speeds
        const desiredMove = new THREE.Vector3(
            moveDir.x * speed * delta,
            moveDir.y * speed * delta,
            moveDir.z * speed * delta
        );

        if (keys.space) desiredMove.y += speed * delta; // Space flies absolute UP

        // 3. Move drone body with collision
        const newCamPos = moveSpectator(desiredMove);
        if (newCamPos) {
            camera.position.copy(newCamPos);
            currentCamPos.copy(newCamPos); // Keep damping synced
        }

        // 4. Update camera rotation
        const idealLookAt = new THREE.Vector3().addVectors(camera.position, lookDir);
        camera.lookAt(idealLookAt);
        currentLookAt.copy(idealLookAt);
        
        return; // Don't execute standard player movement below
    }

    // --- STANDARD PLAYER MOVEMENT ---
    // 1. Calculate Expected Movement Vector based on Camera Yaw
    // The camera looks down the -Z axis when yaw is 0
    const forward = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    const right = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
    
    forward.normalize();
    right.normalize();

    const moveDir = new THREE.Vector3();
    if (keys.w) moveDir.add(forward);
    if (keys.s) moveDir.sub(forward);
    if (keys.a) moveDir.sub(right); // A moves left
    if (keys.d) moveDir.add(right); // D moves right
    
    let isMoving = moveDir.lengthSq() > 0;
    if (isMoving) moveDir.normalize();

    const speed = keys.shift ? RUN_SPEED : WALK_SPEED;
    const currentSpeed = isMoving ? speed : 0;
    
    const moveX = moveDir.x * currentSpeed * delta;
    const moveZ = moveDir.z * currentSpeed * delta;

    // 2. Gravity & Jumping
    const grounded = isGrounded();
    
    // Jump Buffering (Space is held or recently pressed)
    if (keys.space) {
        jumpBufferTimer = 0.15; // 150ms buffer
        keys.space = false; // consume the actual key press
    } else {
        jumpBufferTimer -= delta;
    }

    // Coyote Time
    if (grounded && verticalVelocity <= 0) {
        coyoteTimer = 0.15; // 150ms coyote time
    } else {
        coyoteTimer -= delta;
    }
    
    if (grounded && verticalVelocity <= 0) {
        verticalVelocity = -1; // Keep snapped to ground
    } else {
        // Apply gravity if in the air or moving upward
        verticalVelocity += GRAVITY * delta;
    }

    // Perform Jump
    if (coyoteTimer > 0 && jumpBufferTimer > 0) {
        verticalVelocity = JUMP_VELOCITY;
        coyoteTimer = 0;      // Consume coyote time
        jumpBufferTimer = 0;  // Consume jump buffer
    }

    const moveY = verticalVelocity * delta;

    // 3. Move via Rapier Physics
    const desiredMove = new THREE.Vector3(moveX, moveY, moveZ);
    const safePos = movePlayer(desiredMove, delta);

    if (!safePos) return;

    // 4. Update Visual Mesh Position (offset by mesh height so feet align)
    characterData.mesh.position.copy(safePos);
    characterData.mesh.position.y -= 0.30; // Player half-height (0.15) + radius (0.15)

    // 5. Update Visual Mesh Rotation (Smoothly look in direction of movement)
    if (isMoving) {
        const targetAngle = Math.atan2(moveDir.x, moveDir.z);
        const currentRotation = new THREE.Quaternion().copy(characterData.mesh.quaternion);
        const targetRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), targetAngle);
        
        // Slerp for smooth turning
        characterData.mesh.quaternion.slerpQuaternions(currentRotation, targetRotation, 10 * delta);
    }

    // 6. Update Camera Position (Orbit Mode with Collision and Smoothing)
    // Zoom Lerp
    CAM_DIST += (targetCamDist - CAM_DIST) * 10 * delta;

    // Dynamic FOV for running
    const targetFOV = (isMoving && keys.shift && grounded) ? 85 : 75;
    currentFOV += (targetFOV - currentFOV) * 5 * delta;
    if (Math.abs(currentFOV - camera.fov) > 0.1) {
        camera.fov = currentFOV;
        camera.updateProjectionMatrix();
    }

    // Camera Bobbing
    const bobTarget = (isMoving && grounded) ? (keys.shift ? 0.08 : 0.04) : 0;
    bobAmp += (bobTarget - bobAmp) * 10 * delta;
    if (bobAmp > 0.001) {
        bobTime += delta * (keys.shift ? 15 : 10);
    } else {
        bobTime = 0;
    }
    const bobOffset = Math.sin(bobTime) * bobAmp;

    const targetHeight = 0.5 + bobOffset; // Look at head/chest of the 0.5m tall character, with bob
    const idealLookAt = characterData.mesh.position.clone();
    idealLookAt.y += targetHeight;

    // Ideal spherical offset
    const offset = new THREE.Vector3();
    offset.x = CAM_DIST * Math.sin(camPitch) * Math.sin(camYaw);
    offset.y = CAM_DIST * Math.cos(camPitch);
    offset.z = CAM_DIST * Math.sin(camPitch) * Math.cos(camYaw);

    const idealCamPos = idealLookAt.clone().add(offset);

    // Camera Collision (Raycast from player look target to ideal camera pos)
    const rayDir = new THREE.Vector3().subVectors(idealCamPos, idealLookAt).normalize();
    const hitDist = raycastCamera(idealLookAt, rayDir, CAM_DIST);
    
    // Push camera slightly in front of the wall (0.2m buffer)
    const safeDist = Math.max(0.5, hitDist - 0.2); 
    const finalCamPos = idealLookAt.clone().add(rayDir.multiplyScalar(safeDist));

    // Smooth Damping (Lerping)
    if (isFirstFrame) {
        currentCamPos.copy(finalCamPos);
        currentLookAt.copy(idealLookAt);
        isFirstFrame = false;
    } else {
        currentCamPos.lerp(finalCamPos, 15 * delta); // High speed position catchup
        currentLookAt.lerp(idealLookAt, 20 * delta); // Very high speed look target catchup
    }

    camera.position.copy(currentCamPos);
    camera.lookAt(currentLookAt);

    // 7. Animations
    if (!grounded) {
        fadeToAction(characterData, 'jump', 0.2);
    } else if (!isMoving) {
        fadeToAction(characterData, 'idle', 0.2);
    } else if (keys.shift) {
        fadeToAction(characterData, 'run', 0.2);
    } else {
        fadeToAction(characterData, 'walk', 0.2);
    }
}
