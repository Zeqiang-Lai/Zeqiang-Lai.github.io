// Theme: apply saved preference immediately; default to light
(function() {
    var saved = localStorage.getItem('theme');
    document.documentElement.setAttribute('data-theme', saved || 'light');
})();

// Subtle fade-in for elements on scroll
document.addEventListener('DOMContentLoaded', function() {
    var toggles = document.querySelectorAll('.theme-toggle');
    function updateToggles(theme) {
        toggles.forEach(function(toggle) {
            var isDark = theme === 'dark';
            toggle.textContent = isDark ? '☀' : '☾';
            toggle.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
        });
    }
    var current = document.documentElement.getAttribute('data-theme') || 'dark';
    updateToggles(current);

    toggles.forEach(function(toggle) {
        toggle.addEventListener('click', function() {
            var theme = document.documentElement.getAttribute('data-theme');
            var next = theme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
            updateToggles(next);
        });
    });

    // Fade-in observer
    const elements = document.querySelectorAll('.sidebar, .pub-item, .misc, .section-header, .project-card');
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        elements.forEach(function(el) { el.classList.add('visible'); });
        return;
    }

    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    elements.forEach(function(el) {
        el.classList.add('fade-in');
        observer.observe(el);
    });
});