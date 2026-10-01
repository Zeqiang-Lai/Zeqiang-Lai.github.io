(function () {
    var page = document.querySelector('.pub-page');
    var items = Array.from(page.querySelectorAll('.pub-item'));
    var filters = page.querySelectorAll('[data-filter]');
    var authorButton = page.querySelector('.author-toggle');
    var authorNote = page.querySelector('#author-note');
    var status = page.querySelector('#publication-status');
    var preferenceKey = 'publications.preferences';
    var preferences = { type: 'paper', showAuthors: false };

    try {
        var saved = JSON.parse(localStorage.getItem(preferenceKey));
        if (saved && (saved.type === 'paper' || saved.type === 'report')) {
            preferences.type = saved.type;
        }
        if (saved && typeof saved.showAuthors === 'boolean') {
            preferences.showAuthors = saved.showAuthors;
        }
    } catch (_) {}

    function savePreferences() {
        try { localStorage.setItem(preferenceKey, JSON.stringify(preferences)); } catch (_) {}
    }

    function showAuthors(show) {
        page.classList.toggle('show-authors', show);
        authorButton.setAttribute('aria-pressed', String(show));
        authorButton.textContent = show ? 'Hide authors' : 'Show authors';
        authorNote.hidden = !show;
    }

    function filterPublications(type) {
        var count = 0;
        items.forEach(function (item) {
            item.hidden = item.dataset.type !== type;
            if (!item.hidden) count++;
        });
        filters.forEach(function (button) {
            var active = button.dataset.filter === type;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        page.querySelectorAll('.publication-year').forEach(function (group) {
            group.hidden = !Array.from(group.querySelectorAll('.pub-item')).some(function (item) {
                return !item.hidden;
            });
        });
        status.textContent = count + (type === 'paper' ? ' papers' : ' reports');
    }

    filters.forEach(function (button) {
        button.querySelector('.filter-count').textContent = items.filter(function (item) {
            return item.dataset.type === button.dataset.filter;
        }).length;
        button.addEventListener('click', function () {
            preferences.type = button.dataset.filter;
            filterPublications(preferences.type);
            savePreferences();
        });
    });
    authorButton.addEventListener('click', function () {
        preferences.showAuthors = !preferences.showAuthors;
        showAuthors(preferences.showAuthors);
        savePreferences();
    });

    page.classList.add('compact-publications');
    showAuthors(preferences.showAuthors);
    filterPublications(preferences.type);
    page.querySelector('.pub-toolbar').hidden = false;
})();
