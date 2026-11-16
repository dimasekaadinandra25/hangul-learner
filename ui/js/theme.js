// The color theme: Auto (follows the system) / Light / Dark, and the buttons that switch it.
// The choice is kept per device in localStorage ('theme');
// a tiny script in index.html applies it before the page draws.
// Needs: icons.js (icon). Provides: THEMES, THEME_NAME, getTheme, setTheme, renderTheme.

// ---- Theme: Auto (follows Windows) / Light / Dark. Per device, so Reset progress keeps it. ----
const THEMES = ['auto', 'light', 'dark'];
const THEME_NAME = {auto: 'Auto', light: 'Light', dark: 'Dark'};

// The saved theme ('auto' when none is saved or storage is blocked)
const getTheme = () => {
  try {
    return localStorage.getItem('theme') || 'auto';
  } catch (e) {
    return 'auto';
  }
};

function setTheme(theme) {
  try {
    if (theme === 'auto') localStorage.removeItem('theme');
    else localStorage.setItem('theme', theme);
  } catch (e) {}
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  renderTheme();
}

// Updates the theme buttons: the cycle buttons ([data-theme-btn]) show the current theme and name the next one,
// the Settings choices ([data-set-theme]) mark the current one as pressed.
function renderTheme() {
  const theme = getTheme();
  const next = THEMES[(THEMES.indexOf(theme) + 1) % 3];
  let iconName = 'moon';
  if (theme === 'auto') iconName = 'monitor';
  else if (theme === 'light') iconName = 'sun';
  document.querySelectorAll('[data-theme-btn]').forEach(button => {
    button.innerHTML = icon(iconName);
    button.title = `Theme: ${THEME_NAME[theme]} · click for ${THEME_NAME[next]}`;
    button.setAttribute('aria-label', `Theme: ${THEME_NAME[theme]}. Switch to ${THEME_NAME[next]}`);
  });
  document.querySelectorAll('[data-set-theme]').forEach(button => {
    button.setAttribute('aria-pressed', button.dataset.setTheme === theme);
  });
}

// A cycle button moves to the next theme: auto -> light -> dark -> auto
document.querySelectorAll('[data-theme-btn]').forEach(button => {
  button.onclick = () => setTheme(THEMES[(THEMES.indexOf(getTheme()) + 1) % 3]);
});
document.querySelectorAll('[data-set-theme]').forEach(button => {
  button.onclick = () => setTheme(button.dataset.setTheme);
});
