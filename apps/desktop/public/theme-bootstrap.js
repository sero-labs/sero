// Apply saved theme before first paint to prevent flash.
(function () {
  var theme = localStorage.getItem('sero:theme');
  if (theme === 'light') {
    document.documentElement.classList.remove('dark');
  }
})();
