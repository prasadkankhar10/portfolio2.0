/**
 * soundscape.js
 * Fully procedural Web Audio synthesis — zero audio files required.
 * Must be initialised after a user gesture (handled by "Enter World" button).
 */

let audioCtx = null;
let masterGain = null;
let oceanNode = null;
let cricketInterval = null;
let birdInterval = null;
let _isMuted = false;

// ─── Mute Toggle ─────────────────────────────────────────────────────────────
export function toggleMute() {
    if (!audioCtx || !masterGain) return;
    _isMuted = !_isMuted;
    // Smooth ramp over 0.3s so it doesn't click
    masterGain.gain.linearRampToValueAtTime(
        _isMuted ? 0.0 : 0.4,
        audioCtx.currentTime + 0.3
    );
    return _isMuted;
}

export function isMuted() { return _isMuted; }

// ─── Init ────────────────────────────────────────────────────────────────────
export function initSoundscape() {
    if (audioCtx) return; // Already started

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.4;
    masterGain.connect(audioCtx.destination);

    _startOceanWaves();
    _startCrickets();
    _startBirds();
}

// ─── Update (called every frame from main.js) ─────────────────────────────────
export function updateSoundscape(nightStrength) {
    if (!audioCtx) return;

    // Ocean is always present (gentle at day, slightly louder at night)
    if (oceanNode) {
        oceanNode.gain.value = 0.12 + nightStrength * 0.08;
    }
}

// ─── Interaction Chime ───────────────────────────────────────────────────────
export function playChime() {
    if (!audioCtx) return;

    const now = audioCtx.currentTime;

    // C5 pentatonic chord: C5 (523Hz), E5 (659Hz), G5 (784Hz)
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.value = freq;

        gain.gain.setValueAtTime(0, now + i * 0.05);
        gain.gain.linearRampToValueAtTime(0.15, now + i * 0.05 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.6);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(now + i * 0.05);
        osc.stop(now + i * 0.05 + 0.65);
    });
}

// ─── Notification / Toast Sound ────────────────────────────────────────────────
export function playNotification() {
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    
    // Quick two-tone positive bubble chime (E5 -> A5)
    const freqs = [659.25, 880.00]; 
    freqs.forEach((f, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now + i * 0.1); // 0.1s stagger

        gain.gain.setValueAtTime(0, now + i * 0.1);
        gain.gain.linearRampToValueAtTime(0.15, now + i * 0.1 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.4);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now + i * 0.1);
        osc.stop(now + i * 0.1 + 0.45);
    });
}

// ─── Orb Collect Sound ───────────────────────────────────────────────────────
export function playOrbCollect() {
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.3);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.5);
}

// ─── Footstep Sound ──────────────────────────────────────────────────────────
export function playFootstep() {
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    // Short noise burst filtered to mid-freq = grass/dirt crunch
    const bufferSize = Math.floor(audioCtx.sampleRate * 0.06);
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;

    const bandpass = audioCtx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 800 + Math.random() * 300;
    bandpass.Q.value = 0.8;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    source.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(masterGain);
    source.start(now);
}

// ─── Private Generators ───────────────────────────────────────────────────────
function _startOceanWaves() {
    // White noise → lowpass filter → slow LFO tremolo = convincing ocean
    const bufferSize = audioCtx.sampleRate * 4;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const lowpass = audioCtx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 400;

    const gainNode = audioCtx.createGain();
    gainNode.gain.value = 0.12;

    // Slow wave LFO (0.1 Hz gives a ~10 second wave cycle)
    const lfo = audioCtx.createOscillator();
    const lfoGain = audioCtx.createGain();
    lfo.frequency.value = 0.12;
    lfoGain.gain.value = 0.04;
    lfo.connect(lfoGain);
    lfoGain.connect(gainNode.gain);
    lfo.start();

    noise.connect(lowpass);
    lowpass.connect(gainNode);
    gainNode.connect(masterGain);
    noise.start();

    oceanNode = gainNode; // Expose for nightStrength modulation
}

function _startCrickets() {
    // Random chirp bursts: brief high-frequency noise pulses
    function chirp() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.value = 3800 + Math.random() * 400;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.04, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

        osc.connect(g);
        g.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.08);
    }

    // Cluster 3–6 chirps every 1.5–3 seconds
    function scheduleChirpBurst() {
        const count = 3 + Math.floor(Math.random() * 4);
        for (let i = 0; i < count; i++) {
            setTimeout(chirp, i * (60 + Math.random() * 40));
        }
        cricketInterval = setTimeout(scheduleChirpBurst, 1500 + Math.random() * 2000);
    }
    scheduleChirpBurst();
}

function _startBirds() {
    function birdChirp() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();

        osc.type = 'sine';
        const startFreq = 800 + Math.random() * 400;
        osc.frequency.setValueAtTime(startFreq, now);
        osc.frequency.exponentialRampToValueAtTime(startFreq * 1.5, now + 0.15);
        osc.frequency.exponentialRampToValueAtTime(startFreq * 0.8, now + 0.3);

        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.06, now + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(g);
        g.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.4);
    }

    function scheduleBird() {
        birdChirp();
        if (Math.random() > 0.4) setTimeout(birdChirp, 200 + Math.random() * 150);
        birdInterval = setTimeout(scheduleBird, 4000 + Math.random() * 8000);
    }
    setTimeout(scheduleBird, 2000); // Delay first bird call
}
