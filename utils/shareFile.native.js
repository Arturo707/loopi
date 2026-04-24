// Native: expo-sharing
import * as Sharing from 'expo-sharing';

export async function shareFile(uri, caption) {
  const available = await Sharing.isAvailableAsync();
  if (available) {
    await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: caption });
    return true;
  }
  return false;
}
