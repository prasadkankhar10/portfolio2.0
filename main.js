import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createScene, createRenderer } from './world/scene.js';
import { setupLighting, updateLighting, getTimeOfDay } from './world/lighting.js';
import { createCamera, handleResize } from './character/camera.js';
import { createCharacter } from './character/characterController.js';
import { setupControls, updateMovement, isSpectatorMode } from './character/movement.js';
import { setupClouds, updateClouds } from './world/clouds.js';
import { setupBirds, updateBirds } from './world/birds.js';
import { setupParticles, updateParticles, setupFireflySwarms, updateFireflySwarms } from './world/particles.js';
import { setupFish, updateFish } from './world/fish.js';
import { setupCompanion, updateCompanion } from './world/companion.js';
import { setupStars, updateStars } from './world/stars.js';
import { setupGodRays, updateGodRays } from './world/godRays.js';
import { initSoundscape, updateSoundscape, toggleMute } from './world/soundscape.js';
import { setupOrbs, updateOrbs } from './world/orbs.js';
import { setupInteraction, updateInteraction } from './interaction/interactionManager.js';
import { initUIController, getModalState, openModal } from './ui/uiController.js';
import { populateTraditionalView } from './ui/portfolioSections.js';
import { initPhysics, createIslandCollider, createPlayerController, createSpectatorController, setPlayerPosition } from './physics/physics.js';

let scene, camera, renderer, composer, playerData;
let waterMesh;
let waterNormals;
let windowMeshes = [];
let windowLights = [];
let stallLights = [];     // Campfire lights near market stalls
let playerTorchLight;     // Personal lantern that follows the player
let isExploring = false;
let isPaused = false;
let spawnX = -9.998;
let spawnZ = -7.110;
let spawnY = 20;

const clock = new THREE.Clock();

