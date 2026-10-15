import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const SPRING = { damping: 22, stiffness: 220, mass: 0.6 };

type Props = {
  uri: string;
  width: number;
  height: number;
  label: string;
  /** Called with true while the picture is zoomed in, so the page behind can stop swiping sideways. */
  onZoomChange: (zoomed: boolean) => void;
};

/** How far a picture of this size, at this zoom, may be moved from the middle before its edge shows. */
function limitFor(size: number, scale: number) {
  'worklet';
  return Math.max(0, (size * (scale - 1)) / 2);
}

function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

/**
 * A picture shown whole, that the fingers can pinch to zoom in and out (around the point between them), drag around when
 * zoomed, and double-tap to zoom in or back out. All of it runs on the UI thread, so it follows the fingers without lag. At
 * normal size the one-finger drag stays off, so a sideways swipe still goes to the next picture.
 */
export function ZoomableImage({ uri, width, height, label, onZoomChange }: Props) {
  const scale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  // Where the current gesture started.
  const startScale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startFocalX = useSharedValue(0);
  const startFocalY = useSharedValue(0);
  // What the page behind was last told, so it is told only when this changes.
  const reported = useSharedValue(false);

  const report = (zoomed: boolean) => {
    'worklet';
    if (reported.value === zoomed) return;
    reported.value = zoomed;
    scheduleOnRN(onZoomChange, zoomed);
  };

  /** Lets go of a gesture: a picture left smaller than normal, or dragged past its edge, springs back. */
  const settle = () => {
    'worklet';
    const s = clamp(scale.value, 1, MAX_SCALE);
    scale.value = withSpring(s, SPRING);
    x.value = withSpring(clamp(x.value, -limitFor(width, s), limitFor(width, s)), SPRING);
    y.value = withSpring(clamp(y.value, -limitFor(height, s), limitFor(height, s)), SPRING);
    report(s > 1.01);
  };

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      startScale.value = scale.value;
      startX.value = x.value;
      startY.value = y.value;
      startFocalX.value = e.focalX;
      startFocalY.value = e.focalY;
      report(true);
    })
    .onUpdate((e) => {
      const next = clamp(startScale.value * e.scale, 0.7, MAX_SCALE * 1.2);
      const ratio = next / startScale.value;
      // The point under the fingers stays under the fingers: the picture is moved so it does not slide away from them.
      const fx = startFocalX.value - width / 2;
      const fy = startFocalY.value - height / 2;
      scale.value = next;
      x.value = fx - (fx - startX.value) * ratio + (e.focalX - startFocalX.value);
      y.value = fy - (fy - startY.value) * ratio + (e.focalY - startFocalY.value);
    })
    .onEnd(settle);

  // Takes over only when zoomed in (or two fingers are down), so at normal size a swipe belongs to the list of pictures.
  const pan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesMove((_, manager) => {
      if (scale.value > 1.01) manager.activate();
      else manager.fail();
    })
    .onStart(() => {
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate((e) => {
      x.value = startX.value + e.translationX;
      y.value = startY.value + e.translationY;
    })
    .onEnd(settle);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onEnd((e, success) => {
      if (!success) return;
      if (scale.value > 1.01) {
        scale.value = withTiming(1, { duration: 220 });
        x.value = withTiming(0, { duration: 220 });
        y.value = withTiming(0, { duration: 220 });
        report(false);
        return;
      }
      // Zoom in on the spot that was tapped.
      const fx = e.x - width / 2;
      const fy = e.y - height / 2;
      const limX = limitFor(width, DOUBLE_TAP_SCALE);
      const limY = limitFor(height, DOUBLE_TAP_SCALE);
      scale.value = withTiming(DOUBLE_TAP_SCALE, { duration: 220 });
      x.value = withTiming(clamp(-fx * (DOUBLE_TAP_SCALE - 1), -limX, limX), { duration: 220 });
      y.value = withTiming(clamp(-fy * (DOUBLE_TAP_SCALE - 1), -limY, limY), { duration: 220 });
      report(true);
    });

  // Together, not one after the other: waiting to see whether a tap is a double tap would delay every pinch and drag.
  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ width, height }, style]}>
        <Image source={{ uri }} style={{ width, height }} contentFit="contain" accessibilityLabel={label} transition={0} />
      </Animated.View>
    </GestureDetector>
  );
}
