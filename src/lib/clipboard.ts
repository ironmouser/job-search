/**
 * Safely copy text to clipboard with fallback.
 * Prevents throwing errors when document is not focused or clipboard permission is missing.
 */
export async function safeCopyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Try Navigator Clipboard API first
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard.writeText failed (e.g. document not focused):', err);
    }
  }

  // 2. Fallback to hidden textarea execCommand('copy')
  if (typeof document !== 'undefined') {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      // Ensure element is off-screen and non-intrusive
      textArea.style.position = 'fixed';
      textArea.style.top = '0';
      textArea.style.left = '-9999px';
      textArea.style.opacity = '0';
      textArea.setAttribute('readonly', '');
      document.body.appendChild(textArea);

      const activeElement = document.activeElement as HTMLElement | null;
      textArea.focus();
      textArea.select();

      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);

      if (activeElement && typeof activeElement.focus === 'function') {
        activeElement.focus();
      }

      if (successful) return true;
    } catch (fallbackErr) {
      console.warn('Fallback document.execCommand copy failed:', fallbackErr);
    }
  }

  return false;
}