async function init() {
    // 0. Fetch External Configuration Data First
    try {
        const response = await fetch('./data.json');
        window.portfolioData = await response.json();
        
        // Dynamically Inject Profile texts to HTML immediately
        const pd = window.portfolioData.profile;
        document.getElementById('hud-name').innerHTML = pd.name;
        document.getElementById('hud-title').innerHTML = pd.title.replace(/•/g, '&bull;');
        document.getElementById('start-name').innerHTML = pd.name;
        document.getElementById('start-message').innerHTML = pd.welcomeMessage;
        
        const tradName = document.getElementById('trad-name');
        if (tradName) tradName.innerHTML = pd.name;
        
    } catch (e) {
        console.error("Critical Start Error: Failed to load data.json", e);
        window.portfolioData = { profile: {}, spatialPrompts: {}, modals: {} };
    }
    
    // 1. Core Setup
    scene    = createScene();
    renderer = createRenderer();
    camera   = createCamera();

    // Post-processing
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.4,  // 0.4 strength prevents the sun from causing a full screen explosion
        1.0,  // tighter blur radius
        0.85  // 0.85 threshold ensures only true >1.0 HDR light sources bloom
    );
    composer.addPass(bloomPass);

    const smaaPass = new SMAAPass( window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio() );
    composer.addPass(smaaPass);

    handleResize(camera, renderer, composer);
    setupLighting(scene, renderer); // Pass renderer so lighting can control tone mapping
    setupClouds(scene);
    setupBirds(scene);
    setupParticles(scene);
    setupFireflySwarms(scene); // Dense swarms near tree anchors
    setupCompanion(scene);
    setupStars(scene);         // Procedural star field
    setupGodRays(scene);       // Sun halo billboard
    setupOrbs(scene);          // Collectible golden orbs

    // 2. Parallel Asset Loading (HUGE Performance Boost!)
    // Fire off all massive downloads at the exact same time instead of sequentially
    const textureLoader = new THREE.TextureLoader();
    const gltfLoader = new GLTFLoader();

    try {
        const [_, loadedWaterNormals, gltf] = await Promise.all([
            initPhysics(), // Downloads Rapier WASM
            textureLoader.loadAsync('./assets/water_normal.jpg'),
            gltfLoader.loadAsync('./assets/working_portfolio11.glb')
        ]);

        // 3. Process loaded ocean textures
        waterNormals = loadedWaterNormals;
        waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;
        waterNormals.repeat.set(60, 60); // Tile the ripples so they aren't enormous!

        // 4. Process loaded island GLB
        const island = gltf.scene;

        // Enable shadows and tune materials for a vibrant, premium look
        island.traverse((child) => {
            if (child.isMesh) {
                // Apply global flat shading to match the reference image's pristine Low-Poly style
                if (child.material) {
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    materials.forEach(mat => {
                        mat.flatShading = true;
                        mat.needsUpdate = true;
                    });
                }

                if (child.name === 'Plane004_0' || child.name.includes('Plane004')) {
                    waterMesh = child;
                    child.receiveShadow = true;
                    child.castShadow = false; // Water shouldn't block light from hitting the sea floor
                    
                    // Replace geometry with perfect flat plane so we have mathematically perfect Texture UV Maps!
                    child.geometry.dispose();
                    child.geometry = new THREE.PlaneGeometry(400, 400, 1, 1);
                    child.geometry.rotateX(-Math.PI / 2); // Lay it flat
                    
                    child.material = new THREE.MeshStandardMaterial({
                        color: 0x4a6eb0, // Matched reference picture deep blue
                        roughness: 0.35, // Softer highlight to avoid square bloom artifacts
                        metalness: 0.15, // Significantly diffuse specular intensity
                        normalMap: waterNormals,
                        normalScale: new THREE.Vector2(0.8, 0.8), // Ripples strength (0 to 1)
                        transparent: false,
                        flatShading: false
                    });
                    
                } else {
                    // Check if this mesh or any parent group is named "windows"
                    let isWindow = false;
                    const cName = child.name.toLowerCase();
                    if (cName.includes('window')) isWindow = true;
                    if (child.parent && child.parent.name.toLowerCase().includes('window')) isWindow = true;
                    if (child.parent && child.parent.parent && child.parent.parent.name.toLowerCase().includes('window')) isWindow = true;

                    if (isWindow) {
                        windowMeshes.push(child);
                        child.receiveShadow = false; // Glow sources don't receive shadows well
                        child.castShadow = false;
                        
                        // Preserve the original 3D model's texture graphics for daytime!
                        if (child.material) {
                            child.material = child.material.clone();
                            child.material.emissive = new THREE.Color(0xffb732); // Warmer yellow-orange
                            child.material.emissiveIntensity = 0;
                            child.material.roughness = Math.max(child.material.roughness || 0.0, 0.4); 
                        }
                        
                        // Procedurally spawn highly directed SpotLights by clustering window vertices!
                        const posAttr = child.geometry.attributes.position;
                        const normalAttr = child.geometry.attributes.normal;
                        child.updateMatrixWorld(true);
                        const normalMatrix = new THREE.Matrix3().getNormalMatrix(child.matrixWorld);
                        
                        // Sample ~50 arbitrary vertices per mesh to find clusters
                        const sampleStep = Math.max(1, Math.floor(posAttr.count / 50));
                        for (let i = 0; i < posAttr.count; i += sampleStep) {
                            const localPos = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
                            const worldPos = localPos.applyMatrix4(child.matrixWorld);
                            
                            let isNear = false;
                            for (let light of windowLights) {
                                if (light.position.distanceTo(worldPos) < 16.0) { // Keep lights isolated
                                    isNear = true;
                                    break;
                                }
                            }
                            
                            if (!isNear && windowLights.length < 12) { 
                                // Ambient PointLight pulled slightly away from the house to emulate a glowing streetlamp or porch lantern!
                                const pLight = new THREE.PointLight(0xffb732, 0, 45, 2.0); // 45m radius, smooth quadratic decay
                                
                                // Find the geometric direction the window is pointing
                                let outDir = new THREE.Vector3(0, 0, 1);
                                if (normalAttr) {
                                    const localNorm = new THREE.Vector3(normalAttr.getX(i), normalAttr.getY(i), normalAttr.getZ(i));
                                    outDir = localNorm.applyMatrix3(normalMatrix).normalize();
                                }
                                
                                // Pull the light 3 meters straightforward away from the window, and 1 meter down.
                                // This perfectly simulates a warm ambient light bouncing off the front wall of the house without being a blinding spot!
                                pLight.position.copy(worldPos).add(outDir.clone().multiplyScalar(3.0)).add(new THREE.Vector3(0, -1.0, 0));
                                scene.add(pLight);
                                windowLights.push(pLight);
                            }
                        }
                    } else {
                        child.castShadow    = true;
                        child.receiveShadow = true;

                    // Material Enhancement (Saturation & Shine)
                    if (child.material) {
                        const materials = Array.isArray(child.material) ? child.material : [child.material];
                        
                        materials.forEach(mat => {
                            if (mat.color) {
                                const hsl = { h: 0, s: 0, l: 0 };
                                mat.color.getHSL(hsl);
                                if (hsl.s > 0.05) {
                                    hsl.s = Math.min(1.0, hsl.s * 1.4); // 40% saturation boost
                                    mat.color.setHSL(hsl.h, hsl.s, hsl.l);
                                }
                            }
                            if (mat.isMeshStandardMaterial) {
                                mat.roughness = 0.6; 
                                mat.metalness = 0.1; 
                            }
                        });
                    }
                    } // End of window filtering else block
                }
            }
        });

        // Centre island at world origin
        const box    = new THREE.Box3().setFromObject(island);
        const center = new THREE.Vector3();
        box.getCenter(center);
        island.position.x = -center.x;
        island.position.z = -center.z;
        island.position.y = -box.min.y;
        island.updateMatrixWorld(true);
        scene.add(island);

        // ── Campfire/Torch Lights at stall positions ──────────────────────
        // Placed approximately where your 6 market stalls are
        const stallPositions = [
            { x: -18, z: -10 },
            { x: -14, z: -10 },
            { x: -10, z: -10 },
            { x: -18, z: -6  },
            { x: -14, z: -6  },
            { x: -10, z: -6  },
        ];
        stallPositions.forEach(pos => {
            const light = new THREE.PointLight(0xff7722, 0, 12, 2.0);
            light.position.set(pos.x, 2.5, pos.z); // 2.5m high — just above table level
            scene.add(light);
            stallLights.push(light);
        });

        // ── Player personal torch light ────────────────────────────────────
        playerTorchLight = new THREE.PointLight(0xffcc66, 0, 8, 2.2);
        scene.add(playerTorchLight);

        const size = new THREE.Vector3();
        box.getSize(size);
        console.log(`Island loaded! Size: ${size.x.toFixed(1)}m × ${size.y.toFixed(1)}m × ${size.z.toFixed(1)}m`);

        // Build Rapier trimesh collider from all island meshes
        createIslandCollider(island);
        
        // Spawn Koi Fish accurately around the true sea level AFTER the island loads
        if (waterMesh) {
            const waterPos = new THREE.Vector3();
            waterMesh.getWorldPosition(waterPos);
            setupFish(scene, waterPos.y); 
        }

        // Spawn player above the provided coordinates so they fall onto the surface
        spawnY = box.max.y + 2; // Drop gently from just above the tallest obstacle
        
        createPlayerController(spawnX, spawnY, spawnZ);
        createSpectatorController(spawnX, spawnY, spawnZ);

        // Load 3D model and create state object
        playerData = createCharacter(scene);
        setupControls(camera, renderer);

        // UI & Interaction Setup
        const interactables = {};
        
        // Auto-register every mesh that has a trigger with a meshName defined
        const { triggers: triggerList } = await import('./interaction/triggers.js');
        for (const trigger of triggerList) {
            if (trigger.meshName) {
                const found = island.getObjectByName(trigger.meshName);
                if (found) {
                    interactables[trigger.id] = found;
                    console.log(`✅ Registered interactable '${trigger.id}' → mesh '${trigger.meshName}'`);
                } else {
                    console.warn(`⚠️ Could not find mesh '${trigger.meshName}' for trigger '${trigger.id}'`);
                }
            }
        }
        
        setupInteraction(interactables);

        // Hide loading screen ONLY after the island has fully loaded and physics are built
        document.getElementById('loading-screen').classList.remove('visible');
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('start-screen').classList.remove('hidden');
        document.getElementById('start-screen').classList.add('visible');

    } catch (error) {
        console.error('Critical Error loading game assets sequentially:', error);
    }

    // 4. UI Setup
    populateTraditionalView();
    
    initUIController(
        // onModalCloseCallback
        () => {}
    );

    // Enter World Button
    const startBtn = document.getElementById('start-btn');
    const startScreen = document.getElementById('start-screen');
    const pauseScreen = document.getElementById('pause-screen');
    const traditionalView = document.getElementById('traditional-view');

    startBtn.addEventListener('click', () => {
        initSoundscape(); // ✅ AudioContext starts legally upon explicit User Click!
        startScreen.classList.remove('visible');
        startScreen.classList.add('hidden');
        isExploring = true;
        isPaused = false;
    });

    // Pause functionality via pointer lock loss (hitting Escape)
    document.addEventListener('pointerlockchange', () => {
        if (!isExploring) return;
        
        const contentModal = document.getElementById('content-modal');
        const isContentOpen = contentModal.classList.contains('visible');
        
        if (document.pointerLockElement !== document.body && !isContentOpen) {
            // User pressed escape
            isPaused = true;
            pauseScreen.classList.remove('hidden');
            pauseScreen.classList.add('visible');
        } else {
            // Resumed
            isPaused = false;
            pauseScreen.classList.remove('visible');
            pauseScreen.classList.add('hidden');
        }
    });

    // Pause UI Buttons
    document.getElementById('resume-btn').addEventListener('click', () => {
        document.body.requestPointerLock().catch(() => {});
    });

    document.getElementById('exit-btn').addEventListener('click', () => {
        document.exitPointerLock();
        isExploring = false;
        pauseScreen.classList.remove('visible');
        pauseScreen.classList.add('hidden');
        
        const hudLayer = document.getElementById('hud-layer');
        const promptLayer = document.getElementById('prompt-layer');
        if (hudLayer) hudLayer.classList.add('hidden');
        if (promptLayer) promptLayer.classList.add('hidden');
        
        traditionalView.classList.remove('hidden');
        traditionalView.classList.add('visible');
    });

    // Start screen skip button
    const skipBtnLegacy = document.getElementById('skip-btn');
    if (skipBtnLegacy) {
        skipBtnLegacy.addEventListener('click', () => {
            startScreen.classList.remove('visible');
            startScreen.classList.add('hidden');
            
            const hudLayer = document.getElementById('hud-layer');
            const promptLayer = document.getElementById('prompt-layer');
            if (hudLayer) hudLayer.classList.add('hidden');
            if (promptLayer) promptLayer.classList.add('hidden');
            
            traditionalView.classList.remove('hidden');
            traditionalView.classList.add('visible');
        });
    }

    // Return to World button
    const backToGameBtn = document.getElementById('back-to-game-btn');
    if (backToGameBtn) {
        backToGameBtn.addEventListener('click', () => {
            traditionalView.classList.remove('visible');
            traditionalView.classList.add('hidden');
            
            const hudLayer = document.getElementById('hud-layer');
            const promptLayer = document.getElementById('prompt-layer');
            if (hudLayer) hudLayer.classList.remove('hidden');
            if (promptLayer) promptLayer.classList.remove('hidden');
            
            isExploring = true;
            document.body.requestPointerLock().catch(() => {});
        });
    }

    // Retained UI listeners


    animate();

    // M key = toggle sound mute from anywhere in the game
    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'm') {
            const muted = toggleMute();
            const muteBtn = document.getElementById('mute-btn');
            if (muteBtn) {
                muteBtn.innerHTML = muted ? '\uD83D\uDD07 [M]' : '\uD83D\uDD0A [M]';
                muteBtn.style.borderColor = muted ? 'rgba(255,80,80,0.6)' : 'rgba(255,215,0,0.4)';
                muteBtn.style.color = muted ? '#ff6666' : '#ffd700';
            }
        }
    });
}

