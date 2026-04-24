// Native: React Native built-in Share — handles file sharing on iOS via `url`
import { Share, Platform } from 'react-native';

export async function shareFile(uri, caption) {
  try {
    if (Platform.OS === 'ios' && uri) {
      // iOS supports file URIs in Share.share via `url`
      await Share.share({ url: uri, message: caption });
    } else {
      // Android: no file support in RN Share, fall back to text
      await Share.share({ message: caption });
    }
    return true;
  } catch {
    return false;
  }
}
