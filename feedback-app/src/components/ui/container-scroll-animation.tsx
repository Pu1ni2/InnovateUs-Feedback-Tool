"use client";
import React, { useRef, useEffect } from "react";
import { useScroll, useTransform, useSpring, motion, MotionValue, useMotionValue } from "framer-motion";

export const ContainerScroll = ({
  titleComponent,
  children,
  isFocused = false,
  isFullscreen = false,
}: {
  titleComponent: string | React.ReactNode;
  children: React.ReactNode;
  isFocused?: boolean;
  isFullscreen?: boolean;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
  });
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => {
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  // Scroll-based transforms
  const scrollRotate = useTransform(scrollYProgress, [0, 1], [20, 0]);
  const scrollScale = useTransform(scrollYProgress, [0, 1], isMobile ? [0.7, 0.9] : [1.05, 1]);
  // Reduced translate range so header doesn't get cut off at top
  const translate = useTransform(scrollYProgress, [0, 1], [60, -40]);

  // Track if we should force flat rotation
  const forceFlat = useMotionValue(0);
  
  // Blend between scroll rotation and flat based on forceFlat
  const rotateValue = useTransform(
    [scrollRotate, forceFlat],
    ([latestScroll, latestFlat]) => {
      // If forceFlat is 1, return 0 (flat), otherwise use scroll value
      return latestFlat === 1 ? 0 : (latestScroll as number);
    }
  );

  // Smooth spring for rotation
  const rotate = useSpring(rotateValue, {
    stiffness: 200,
    damping: 40,
  });

  // When focused, force flat rotation
  useEffect(() => {
    if (isFocused || isFullscreen) {
      forceFlat.set(1);
    } else {
      forceFlat.set(0);
    }
  }, [isFocused, isFullscreen, forceFlat]);

  // Container styles based on state
  const getContainerStyles = () => {
    if (isFullscreen) {
      // Fullscreen: fills viewport with cream background
      return 'fixed inset-0 z-50 h-screen bg-[#FDF8F3]';
    } else if (isFocused) {
      // Normal focused: centered on screen with cream background
      return 'fixed inset-0 z-50 h-screen flex items-center justify-center bg-[#FDF8F3]';
    } else {
      // Unfocused: tall for scroll animation (inherits bg from parent)
      return 'h-[60rem] md:h-[80rem]';
    }
  };

  return (
    <div
      className={`flex items-center justify-center relative p-2 md:p-20 ${getContainerStyles()}`}
      ref={containerRef}
    >
      <div
        className={`w-full relative flex items-start justify-center ${
          isFullscreen ? 'h-full py-0' : isFocused ? 'py-0' : 'pt-32 md:pt-48 pb-20 md:pb-32'
        }`}
        style={{
          perspective: "1000px",
        }}
      >
        {!isFocused && !isFullscreen && (
          <Header translate={translate} titleComponent={titleComponent} />
        )}
        <Card 
          rotate={rotate} 
          scrollScale={scrollScale} 
          isFocused={isFocused}
          isFullscreen={isFullscreen}
        >
          {children}
        </Card>
      </div>
    </div>
  );
};

export const Header = ({ translate, titleComponent }: any) => {
  return (
    <motion.div
      style={{
        translateY: translate,
      }}
      className="max-w-5xl mx-auto text-center absolute top-0 left-0 right-0"
    >
      {titleComponent}
    </motion.div>
  );
};

export const Card = ({
  rotate,
  scrollScale,
  isFocused,
  isFullscreen,
  children,
}: {
  rotate: MotionValue<number>;
  scrollScale: MotionValue<number>;
  isFocused: boolean;
  isFullscreen: boolean;
  children: React.ReactNode;
}) => {
  // When focused/fullscreen, we don't want scroll-based scale
  const focusScale = useSpring(1, {
    stiffness: 150,
    damping: 30,
  });

  // Determine styles based on state
  const getStyles = () => {
    if (isFullscreen) {
      // Fullscreen: fills the fixed container with device frame
      return {
        cardClass: 'w-full h-full border-8 border-stone-300 p-3 md:p-6 bg-stone-100 rounded-[40px] shadow-2xl',
        innerClass: 'rounded-3xl',
      };
    } else if (isFocused) {
      // Normal focused: Same size as the tab/screen (same as unfocused but straight)
      return {
        cardClass: 'max-w-5xl mt-8 h-[30rem] md:h-[40rem] w-full border-4 border-stone-300 p-2 md:p-6 bg-stone-100 rounded-[30px] shadow-2xl',
        innerClass: 'rounded-2xl md:rounded-2xl',
      };
    } else {
      // Unfocused: Scroll animation with tilt
      return {
        cardClass: 'max-w-5xl mt-8 h-[30rem] md:h-[40rem] w-full border-4 border-stone-300 p-2 md:p-6 bg-stone-100 rounded-[30px] shadow-2xl',
        innerClass: 'rounded-2xl md:rounded-2xl',
      };
    }
  };

  const styles = getStyles();

  return (
    <motion.div
      style={{
        rotateX: rotate,
        scale: isFocused || isFullscreen ? focusScale : scrollScale,
      }}
      className={`mx-auto pointer-events-auto ${styles.cardClass}`}
    >
      <div className={`h-full w-full overflow-hidden bg-[#FFFBF5] relative pointer-events-auto ${styles.innerClass}`}>
        {children}
      </div>
    </motion.div>
  );
};
