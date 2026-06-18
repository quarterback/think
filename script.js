const year = document.querySelector('#year');
const projectCount = document.querySelector('#project-count');
const projects = document.querySelectorAll('.project-list li');

year.textContent = new Date().getFullYear();
projectCount.textContent = `${projects.length} works listed`;
