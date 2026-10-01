(function () {
    var page = document.querySelector('.pub-page');
    var items = Array.from(page.querySelectorAll('.pub-item'));
    var filters = page.querySelectorAll('[data-filter]');
    var authorButton = page.querySelector('.author-toggle');
    var authorNote = page.querySelector('#author-note');
    var status = page.querySelector('#publication-status');

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
        button.addEventListener('click', function () { filterPublications(button.dataset.filter); });
    });
    authorButton.addEventListener('click', function () {
        var show = page.classList.toggle('show-authors');
        authorButton.setAttribute('aria-pressed', String(show));
        authorButton.textContent = show ? 'Hide authors' : 'Show authors';
        authorNote.hidden = !show;
    });

    page.classList.add('compact-publications');
    authorNote.hidden = true;
    page.querySelector('.pub-toolbar').hidden = false;
    filterPublications('paper');
})();
