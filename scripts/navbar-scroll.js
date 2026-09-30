// Shared sticky-navbar scroll behavior: hides the navbar on scroll-down, reveals it on scroll-up.

(function () {
    const navbar = document.querySelector('.site-navbar');
    if (!navbar) return;

    const revealThreshold = 80;
    let lastScrollY = window.scrollY;

    window.addEventListener('scroll', function () {
        const currentScrollY = window.scrollY;

        if (currentScrollY <= revealThreshold || currentScrollY < lastScrollY) {
            navbar.classList.remove('navbar-hidden');
        } else {
            navbar.classList.add('navbar-hidden');
        }

        lastScrollY = currentScrollY;
    }, { passive: true });
})();
