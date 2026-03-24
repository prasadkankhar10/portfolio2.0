import { sectionsData } from './portfolioSections.js';

export function setupUI() {
    const modal = document.getElementById('content-modal');
    const closeBtn = document.getElementById('close-modal-btn');

    closeBtn.addEventListener('click', () => {
        closeModal();
    });

    // Close on escape
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('visible')) {
            closeModal();
        }
    });
}

export function openModal(sectionId) {
    const modal = document.getElementById('content-modal');
    const modalBody = document.getElementById('modal-body');
    const data = sectionsData[sectionId];

    if (!data) return;

    modalBody.innerHTML = `
        <h2 style="color: ${data.color}">${data.title}</h2>
        <p class="subtitle">${data.subtitle}</p>
        <div class="modal-content-area">
            ${data.content}
        </div>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('visible');
}

export function closeModal() {
    const modal = document.getElementById('content-modal');
    modal.classList.remove('visible');
    modal.classList.add('hidden');
    
    // Automatically re-lock pointer when going back to the game
    document.body.requestPointerLock();
}
