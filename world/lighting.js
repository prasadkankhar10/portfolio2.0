import * as THREE from 'three';

let ambientLight, hemiLight, sunLight, sunMesh, moonMesh;
let globalScene;

// Day/Night State
let timeOfDay = Math.random() * 24; // Start at a completely random time
const DAY_DURETION_SECS = 600; // 1 full day takes 10 minutes (very slow and relaxing)
const TIME_SCALE = 24 / DAY_DURETION_SECS; // How many game hours pass per real second

export function setupLighting(scene) {
    globalScene = scene;
    // Ambient light - base fill
    ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);

    // Hemisphere light - Sky bounce
    hemiLight = new THREE.HemisphereLight(0xffc87a, 0x5a5a8a, 1.5);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    // Directional light (Sun/Moon)
    sunLight = new THREE.DirectionalLight(0xffd1a4, 3.5); 
    sunLight.position.set(80, 40, -50); 
    sunLight.castShadow = true;

    // Optimize shadow map
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 300;
    
    // Shadow camera frustum (cover the island)
    const d = 80;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;

    // Fix shadow acne
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.02;

    scene.add(sunLight);

    // Visual Sun Sphere
    const sunGeometry = new THREE.SphereGeometry(20, 32, 32);
    const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xfff3cd });
    sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
    scene.add(sunMesh);

    // Visual Moon (Half-Sphere for Half-Moon effect)
    const moonGeometry = new THREE.SphereGeometry(15, 32, 32, 0, Math.PI);
    const moonMaterial = new THREE.MeshBasicMaterial({ color: 0xc9d2e0, side: THREE.DoubleSide });
    moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
    scene.add(moonMesh);

    // Force an initial update to set 8 AM colors exactly
    updateLighting(0);
}

export function getTimeOfDay() {
    return timeOfDay;
}

const skyColors = {
    night: new THREE.Color(0x0a0f1d),
    dawn:  new THREE.Color(0x28385e),   // Richer deep navy blue
    day:   new THREE.Color(0x5078b5),   // Brighter aesthetic blue (day sky)
    dusk:  new THREE.Color(0x28385e)    // Richer deep navy blue
};

const sunColors = {
    moon:  new THREE.Color(0x6a7d9b),   // Silvery blue 
    dawn:  new THREE.Color(0xff9e43),   // Intense golden/orange sunrise
    day:   new THREE.Color(0xffca8a),   // Very warm golden daylight
    dusk:  new THREE.Color(0xff9e43)    // Intense golden/orange sunset
};

export function updateLighting(delta) {
    if (!sunLight || !globalScene) return;

    // Advance time
    timeOfDay += delta * TIME_SCALE;
    if (timeOfDay >= 24) timeOfDay -= 24;

    // Map 24-hours to 0-1 phase (where day starts at 6 and ends at 18)
    const isDay = timeOfDay > 5 && timeOfDay < 19;
    
    // Smooth Sine wave for sun height (-1 at mid-night, 1 at mid-day)
    // 12 noon = Math.PI / 2
    const timeAngle = ((timeOfDay - 6) / 24) * Math.PI * 2; 
    
    const elevation = Math.sin(timeAngle);
    const azimuth = Math.cos(timeAngle);
    
    // Position Sun & Moon Meshes
    const sunDir = new THREE.Vector3(azimuth * 100, elevation * 80, azimuth * 40).normalize();
    const moonDir = new THREE.Vector3(-azimuth * 100, -elevation * 80, -azimuth * 40).normalize(); // Moon is pure opposite
    
    sunMesh.position.copy(sunDir.clone().multiplyScalar(350));
    
    moonMesh.position.copy(moonDir.clone().multiplyScalar(350));
    moonMesh.lookAt(0, 0, 0); // Aim at the island
    moonMesh.rotateY(Math.PI / 2); // Rotate 90 degrees so we see exactly half the sphere visually!
    
    // The main shadow-casting directional light swaps to following the Moon at night
    // so shadows always cast downwards from the active celestial body
    if (elevation >= 0) {
        sunLight.position.copy(sunDir.clone().multiplyScalar(100));
    } else {
        sunLight.position.copy(moonDir.clone().multiplyScalar(100));
    }

    // Determine current phase for interpolation
    let progress = 0;
    let skyStart, skyEnd, sunStart, sunEnd;
    let targetIntensity = 0;
    let targetAmbient = 0;

    // Ensure ambient light is bright enough to see the flat shaded low-poly sides
    if (timeOfDay >= 5 && timeOfDay < 8) {
        // Dawn (5 to 8)
        progress = (timeOfDay - 5) / 3;
        skyStart = skyColors.night; skyEnd = skyColors.dawn;
        sunStart = sunColors.moon;  sunEnd = sunColors.dawn;
        targetIntensity = THREE.MathUtils.lerp(1.5, 5.0, progress); 
        targetAmbient = THREE.MathUtils.lerp(0.5, 0.8, progress);
    } else if (timeOfDay >= 8 && timeOfDay < 17) {
        // Day (8 to 17)
        progress = (timeOfDay - 8) / 9;
        skyStart = skyColors.dawn; skyEnd = skyColors.day;
        sunStart = sunColors.dawn; sunEnd = sunColors.day;
        targetIntensity = THREE.MathUtils.lerp(5.0, 6.0, Math.sin(progress * Math.PI)); 
        targetAmbient = 0.9; // Brighter daytime ambient
    } else if (timeOfDay >= 17 && timeOfDay < 20) {
        // Dusk (17 to 20)
        progress = (timeOfDay - 17) / 3;
        skyStart = skyColors.day; skyEnd = skyColors.dusk;
        sunStart = sunColors.day; sunEnd = sunColors.dusk;
        targetIntensity = THREE.MathUtils.lerp(5.0, 2.0, progress);
        targetAmbient = THREE.MathUtils.lerp(0.9, 0.5, progress);
    } else {
        // Night Transition (20 to 5)
        let nTime = timeOfDay >= 20 ? timeOfDay - 20 : timeOfDay + 4;
        progress = nTime / 9;
        
        // Smoothly fade from dusk to true night over the first half
        if (progress < 0.5) {
            skyStart = skyColors.dusk; skyEnd = skyColors.night;
            sunStart = sunColors.dusk; sunEnd = sunColors.moon;
            progress = progress * 2.0; 
        } else {
            skyStart = skyColors.night; skyEnd = skyColors.night;
            sunStart = sunColors.moon;  sunEnd = sunColors.moon;
            progress = 1;
        }
        targetIntensity = 1.5; 
        targetAmbient = 0.4;  // Lower night ambient than daytime ambient 
    }

    // Apply Lerped Colors
    globalScene.background = new THREE.Color().copy(skyStart).lerp(skyEnd, progress);
    sunLight.color.copy(sunStart).lerp(sunEnd, progress);
    sunMesh.material.color.copy(sunLight.color); // Sun visually changes color

    // Apply Lerped Intensities
    sunLight.intensity = targetIntensity;
    ambientLight.intensity = targetAmbient;
    hemiLight.intensity = targetAmbient + 0.1; // Hemisphere provides just a tiny bit of sky bounce so shadows aren't pitch black
}
