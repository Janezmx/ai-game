/**
 * Mock for react-native-gesture-handler
 * 在 Web 环境下提供一个简单的 div wrapper
 */

import React from "react";

export const GestureHandlerRootView = ({ style, children, ...props }: any) => {
  const mergedStyle = Array.isArray(style)
    ? { width: "100%", height: "100%", ...Object.assign({}, ...style) }
    : { width: "100%", height: "100%", ...style };
  return React.createElement("div", {
    style: mergedStyle,
    ...props,
  }, children);
};

export const PanGestureHandler = ({ children, onGestureEvent, onHandlerStateChange, ...props }: any) => {
  return React.createElement("div", {
    ...props,
    onMouseDown: (e: any) => {
      if (onGestureEvent) {
        onGestureEvent({
          nativeEvent: {
            translationX: 0,
            translationY: 0,
            absoluteX: e.clientX,
            absoluteY: e.clientY,
            velocityX: 0,
            velocityY: 0,
            state: 4, // ACTIVE
          },
        });
      }
    },
    onMouseUp: (e: any) => {
      if (onHandlerStateChange) {
        onHandlerStateChange({
          nativeEvent: {
            state: 5, // END
          },
        });
      }
    },
  }, children);
};

export const State = {
  UNDETERMINED: 0,
  FAILED: 1,
  BEGAN: 2,
  CANCELLED: 3,
  ACTIVE: 4,
  END: 5,
};

export const TapGestureHandler = ({ children, ...props }: any) => React.createElement("div", props, children);
export const PinchGestureHandler = ({ children, ...props }: any) => React.createElement("div", props, children);
export const RotationGestureHandler = ({ children, ...props }: any) => React.createElement("div", props, children);

export default {
  GestureHandlerRootView,
  PanGestureHandler,
  TapGestureHandler,
  PinchGestureHandler,
  RotationGestureHandler,
  State,
};