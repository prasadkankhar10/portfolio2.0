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
import { setupParticles, updateParticles } from './world/particles.js';
import { setupInteraction, updateInteraction } from './interaction/interactionManager.js';
import { initUIController, getModalState, openModal } from './ui/uiController.js';
import { populateTraditionalView } from './ui/portfolioSections.js';
import { initPhysics, createIslandCollider, createPlayerController, createSpectatorController, setPlayerPosition } from './physics/physics.js';

let scene, camera, renderer, composer, playerData;
let waterMesh;
let waterNormals;
let windowMeshes = [];
let windowLights = [];
let isExploring = false;
let isPaused = false;
let spawnX = -9.998;
let spawnZ = -7.110;
let spawnY = 20;

const clock = new THREE.Clock();

async function init() {
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
    setupLighting(scene);
    setupClouds(scene); // Spawn our low-poly procedural clouds!
    setupBirds(scene);  // Spawn the procedural flock of birds!
    setupParticles(scene); // Spawn ambient glowing particles (fireflies)

    // 2. Init Rapier WASM (must await before creating physics objects)
    await initPhysics();
    
    // 3. Load Ocean Textures
    const textureLoader = new THREE.TextureLoader();
    waterNormals = textureLoader.load('./assets/water_normal.jpg');
    waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;
    waterNormals.repeat.set(60, 60); // Tile the ripples so they aren't enormous!

    // 4. Load island GLB
    const gltfLoader = new GLTFLoader();
    gltfLoader.load('./assets/working_portfolio11.glb', async (gltf) => {
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
                        roughness: 0.1, // Back to smooth because local ripples will now diffuse the reflection naturally!
                        metalness: 0.6, // Excellent reflection multiplier
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
                            
                            if (!isNear && windowLights.length < 20) { 
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

        // Centre island at world origin, sit base on Y=0
        const box    = new THREE.Box3().setFromObject(island);
        const center = new THREE.Vector3();
        box.getCenter(center);
        island.position.x = -center.x;
        island.position.z = -center.z;
        island.position.y = -box.min.y;

        // Apply the transform so matrixWorld is correct before trimesh extraction
        island.updateMatrixWorld(true);

        scene.add(island);

        const size = new THREE.Vector3();
        box.getSize(size);
        console.log(`Island loaded! Size: ${size.x.toFixed(1)}m × ${size.y.toFixed(1)}m × ${size.z.toFixed(1)}m`);

        // Build Rapier trimesh collider from all island meshes
        createIslandCollider(island);

        // Spawn player above the provided coordinates so they fall onto the surface
        spawnY = box.max.y + 2; // Drop gently from just above the tallest obstacle
        
        createPlayerController(spawnX, spawnY, spawnZ);
        createSpectatorController(spawnX, spawnY, spawnZ);

        // Load 3D model and create state object
        playerData = createCharacter(scene);
        setupControls(camera, renderer);

        // UI & Interaction Setup
        const interactables = {};
        
        // Link the Market Stall to the "Projects" interaction
        const stall = island.getObjectByName('stall2002_0');
        if (stall) {
            interactables['arcade'] = stall;
        } else {
            console.warn("⚠️ Interaction Setup: Could not find object named 'stall2002_0' in the island!");
        }

        setupInteraction(interactables);

    }, undefined, (error) => {
        console.error('Error loading island GLB:', error);
    });

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

    // 6. Show start screen
    setTimeout(() => {
        document.getElementById('loading-screen').classList.remove('visible');
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('start-screen').classList.remove('hidden');
        document.getElementById('start-screen').classList.add('visible');
    }, 500);

    animate();
}

function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1); 

    // Only update gameplay loops if not paused and completely exploring
    if (playerData && isExploring && !isPaused && !getModalState()) {
        updateMovement(playerData, camera, delta);
        updateInteraction(playerData.mesh.position);
        
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
        nightStrength = 1.0;       // Full night
    } else if (time > 18 && time < 19) {
        nightStrength = time - 18; // Fade in during dusk
    } else if (time > 5 && time < 6) {
        nightStrength = 1.0 - (time - 5); // Fade out during dawn
    }
    
    if (windowMeshes && windowMeshes.length > 0) {
        for (let w of windowMeshes) {
            if (w.material) {
                w.material.emissiveIntensity = nightStrength * 3.5; // High multiplier pierces the 0.85 HDR Bloom Threshold!
            }
        }
    }
    if (windowLights && windowLights.length > 0) {
        for (let light of windowLights) {
            light.intensity = nightStrength * 150.0; // Soft warm fill light simulating local ambient lanterns
        }
    }

    // Always update visual elements so they drift gently even if paused or on menus
    updateClouds(delta);
    updateBirds(delta); // Flap and steer procedural birds
    updateParticles(delta); // Animate fireflies
    updateLighting(delta); // Advance the Day/Night cycle smooth transition

    composer.render();
}

document.addEventListener('DOMContentLoaded', init);
