// Align margin references with their first citation; keep crowded notes apart.
(() => {
    const layout = document.querySelector('.post-layout');
    const references = layout?.querySelector('.post-references');
    const body = layout?.querySelector('.post-body');
    if (!references || !body) return;
    const notes = Array.from(references.querySelectorAll('li'));
    const wide = matchMedia('(min-width: 1080px)');
    let frame;

    function positionNotes() {
        frame = null;
        references.classList.toggle('is-margin-notes', wide.matches);
        notes.forEach(note => { note.style.marginTop = ''; });
        if (!wide.matches) return;
        for (const note of notes) {
            if (!references.contains(note)) continue;
            const link = note.querySelector('.post-reference-backlinks a');
            const citation = link && document.getElementById(decodeURIComponent(link.hash.slice(1)));
            if (!citation) continue;
            const gap = citation.getBoundingClientRect().top - note.getBoundingClientRect().top;
            note.style.marginTop = `${Math.max(0, gap)}px`;
        }
    }

    function schedule() {
        if (frame == null) frame = requestAnimationFrame(positionNotes);
    }
    new ResizeObserver(schedule).observe(body);
    window.addEventListener('resize', schedule);
    window.addEventListener('load', schedule);
    wide.addEventListener('change', schedule);
    document.fonts.ready.then(schedule);
    positionNotes();
})();

// Center wide tables within the page and keep their references directly below them.
(() => {
    const layout = document.querySelector('.post-layout');
    const toc = layout?.querySelector('.post-toc');
    const tables = Array.from(layout?.querySelectorAll('.post-body > .post-table-wide') || []);
    if (!toc || !tables.length) return;
    const desktop = matchMedia('(min-width: 960px)');
    let frame;
    layout.classList.add('has-wide-tables');
    const footnotes = [];
    for (const table of tables) {
        const notes = Array.from(layout.querySelectorAll('.post-references li')).filter(note => {
            const back = note.querySelector('.post-reference-backlinks a');
            const citation = back && document.getElementById(decodeURIComponent(back.hash.slice(1)));
            return citation && table.contains(citation);
        });
        if (!notes.length) continue;
        const details = document.createElement('details');
        details.className = 'post-table-footnotes';
        const summary = document.createElement('summary');
        summary.textContent = document.documentElement.lang === 'en'
            ? `Table references (${notes.length})` : `表格参考文献（${notes.length}）`;
        const list = document.createElement('ol');
        list.setAttribute('role', 'list');
        notes.forEach(note => { note.style.marginTop = ''; list.append(note); });
        details.append(summary, list);
        table.append(details);
        footnotes.push(details);
    }
    function revealReference() {
        let target;
        try { target = document.getElementById(decodeURIComponent(location.hash.slice(1))); }
        catch { return; }
        const details = footnotes.find(item => item.contains(target));
        if (details) {
            details.open = true;
            requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
        }
    }
    window.addEventListener('hashchange', revealReference);
    layout.addEventListener('click', event => {
        const link = event.target.closest('a[href^="#ref:"]');
        if (!link) return;
        const target = document.getElementById(link.hash.slice(1));
        const details = footnotes.find(item => item.contains(target));
        if (details) details.open = true;
    });
    revealReference();

    function update() {
        frame = null;
        const page = layout.getBoundingClientRect();
        const body = layout.querySelector('.post-body').getBoundingClientRect();
        const width = Math.min(800, page.width);
        layout.style.setProperty('--wide-table-width', `${width}px`);
        layout.style.setProperty('--wide-table-offset', `${page.left + (page.width - width) / 2 - body.left}px`);
        const box = toc.getBoundingClientRect();
        const overlapping = desktop.matches && tables.find(table => {
            const rect = table.getBoundingClientRect();
            return rect.top < box.bottom + 24 && rect.bottom > box.top - 24;
        });
        const hidden = Boolean(overlapping);
        if (hidden && toc.contains(document.activeElement)) overlapping.focus({ preventScroll: true });
        toc.classList.toggle('is-table-obscured', hidden);
        toc.inert = hidden;
        if (hidden) toc.setAttribute('aria-hidden', 'true');
        else toc.removeAttribute('aria-hidden');
    }
    function schedule() {
        if (frame == null) frame = requestAnimationFrame(update);
    }
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('hashchange', schedule);
    desktop.addEventListener('change', schedule);
    const resize = new ResizeObserver(schedule);
    resize.observe(toc);
    resize.observe(layout.querySelector('.post-body'));
    document.fonts.ready.then(schedule);
    update();
})();

