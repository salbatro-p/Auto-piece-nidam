function language(locale){document.documentElement.lang=locale;document.documentElement.dir=locale==='ar'?'rtl':'ltr';document.querySelectorAll('[data-content]').forEach(node=>node.hidden=node.dataset.content!==locale);document.querySelectorAll('[data-locale]').forEach(node=>node.setAttribute('aria-pressed',String(node.dataset.locale===locale)));}
document.querySelectorAll('[data-locale]').forEach(node=>node.addEventListener('click',()=>language(node.dataset.locale)));
const detected=navigator.language.split('-')[0];language(['ar','fr','en'].includes(detected)?detected:'fr');
