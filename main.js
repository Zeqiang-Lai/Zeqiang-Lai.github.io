// Restore the saved theme before first paint, then wire up page controls.
(function () {
    var theme = 'light';
    try {
        var saved = localStorage.getItem('theme');
        if (saved === 'light' || saved === 'dark') theme = saved;
    } catch (_) {}

    function applyTheme(next) {
        theme = next;
        document.documentElement.setAttribute('data-theme', theme);
        var isDark = theme === 'dark';
        document.querySelectorAll('.theme-toggle').forEach(function (button) {
            button.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
            button.title = button.getAttribute('aria-label');
        });
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = isDark ? '#111111' : '#ffffff';
    }

    applyTheme(theme);
    function initializeControls() {
        applyTheme(theme);
        document.querySelectorAll('.theme-toggle').forEach(function (button) {
            button.addEventListener('click', function () {
                applyTheme(theme === 'dark' ? 'light' : 'dark');
                try { localStorage.setItem('theme', theme); } catch (_) {}
            });
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeControls, { once: true });
    } else {
        initializeControls();
    }
    window.addEventListener('storage', function (event) {
        if (event.key === 'theme') applyTheme(event.newValue === 'dark' ? 'dark' : 'light');
    });
})();
