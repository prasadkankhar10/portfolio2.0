export const sectionsData = {
    arcade: {
        template: 'project',
        title: "The Market Board",
        subtitle: "Recent Quests & Projects",
        items: [
            {
                title: "On the Way",
                description: "A mobile delivery game focusing on precise mechanics and urban exploration.",
                techStack: ["Unity", "C#", "Mobile"],
                links: [
                    { label: "GitHub", url: "#" },
                    { label: "Play Demo", url: "#" }
                ]
            },
            {
                title: "Nishtha Habit Tracker",
                description: "A robust productivity app designed to build and maintain daily heroic habits.",
                techStack: ["React Native", "Node.js", "MongoDB"],
                links: [
                    { label: "GitHub", url: "#" }
                ]
            },
            {
                title: "AI Knowledge Assessment Platform",
                description: "An intelligent system for dynamically evaluating student progress via AI.",
                techStack: ["Python", "TensorFlow", "Next.js"],
                links: [
                    { label: "View Project", url: "#" }
                ]
            }
        ]
    },
    lab: {
        template: 'skills',
        title: "The Alchemist's Lab",
        subtitle: "Skills & Spells",
        items: [
            {
                title: "Programming",
                skills: ["JavaScript (ES6+)", "C++", "Python", "HTML5/CSS3"]
            },
            {
                title: "Game Dev",
                skills: ["Unreal Engine 5", "Unity", "Three.js", "Canvas API"]
            },
            {
                title: "Web Dev",
                skills: ["React", "Node.js", "Express", "MongoDB"]
            },
            {
                title: "Emerging Tech",
                skills: ["AI Systems Integration", "Prompt Engineering"]
            }
        ]
    },
    library: {
        template: 'library',
        title: "The Grand Library",
        subtitle: "Creative Writing & Shayari",
        items: [
            "In the lines of code I find my logic, <br>In the lines of poetry I find my soul.",
            "A bug is just a story waiting to be understood."
        ]
    },
    vision: {
        template: 'project', // Resumes project template since it's just a list
        title: "Mountain Peak",
        subtitle: "Future Vision",
        items: [
            {
                title: "Goals & Aspirations",
                description: "Continually explore the boundary between art and creative technology to build spectacular experiences.",
                techStack: ["Impactful AI Tools", "Indie Game Narrative", "Creative Coding"],
                links: []
            }
        ]
    },
    contact: {
        template: 'contact',
        title: "The Dock",
        subtitle: "Send a Raven",
        links: [
            { label: "GitHub", url: "https://github.com" },
            { label: "LinkedIn", url: "https://linkedin.com" },
            { label: "Email Me", url: "mailto:hello@example.com" },
            { label: "Download Resume", url: "#" }
        ]
    }
};

// Also export a helper function to populate the traditional view
export function populateTraditionalView() {
    // Safe fallback for old traditional view
    document.getElementById('trad-projects-container').innerHTML = '<p>Revisit inside the 3D world!</p>';
    document.getElementById('trad-skills-container').innerHTML = '<p>Revisit inside the 3D world!</p>';
    document.getElementById('trad-contact-container').innerHTML = '<p>Revisit inside the 3D world!</p>';
}
