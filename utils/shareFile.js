// Web stub — use navigator.share or clipboard
export async function shareFile(_uri, caption) {
  if (typeof navigator !== 'undefined' && navigator.share) {
    await navigator.share({ text: caption });
    return true;
  }
  return false;
}
