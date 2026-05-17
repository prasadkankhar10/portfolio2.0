import { setKeyState, addCameraMovement } from '../character/movement.js';

export function initMobileControls() {
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (!isTouchDevice) return; // Only show on mobile devices

    const container = document.createElement('div');
    container.id = 'mobile-controls';
    container.innerHTML = `
        <div id="joystick-zone">
            <div id="joystick-base">
                <div id="joystick-knob"></div>
            </div>
        </div>
        <div id="look-zone"></div>
        <div id="action-buttons">
            <button id="btn-jump" class="mobile-btn">JUMP</button>
            <button id="btn-sprint" class="mobile-btn">SPRINT</button>
            <button id="btn-crouch" class="mobile-btn">CROUCH</button>
            <button id="btn-interact" class="mobile-btn">INTERACT</button>
        </div>
    `;
    document.body.appendChild(container);

    const style = document.createElement('style');
    style.textContent = `
        #mobile-controls {
            position: fixed;
            inset: 0;
            z-index: 90; /* Below modals, above HUD */
            pointer-events: none; /* Let clicks pass through empty areas */
            touch-action: none; /* Prevent browser scrolling/zooming */
        }
        
        #joystick-zone {
            position: absolute;
            bottom: 2rem;
            left: 2rem;
            width: 150px;
            height: 150px;
            pointer-events: auto;
        }

        #joystick-base {
            position: absolute;
            bottom: 0;
            left: 0;
            width: 120px;
            height: 120px;
            background: rgba(255, 255, 255, 0.1);
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        #joystick-knob {
            width: 50px;
            height: 50px;
            background: rgba(255, 215, 0, 0.6);
            border-radius: 50%;
            pointer-events: none;
            transition: transform 0.1s ease-out;
        }

        #look-zone {
            position: absolute;
            top: 0;
            right: 0;
            width: 50vw;
            height: 100vh;
            pointer-events: auto;
        }

        #action-buttons {
            position: absolute;
            bottom: 2rem;
            right: 2rem;
            display: flex;
            flex-direction: column;
            gap: 1rem;
            align-items: flex-end;
            pointer-events: auto;
        }

        .mobile-btn {
            background: rgba(0, 0, 0, 0.4);
            border: 1px solid rgba(255, 215, 0, 0.5);
            color: #ffd700;
            border-radius: 50%;
            width: 60px;
            height: 60px;
            font-family: 'Space Grotesk', sans-serif;
            font-size: 0.7rem;
            font-weight: bold;
            backdrop-filter: blur(4px);
            user-select: none;
            -webkit-user-select: none;
        }

        .mobile-btn:active {
            background: rgba(255, 215, 0, 0.4);
            transform: scale(0.95);
        }
        
        /* Hide traditional hints on mobile */
        @media (hover: none) and (pointer: coarse) {
            .rpg-project-card p { display: none; }
            .rpg-project-card::after { content: "Use on-screen controls to move."; display: block; padding: 1rem; color: #8b5a2b; font-weight: bold; }
        }
    `;
    document.head.appendChild(style);

    _setupJoystick();
    _setupLookZone();
    _setupButtons();
}

function _setupJoystick() {
    const zone = document.getElementById('joystick-zone');
    const base = document.getElementById('joystick-base');
    const knob = document.getElementById('joystick-knob');
    
    let activeTouchId = null;
    let baseCenter = { x: 0, y: 0 };
    const maxRadius = 60; // Half of base width

    const resetJoystick = () => {
        knob.style.transform = `translate(0px, 0px)`;
        activeTouchId = null;
        setKeyState('w', false);
        setKeyState('s', false);
        setKeyState('a', false);
        setKeyState('d', false);
    };

    zone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (activeTouchId !== null) return;
        const touch = e.changedTouches[0];
        activeTouchId = touch.identifier;
        
        const rect = base.getBoundingClientRect();
        baseCenter = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };
        _handleJoystickMove(touch);
    }, { passive: false });

    zone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === activeTouchId) {
                _handleJoystickMove(e.changedTouches[i]);
                break;
            }
        }
    }, { passive: false });

    const handleEnd = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === activeTouchId) {
                resetJoystick();
                break;
            }
        }
    };

    zone.addEventListener('touchend', handleEnd);
    zone.addEventListener('touchcancel', handleEnd);

    function _handleJoystickMove(touch) {
        let dx = touch.clientX - baseCenter.x;
        let dy = touch.clientY - baseCenter.y;
        
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > maxRadius) {
            dx = (dx / dist) * maxRadius;
            dy = (dy / dist) * maxRadius;
        }

        knob.style.transform = `translate(${dx}px, ${dy}px)`;

        // Deadzone check
        const normalizedX = dx / maxRadius;
        const normalizedY = dy / maxRadius;
        
        const threshold = 0.2;
        setKeyState('d', normalizedX > threshold);
        setKeyState('a', normalizedX < -threshold);
        setKeyState('s', normalizedY > threshold);
        setKeyState('w', normalizedY < -threshold);
    }
}

function _setupLookZone() {
    const zone = document.getElementById('look-zone');
    let activeTouchId = null;
    let lastX = 0;
    let lastY = 0;

    zone.addEventListener('touchstart', (e) => {
        if (activeTouchId !== null) return;
        const touch = e.changedTouches[0];
        activeTouchId = touch.identifier;
        lastX = touch.clientX;
        lastY = touch.clientY;
    });

    zone.addEventListener('touchmove', (e) => {
        e.preventDefault(); // Prevent scroll
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (touch.identifier === activeTouchId) {
                const dx = touch.clientX - lastX;
                const dy = touch.clientY - lastY;
                
                // Adjust sensitivity as needed
                addCameraMovement(dx * 2, dy * 2);
                
                lastX = touch.clientX;
                lastY = touch.clientY;
                break;
            }
        }
    }, { passive: false });

    const handleEnd = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === activeTouchId) {
                activeTouchId = null;
                break;
            }
        }
    };
    zone.addEventListener('touchend', handleEnd);
    zone.addEventListener('touchcancel', handleEnd);
}

function _setupButtons() {
    const setupBtn = (id, key) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        
        // Use touch events for immediate response without 300ms delay
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            setKeyState(key, true);
            
            // For space (jump) we just simulate a quick press
            if (key === 'space') {
                setTimeout(() => setKeyState('space', false), 100);
            }
        });
        
        // For buttons that can be held (sprint, crouch)
        if (key !== 'space') {
            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                setKeyState(key, false);
            });
            btn.addEventListener('touchcancel', (e) => {
                e.preventDefault();
                setKeyState(key, false);
            });
        }
    };

    setupBtn('btn-jump', 'space');
    setupBtn('btn-sprint', 'shift');
    setupBtn('btn-crouch', 'control');
    
    // Interact is special, it needs to dispatch a keyboard event for 'e' 
    // because interactionManager listens to window keydown
    const interactBtn = document.getElementById('btn-interact');
    if (interactBtn) {
        interactBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', code: 'KeyE' }));
        });
    }
}
