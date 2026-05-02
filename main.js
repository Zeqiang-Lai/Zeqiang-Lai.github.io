// Subtle fade-in for elements on scroll
document.addEventListener('DOMContentLoaded', function() {
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
