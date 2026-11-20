export const toast = (message, type = 'info') =>
  window.dispatchEvent(new CustomEvent('pl:toast', { detail: { message, type, id: Math.random().toString(36).slice(2) } }))
