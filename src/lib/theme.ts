export const THEME_COOKIE = "ward_theme";
export type Theme = "system" | "light" | "dark";

/**
 * Runs before first paint so a chosen light/dark theme doesn't flash.
 * Kept as a constant so the CSP can allow it by hash.
 */
export const THEME_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark)/);if(m)document.documentElement.setAttribute("data-theme",m[1]);}catch(e){}})();`;
