import * as THREE from 'three';

let ambientLight, hemiLight, sunLight, moonLight, rimLight, sunMesh, moonMesh;
let villageGlowLight;
let globalScene, globalRenderer;
let fog;

// Day/Night State
let timeOfDay = Math.random() * 24;
const DAY_DURETION_SECS = 600;
const TIME_SCALE = 24 / DAY_DURETION_SECS;

// Richer 4-phase sky palette
const skyColors = {
    night:   new THREE.Color(0x060a12),  // Very deep midnight navy
    dawn:    new THREE.Color(0x1a2545),  // Dark violet-blue before sunrise
    sunrise: new THREE.Color(0x6b3a6e),  // Deep pink-purple at horizon
    day:     new THREE.Color(0x4a80c4),  // Vibrant sky blue
    dusk:    new THREE.Color(0xb04a1a),  // Fiery deep orange at sunset
};

// Distinct sun colors per phase
const sunColors = {
    moon:    new THREE.Color(0x3a5580),  // Cold deep blue moonlight
    dawn:    new THREE.Color(0xff6a22),  // Intense orange sunrise
    day:     new THREE.Color(0xfff0b0),  // Warm near-white daylight
    dusk:    new THREE.Color(0xff4510),  // Blazing sunset red-orange
};

export function setupLighting(scene, renderer) {
    globalScene = scene;
    globalRenderer = renderer;

    // ── Base Fill ────────────────────────────────────────────────────────────
    ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);

    // ── Hemisphere (sky bounce) ───────────────────────────────────────────────
    hemiLight = new THREE.HemisphereLight(0xffc87a, 0x2a2a5a, 1.5);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    // ── Sun / Primary DirectionalLight ───────────────────────────────────────
    sunLight = new THREE.DirectionalLight(0xffd1a4, 3.5);
    sunLight.position.set(80, 40, -50);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width  = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far  = 300;
    const d = 80;
    sunLight.shadow.camera.left   = -d;
    sunLight.shadow.camera.right  =  d;
    sunLight.shadow.camera.top    =  d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias       = -0.001;     // Pushes shadow deeper
    sunLight.shadow.normalBias =  0.08;      // Fixes low-poly terrain acne
    scene.add(sunLight);
    window._dirLight = sunLight; // exposed for shadow flicker in main.js

    // ── Dedicated Moonlight (cool blue, no shadows for perf) ─────────────────
    moonLight = new THREE.DirectionalLight(0x3a5aaa, 0.0); // Starts at 0, fades in at night
    moonLight.position.set(-80, 40, 50);
    scene.add(moonLight);

    // ── Rim Light (always-on backlight outline fill) ──────────────────────────
    rimLight = new THREE.DirectionalLight(0xffaa44, 0.4);
    rimLight.position.set(-60, 20, 80); // Opposite side from sun
    scene.add(rimLight);

    // ── Village Light Pollution glow (night only) ─────────────────────────────
    villageGlowLight = new THREE.PointLight(0xff6600, 0.0, 120, 1.5);
    villageGlowLight.position.set(0, 30, 0); // Floats high above village center
    scene.add(villageGlowLight);

    // ── Visual Sun Sphere ─────────────────────────────────────────────────────
    const sunGeometry = new THREE.SphereGeometry(20, 32, 32);
    const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xfff3cd });
    sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
    scene.add(sunMesh);

    // ── Visual Moon ───────────────────────────────────────────────────────────
    const moonGeometry = new THREE.SphereGeometry(15, 32, 32, 0, Math.PI);
    const moonMaterial = new THREE.MeshBasicMaterial({ color: 0xc9d2e0, side: THREE.DoubleSide });
    moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
    scene.add(moonMesh);

    // ── Atmospheric Fog ───────────────────────────────────────────────────────
    // Exponential fog fades the horizon naturally. Density will shift with time of day.
    fog = new THREE.FogExp2(skyColors.day.getHex(), 0.006);
    scene.fog = fog;

    updateLighting(0);
}

export function getTimeOfDay() {
    return timeOfDay;
}

