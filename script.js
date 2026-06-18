const navToggle = document.querySelector('.nav-toggle');
const navList = document.querySelector('#site-menu');
const year = document.querySelector('#year');
const revealItems = document.querySelectorAll('[data-reveal]');

year.textContent = new Date().getFullYear();

navToggle.addEventListener('click', () => {
  const isOpen = navToggle.getAttribute('aria-expanded') === 'true';

  navToggle.setAttribute('aria-expanded', String(!isOpen));
  navList.classList.toggle('is-open', !isOpen);
  document.body.classList.toggle('menu-open', !isOpen);
});

navList.addEventListener('click', (event) => {
  if (event.target instanceof HTMLAnchorElement) {
    navToggle.setAttribute('aria-expanded', 'false');
    navList.classList.remove('is-open');
    document.body.classList.remove('menu-open');
  }
});

const reveal = (entries, observer) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  });
};

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(reveal, { threshold: 0.12 });
  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}