function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);
    const totalTime = clock.getElapsedTime();

    // Only update gameplay loops if not paused and completely exploring
    if (playerData && isExploring && !isPaused && !getModalState()) {
        updateMovement(playerData, camera, delta);
        // Interactions
        if (playerData && playerData.mesh) {
            updateInteraction(playerData.mesh.position, camera);
        }    
        // Advance physics
        if (typeof window.rapierWorld !== 'undefined') {
            window.rapierWorld.step();
        }
        if (playerData.mixer) playerData.mixer.update(delta);
        
        // Update Water Ripples seamlessly (A subtle slow drift)
        if (waterNormals) {
            waterNormals.offset.x -= delta * 0.005; // Pan left very slowly
            waterNormals.offset.y += delta * 0.002; // Pan slightly forward very slowly
        }
        // Out-of-bounds Check (Easter Egg / Excuse for unfinished edges)
        if (!isSpectatorMode && playerData && playerData.mesh) {
            // Check horizontal bounding dimensions (X: 82, Z: 82)
            const px = playerData.mesh.position.x;
            const pz = playerData.mesh.position.z;
            
            // Only trigger if they walked off the edges of the 82x82 map
            if (Math.abs(px) > 82 || Math.abs(pz) > 82) {
                // Player went completely out of bounds! Teleport back to spawn
                setPlayerPosition(new THREE.Vector3(spawnX, spawnY, spawnZ));
                
                openModal('html', `
                    <div style="text-align: center; padding: 1.5rem;">
                        <h2 style="font-family: 'Playfair Display', serif; color: #8b5a2b; font-size: 2rem;">A Splash Too Far...</h2>
                        <p style="margin-top: 1rem; font-size: 1.1rem; line-height: 1.6;">
                            <b>[Developer's Note]:</b><br/><br/>
                            Well, this is slightly embarrassing... I haven't quite finished programming the edge of the world, nor have I taught the hero how to swim in WebGL yet!<br/><br/>
                            For your own safety, you have been magically teleported back to the center of the map!
                        </p>
                    </div>
                `);
            }
        }
    }



    // Update cozy window lights dynamically with sunset/sunrise!
    const time = getTimeOfDay();
    let nightStrength = 0;
    if (time >= 19 || time <= 5) {
        nightStrength = 1.0;
    } else if (time > 18 && time < 19) {
        nightStrength = time - 18;
    } else if (time > 5 && time < 6) {
        nightStrength = 1.0 - (time - 5);
    }
    
    if (windowMeshes && windowMeshes.length > 0) {
        for (let w of windowMeshes) {
            if (w.material) w.material.emissiveIntensity = nightStrength * 3.5;
        }
    }
    if (windowLights && windowLights.length > 0) {
        for (let light of windowLights) {
            light.intensity = nightStrength * 150.0;
        }
    }

    // Campfire lights — warm flicker tied to nightStrength
    const baseStallIntensity = nightStrength * 60;
    for (let sl of stallLights) {
        sl.intensity = baseStallIntensity + (Math.random() - 0.5) * baseStallIntensity * 0.3;
    }

    // Player torch light — follows player, stronger at night
    if (playerTorchLight && playerData && playerData.mesh) {
        playerTorchLight.position.copy(playerData.mesh.position);
        playerTorchLight.position.y += 1.2; // Chest height
        const torchTarget = nightStrength * 20;
        playerTorchLight.intensity += (torchTarget - playerTorchLight.intensity) * 0.05;
    }

    // Shadow Flicker — subtle ±2% jitter on the sun's intensity
    if (window._dirLight) {
        window._dirLight.intensity += (Math.random() - 0.5) * 0.04;
    }

    // Star field & God Rays
    updateStars(totalTime, nightStrength);
    updateGodRays(time);
    updateSoundscape(nightStrength);

    // Compass HUD
    if (!window._compassNeedle) window._compassNeedle = document.getElementById('compass-needle');
    const compassNeedle = window._compassNeedle;
    if (compassNeedle && camera) {
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        const angle = Math.atan2(dir.x, dir.z) * (180 / Math.PI);
        const child = compassNeedle.firstElementChild;
        if (child) child.style.transform = `rotate(${angle}deg)`;
    }

    // Time of Day Badge (update max once/sec)
    if (!window._timeBadge) window._timeBadge = document.getElementById('time-icon');
    if (!window._timeLabel) window._timeLabel = document.getElementById('time-label');
    const timeBadge = window._timeBadge;
    const timeLabel = window._timeLabel;
    if (timeBadge && timeLabel) {
        let icon = '\u2600\ufe0f', label = 'Day';
        if (time >= 19 || time < 5)   { icon = '\uD83C\uDF19'; label = 'Night'; }
        else if (time >= 5 && time < 7)  { icon = '\uD83C\uDF05'; label = 'Dawn'; }
        else if (time >= 17 && time < 19) { icon = '\uD83C\uDF06'; label = 'Dusk'; }
        timeBadge.textContent = icon;
        timeLabel.textContent = label;
    }

    // Always update visual elements
    updateClouds(delta);
    updateBirds(delta);
    updateParticles(delta);
    updateFireflySwarms(delta, totalTime);
    updateLighting(delta);

    if (playerData && playerData.mesh) {
        updateFish(delta, playerData.mesh.position, totalTime);
        updateCompanion(delta, playerData.mesh, totalTime, nightStrength);
        updateOrbs(delta, playerData.mesh.position, totalTime);
    } else {
        updateFish(delta, null, totalTime);
    }

    composer.render();
}

document.addEventListener('DOMContentLoaded', init);
