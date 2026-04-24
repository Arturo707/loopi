// Native: real ViewShot
export { default as ViewShot } from 'react-native-view-shot';

export async function captureCard(ref) {
  if (!ref?.current) return null;
  return ref.current.capture();
}
