/**
 * Mock for react-native-gesture-handler
 * 在 Web 环境下提供一个简单的 div wrapper
 */

import React from "react";

export const GestureHandlerRootView = ({ style, children, ...props }: any) => {
  // pointerEvents 应放在 style 中而非 props
  const { pointerEvents, ...rest } = props;
  const mergedStyle: any = Array.isArray(style)
    ? { width: "100%", height: "100%", ...Object.assign({}, ...style) }
    : { width: "100%", height: "100%", ...style };
  if (pointerEvents) {
    mergedStyle.pointerEvents = pointerEvents;
  }
  return React.createElement("div", {
    style: mergedStyle,
    ...rest,
  }, children);
};

export const PanGestureHandler = ({ children, onGestureEvent, onHandlerStateChange, ...props }: any) => {
  // 过滤掉非 DOM 属性，避免 React 警告
  const { minDist, minPointers, maxPointers, avgTouches, enabled, shouldCancelWhenOutside, simultaneousHandlers, waitFor, ...domProps } = props;

  const handleRef = React.useRef<HTMLDivElement>(null);
  const isDragging = React.useRef(false);
  // 使用 ref 保存最新的回调，避免闭包过期
  const gestureRef = React.useRef(onGestureEvent);
  const stateRef = React.useRef(onHandlerStateChange);
  gestureRef.current = onGestureEvent;
  stateRef.current = onHandlerStateChange;

  React.useEffect(() => {
    const el = handleRef.current;
    if (!el) return;

    const getPointerCoords = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const fireGesture = (clientX: number, clientY: number, state: number) => {
      const pos = getPointerCoords(clientX, clientY);
      gestureRef.current?.({
        nativeEvent: {
          translationX: 0,
          translationY: 0,
          absoluteX: pos.x,
          absoluteY: pos.y,
          velocityX: 0,
          velocityY: 0,
          state,
        },
      });
    };

    // === 鼠标事件 ===
    const onMouseDown = (e: MouseEvent) => {
      isDragging.current = true;
      fireGesture(e.clientX, e.clientY, 4); // ACTIVE
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      fireGesture(e.clientX, e.clientY, 4);
    };
    const onMouseUp = () => endDrag();

    // === 触摸事件 ===
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      isDragging.current = true;
      fireGesture(t.clientX, t.clientY, 4);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (!isDragging.current) return;
      const t = e.touches[0];
      fireGesture(t.clientX, t.clientY, 4);
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      endDrag();
    };

    const endDrag = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      stateRef.current?.({
        nativeEvent: { state: 5 }, // END
      });
    };

    el.addEventListener("mousedown", onMouseDown);
    el.addEventListener("mousemove", onMouseMove);
    el.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mouseup", onMouseUp);
    // 触摸事件
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: false });

    return () => {
      el.removeEventListener("mousedown", onMouseDown);
      el.removeEventListener("mousemove", onMouseMove);
      el.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mouseup", onMouseUp);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  return React.createElement("div", {
    ref: handleRef,
    style: { touchAction: "none", display: "inline-flex" },
    ...domProps,
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

function filterDomProps(props: any) {
  const { minDist, minPointers, maxPointers, avgTouches, enabled, shouldCancelWhenOutside, simultaneousHandlers, waitFor, onGestureEvent, onHandlerStateChange, ...domProps } = props;
  return domProps;
}

export const TapGestureHandler = ({ children, ...props }: any) => React.createElement("div", filterDomProps(props), children);
export const PinchGestureHandler = ({ children, ...props }: any) => React.createElement("div", filterDomProps(props), children);
export const RotationGestureHandler = ({ children, ...props }: any) => React.createElement("div", filterDomProps(props), children);

export default {
  GestureHandlerRootView,
  PanGestureHandler,
  TapGestureHandler,
  PinchGestureHandler,
  RotationGestureHandler,
  State,
};