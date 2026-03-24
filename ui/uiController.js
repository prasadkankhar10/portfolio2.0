import { sectionsData } from './portfolioSections.js';

// Central State
let isModalOpen = false;
let isPromptVisible = false;

// DOM Elements
let promptLayer;
let promptText;
let modalLayer;
let modal;
let modalBody;
let closeBtn;

export function initUIController(onModalCloseCallback) {
    // Bind Modals DOM
    promptLayer = document.getElementById('interaction-prompt');
    promptText = document.getElementById('prompt-text');
    modalLayer = document.getElementById('modal-layer');
    modal = document.getElementById('content-modal');
    modalBody = document.getElementById('modal-body');
    closeBtn = document.getElementById('close-modal-btn');

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeModal(onModalCloseCallback);
        });
    }

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isModalOpen) {
            closeModal(onModalCloseCallback);
        }
    });
}

export function showPrompt(text) {
    if (isModalOpen || !promptLayer) return; // Prevent prompt when reading scroll
    
    promptText.textContent = text;
    promptLayer.classList.remove('hidden');
    promptLayer.classList.add('visible');
    isPromptVisible = true;
}

export function hidePrompt() {
    if (!promptLayer) return;
    promptLayer.classList.remove('visible');
    promptLayer.classList.add('hidden');
    isPromptVisible = false;
}

export function getPromptState() {
    return isPromptVisible;
}

export function getModalState() {
    return isModalOpen;
}

export function openModal(id, rawHTML = null) {
    if (rawHTML) {
        isModalOpen = true;
        hidePrompt(); // Hide prompt immediately
        modalBody.innerHTML = rawHTML;
        if (modal) modal.classList.remove('hidden');
        return;
    }

    const data = sectionsData[id];
    if (!data || !modal) return;

    isModalOpen = true;
    hidePrompt(); // Hide prompt immediately

    // Build pure semantic HTML from structured JSON
    modalBody.innerHTML = buildTemplateHTML(data);

    modal.classList.remove('hidden');
}

export function closeModal(callback) {
    if (!modal) return;
    modal.classList.add('hidden');
    isModalOpen = false;
    
    // Automatically attempt re-lock pointer when going back to the 3D exploration
    // Wrap in try-catch and promise-catch because browsers block rapid re-locking
    try {
        const lockPromise = document.body.requestPointerLock();
        if (lockPromise) {
            lockPromise.catch(() => {
                console.log("Pointer lock suppressed by browser (user needs to click screen).");
            });
        }
    } catch (e) {
        // Ignored
    }
    
    if (callback) callback();
}

/**
 * Single dynamic renderer that transforms JSON into the medieval scroll styles
 */
function buildTemplateHTML(data) {
    let html = `
        <h2>${data.title}</h2>
        <h3>${data.subtitle}</h3>
    `;

    if (data.template === 'project') {
        data.items.forEach(item => {
            let tags = item.techStack.map(t => `<span class="rpg-tag">${t}</span>`).join('');
            let links = item.links.map(l => `<button class="rpg-btn" style="padding: 0.5rem 1rem; font-size: 0.9rem;" onclick="window.open('${l.url}', '_blank')">${l.label}</button>`).join('');
            
            html += `
            <div class="rpg-project-card">
                <h4 style="font-size: 1.2rem; color: #8b5a2b; margin-bottom: 0.5rem;">${item.title}</h4>
                <p style="margin-bottom: 1rem; line-height: 1.6;">${item.description}</p>
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem;">
                    ${tags}
                </div>
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    ${links}
                </div>
            </div>`;
        });
    } 
    else if (data.template === 'skills') {
        html += `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1.5rem;">`;
        data.items.forEach(cat => {
            html += `
            <div class="rpg-project-card" style="margin-bottom: 0;">
                <h4 style="color: #8b5a2b; margin-bottom: 0.8rem; border-bottom: 1px dashed rgba(139, 90, 43, 0.3); padding-bottom: 0.5rem;">${cat.title}</h4>
                <p style="line-height: 1.6;">${cat.skills.join(', ')}</p>
            </div>`;
        });
        html += `</div>`;
    } 
    else if (data.template === 'library') {
        data.items.forEach(quote => {
            html += `
            <div class="rpg-project-card" style="text-align: center; font-style: italic; font-family: 'Playfair Display', serif; font-size: 1.1rem; padding: 2rem;">
                <p>"${quote}"</p>
            </div>`;
        });
    } 
    else if (data.template === 'contact') {
        let links = data.links.map(l => `<button class="rpg-btn" onclick="window.open('${l.url}', '_blank')">${l.label}</button>`).join('');
        html += `
        <div class="rpg-project-card" style="text-align: center; margin-top: 2rem; padding: 3rem 1.5rem;">
            <p style="margin-bottom: 2rem; font-size: 1.1rem;">Ready to set sail on a new project?</p>
            <div style="display: flex; justify-content: center; gap: 1rem; flex-wrap: wrap;">
                ${links}
            </div>
        </div>`;
    }

    return html;
}
