// Web stub — ViewShot has no browser implementation
import React from 'react';
import { View } from 'react-native';

export const ViewShot = React.forwardRef(function ViewShot({ style, children }, _ref) {
  return <View style={style}>{children}</View>;
});

export async function captureCard(_ref) {
  return null; // image capture not available on web
}
