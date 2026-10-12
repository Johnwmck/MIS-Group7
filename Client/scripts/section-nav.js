// Section bar shared by the Admin and Employee portals. Load after Bootstrap.
// The URL hash names the open section, so a refresh or reset returns to it.

(function () {
    const sectionNav = document.querySelector('.section-pills');
    if (!sectionNav) return;

    function showSectionFromHash() {
        const target = window.location.hash + 'Section';
        const tabButton = Array.from(sectionNav.querySelectorAll('.nav-link')).find(function (button) {
            return button.dataset.bsTarget === target;
        });

        if (tabButton) {
            bootstrap.Tab.getOrCreateInstance(tabButton).show();
        }
    }

    sectionNav.addEventListener('shown.bs.tab', function (event) {
        history.replaceState(null, '', event.target.dataset.bsTarget.replace('Section', ''));
    });

    window.addEventListener('hashchange', showSectionFromHash);
    showSectionFromHash();
})();