export function updateLighting(delta) {
    if (!sunLight || !globalScene) return;

    // Advance time
    timeOfDay += delta * TIME_SCALE;
    if (timeOfDay >= 24) timeOfDay -= 24;

    const timeAngle = ((timeOfDay - 6) / 24) * Math.PI * 2;
    const elevation = Math.sin(timeAngle);
    const azimuth   = Math.cos(timeAngle);

    // ── Sun & Moon Positions ──────────────────────────────────────────────────
    const sunDir  = new THREE.Vector3( azimuth * 100,  elevation * 80,  azimuth * 40).normalize();
    const moonDir = new THREE.Vector3(-azimuth * 100, -elevation * 80, -azimuth * 40).normalize();

    sunMesh.position.copy(sunDir.clone().multiplyScalar(350));
    moonMesh.position.copy(moonDir.clone().multiplyScalar(350));
    moonMesh.lookAt(0, 0, 0);
    moonMesh.rotateY(Math.PI / 2);

    // Primary directional follows whichever body is above horizon
    if (elevation >= 0) {
        sunLight.position.copy(sunDir.clone().multiplyScalar(100));
    } else {
        sunLight.position.copy(moonDir.clone().multiplyScalar(100));
    }
    // Dedicated moonlight always tracks moon position
    moonLight.position.copy(moonDir.clone().multiplyScalar(100));

    // ── Phase Blending ────────────────────────────────────────────────────────
    let progress = 0;
    let skyStart, skyEnd, sunStart, sunEnd;
    let targetSunIntensity = 0, targetMoonIntensity = 0;
    let targetAmbient = 0;
    let targetFogDensity = 0.006;
    let targetToneExposure = 1.0;
    let targetVillageGlow = 0;

    if (timeOfDay >= 5 && timeOfDay < 7) {
        // ── Dawn / Sunrise (5→7) ──
        progress = (timeOfDay - 5) / 2;
        skyStart = skyColors.dawn; skyEnd = skyColors.sunrise;
        sunStart = sunColors.moon; sunEnd = sunColors.dawn;
        targetSunIntensity  = THREE.MathUtils.lerp(1.0, 4.0, progress);
        targetMoonIntensity = THREE.MathUtils.lerp(0.8, 0.0, progress);
        targetAmbient       = THREE.MathUtils.lerp(0.3, 0.7, progress);
        targetFogDensity    = THREE.MathUtils.lerp(0.012, 0.007, progress);
        targetToneExposure  = THREE.MathUtils.lerp(0.7, 1.1, progress);
        targetVillageGlow   = THREE.MathUtils.lerp(0.4, 0.0, progress);
    } else if (timeOfDay >= 7 && timeOfDay < 9) {
        // ── Morning transition (7→9) ──
        progress = (timeOfDay - 7) / 2;
        skyStart = skyColors.sunrise; skyEnd = skyColors.day;
        sunStart = sunColors.dawn;    sunEnd = sunColors.day;
        targetSunIntensity  = THREE.MathUtils.lerp(4.0, 6.0, progress);
        targetMoonIntensity = 0;
        targetAmbient       = THREE.MathUtils.lerp(0.7, 1.0, progress);
        targetFogDensity    = THREE.MathUtils.lerp(0.007, 0.005, progress);
        targetToneExposure  = THREE.MathUtils.lerp(1.1, 1.3, progress);
        targetVillageGlow   = 0;
    } else if (timeOfDay >= 9 && timeOfDay < 16) {
        // ── Full Day (9→16) ──
        progress = (timeOfDay - 9) / 7;
        skyStart = skyColors.day; skyEnd = skyColors.day;
        sunStart = sunColors.day; sunEnd = sunColors.day;
        targetSunIntensity  = 6.0 - Math.sin(progress * Math.PI) * 0.5;
        targetMoonIntensity = 0;
        targetAmbient       = 1.0;
        targetFogDensity    = 0.004; // Clearest during midday
        targetToneExposure  = 1.3;
        targetVillageGlow   = 0;
    } else if (timeOfDay >= 16 && timeOfDay < 18) {
        // ── Dusk (16→18) ──
        progress = (timeOfDay - 16) / 2;
        skyStart = skyColors.day;  skyEnd = skyColors.dusk;
        sunStart = sunColors.day;  sunEnd = sunColors.dusk;
        targetSunIntensity  = THREE.MathUtils.lerp(5.5, 2.5, progress);
        targetMoonIntensity = THREE.MathUtils.lerp(0.0, 0.3, progress);
        targetAmbient       = THREE.MathUtils.lerp(1.0, 0.5, progress);
        targetFogDensity    = THREE.MathUtils.lerp(0.005, 0.009, progress);
        targetToneExposure  = THREE.MathUtils.lerp(1.3, 0.9, progress);
        targetVillageGlow   = THREE.MathUtils.lerp(0.0, 0.3, progress);
    } else if (timeOfDay >= 18 && timeOfDay < 20) {
        // ── Evening (18→20) ──
        progress = (timeOfDay - 18) / 2;
        skyStart = skyColors.dusk;  skyEnd = skyColors.night;
        sunStart = sunColors.dusk;  sunEnd = sunColors.moon;
        targetSunIntensity  = THREE.MathUtils.lerp(2.5, 1.0, progress);
        targetMoonIntensity = THREE.MathUtils.lerp(0.3, 0.9, progress);
        targetAmbient       = THREE.MathUtils.lerp(0.5, 0.3, progress);
        targetFogDensity    = THREE.MathUtils.lerp(0.009, 0.014, progress);
        targetToneExposure  = THREE.MathUtils.lerp(0.9, 0.7, progress);
        targetVillageGlow   = THREE.MathUtils.lerp(0.3, 0.9, progress);
    } else {
        // ── Full Night (20→5) ──
        skyStart = skyColors.night; skyEnd = skyColors.night;
        sunStart = sunColors.moon;  sunEnd = sunColors.moon;
        targetSunIntensity  = 1.0;
        targetMoonIntensity = 1.0; // Full moonlight in the dead of night
        targetAmbient       = 0.25; // Much darker — only the moon fills shadows
        targetFogDensity    = 0.015; // Thick night mist
        targetToneExposure  = 0.65; // Underexpose — the world should feel dark
        targetVillageGlow   = 1.0;  // Full village lantern pollution at night
        progress = 1;
    }

    // ── Apply Blended Sky / Sun Color ────────────────────────────────────────
    const skyColor = new THREE.Color().copy(skyStart).lerp(skyEnd, progress);
    globalScene.background = skyColor;
    sunLight.color.copy(sunStart).lerp(sunEnd, progress);
    sunMesh.material.color.copy(sunLight.color);

    // ── Apply Moonlight Color (always cool blue) ──────────────────────────────
    moonLight.color.set(0x4466cc);
    moonLight.intensity = targetMoonIntensity;

    // ── Apply Intensities ─────────────────────────────────────────────────────
    sunLight.intensity   = targetSunIntensity;
    ambientLight.intensity = targetAmbient;

    // Ambient color shifts toward deep blue at night (star-light ambient)
    const nightBlue = new THREE.Color(0x080d1e);
    const dayWhite  = new THREE.Color(0xffffff);
    const nightFrac = Math.max(0, 1 - targetAmbient / 1.0);
    ambientLight.color.copy(dayWhite).lerp(nightBlue, nightFrac * 0.6);

    hemiLight.intensity = targetAmbient + 0.1;

    // ── Village Light Pollution ───────────────────────────────────────────────
    villageGlowLight.intensity = targetVillageGlow * 80;

    // ── Fog — matches sky horizon color + density varies by time ─────────────
    if (globalScene.fog) {
        globalScene.fog.color.copy(skyColor);
        globalScene.fog.density += (targetFogDensity - globalScene.fog.density) * 0.02;
    }

    // ── HDR Tone Mapping Exposure ─────────────────────────────────────────────
    if (globalRenderer) {
        globalRenderer.toneMappingExposure += (targetToneExposure - globalRenderer.toneMappingExposure) * 0.02;
    }

    // ── Rim Light — tracks opposite the sun for backlight pop ────────────────
    if (rimLight) {
        const rimStrength = Math.max(0.1, elevation + 0.2) * 0.5;
        rimLight.intensity = rimStrength;
        rimLight.color.copy(sunLight.color).lerp(new THREE.Color(0x4466cc), nightFrac);
    }
}
