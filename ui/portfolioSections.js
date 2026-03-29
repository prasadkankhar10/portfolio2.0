export function getSectionsData() {
    // Dynamically retrieve the JSON payloads populated by main.js during initialization
    if (window.portfolioData && window.portfolioData.modals) {
        return window.portfolioData.modals;
    }
    return {};
}

// Also export a helper function to populate the traditional view
export function populateTraditionalView() {
    // Safe fallback for old traditional view
    document.getElementById('trad-projects-container').innerHTML = '<p>Revisit inside the 3D world!</p>';
    document.getElementById('trad-skills-container').innerHTML = '<p>Revisit inside the 3D world!</p>';
    document.getElementById('trad-contact-container').innerHTML = '<p>Revisit inside the 3D world!</p>';
}