// Keep the contents marker in step with the section being read.
(() => {
    const toc = document.querySelector('.post-toc');
    if (!toc) return;
    const entries = Array.from(toc.querySelectorAll('a[href^="#"]')).map(link => ({
        link, heading: document.getElementById(decodeURIComponent(link.hash.slice(1)))
    })).filter(entry => entry.heading);
    if (!entries.length) return;
    const marker = document.createElement('span');
    marker.className = 'post-toc-marker';
    marker.setAttribute('aria-hidden', 'true');
    toc.append(marker);
    let active, frame;
    const english = document.documentElement.lang === 'en';
    const groups = Array.from(toc.querySelectorAll('li')).flatMap((item, index) => {
        const list = item.querySelector(':scope > ul');
        if (!list) return [];
        const link = item.querySelector(':scope > a');
        const panel = document.createElement('div');
        panel.className = 'post-toc-children';
        panel.id = `toc:children:${index}`;
        list.before(panel);
        panel.append(list);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'post-toc-toggle';
        button.innerHTML = '<span aria-hidden="true">›</span>';
        button.setAttribute('aria-controls', panel.id);
        item.classList.add('post-toc-group');
        link.after(button);
        const group = { item, link, panel, button };
        button.addEventListener('click', () => {
            setExpanded(group, button.getAttribute('aria-expanded') !== 'true');
            schedule();
        });
        return [group];
    });

    function setExpanded(group, expanded) {
        group.button.setAttribute('aria-expanded', String(expanded));
        group.button.setAttribute('aria-label', english
            ? `${expanded ? 'Collapse' : 'Expand'} subsections for ${group.link.textContent}`
            : `${expanded ? '收起' : '展开'}${group.link.textContent}的子目录`);
        if (!expanded && group.panel.contains(document.activeElement)) group.button.focus();
        group.panel.inert = !expanded;
        group.panel.setAttribute('aria-hidden', String(!expanded));
        group.panel.classList.toggle('is-expanded', expanded);
    }
    groups.forEach(group => setExpanded(group, false));

    function update() {
        frame = null;
        let current;
        for (const entry of entries) {
            if (entry.heading.getBoundingClientRect().top > 120) break;
            current = entry;
        }
        if (window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
            current = entries.at(-1);
        }
        if (active !== current) {
            active?.link.removeAttribute('aria-current');
            current?.link.setAttribute('aria-current', 'location');
            active = current;
            groups.forEach(group => setExpanded(group, Boolean(active && group.item.contains(active.link))));
            if (active && getComputedStyle(toc).position === 'sticky') {
                const box = active.link.getBoundingClientRect();
                const viewport = toc.getBoundingClientRect();
                if (box.top < viewport.top || box.bottom > viewport.bottom) {
                    toc.scrollTop += box.top - viewport.top - toc.clientHeight / 2;
                }
            }
        }
        marker.classList.toggle('is-visible', Boolean(active));
        if (active) {
            let markerLink = active.link;
            for (const group of [...groups].reverse()) {
                if (group.panel.contains(markerLink) && group.panel.inert) markerLink = group.link;
            }
            const box = markerLink.getBoundingClientRect();
            const top = box.top - toc.getBoundingClientRect().top + toc.scrollTop;
            const lineHeight = parseFloat(getComputedStyle(markerLink).lineHeight);
            marker.style.transform = `translateY(${top + 4 + lineHeight / 2 - 2}px)`;
        }
    }
    function schedule() {
        if (frame == null) frame = requestAnimationFrame(update);
    }
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('hashchange', schedule);
    new ResizeObserver(schedule).observe(document.querySelector('.post-body'));
    const tocResize = new ResizeObserver(schedule);
    tocResize.observe(toc);
    document.fonts.ready.then(schedule);
    update();
})();
