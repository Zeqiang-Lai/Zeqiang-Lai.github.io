// Theme: apply saved preference immediately to prevent flash
(function() {
    var saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
})();

// Subtle fade-in for elements on scroll
document.addEventListener('DOMContentLoaded', function() {
    // Theme toggle
    var toggle = document.querySelector('.theme-toggle');
    if (toggle) {
        var current = document.documentElement.getAttribute('data-theme') || 'dark';
        toggle.textContent = current === 'dark' ? '☀' : '☾';

        toggle.addEventListener('click', function() {
            var theme = document.documentElement.getAttribute('data-theme');
            var next = theme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
            toggle.textContent = next === 'dark' ? '☀' : '☾';
        });
    }

    // Fade-in observer
    const elements = document.querySelectorAll('.sidebar, .pub-item, .misc, .section-header');
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });

    elements.forEach(function(el) {
        el.classList.add('fade-in');
        observer.observe(el);
    });
});
