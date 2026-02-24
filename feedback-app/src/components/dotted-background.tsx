"use client";

import { useEffect, useState, useRef } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

interface Dot {
  x: number;
  y: number;
  id: number;
}

export function DottedBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dots, setDots] = useState<Dot[]>([]);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  
  // Smooth spring for mouse following
  const smoothMouseX = useSpring(mouseX, { stiffness: 150, damping: 20 });
  const smoothMouseY = useSpring(mouseY, { stiffness: 150, damping: 20 });

  // Generate dots on mount
  useEffect(() => {
    const generateDots = () => {
      const spacing = 40;
      const cols = Math.ceil(window.innerWidth / spacing) + 2;
      const rows = Math.ceil(window.innerHeight / spacing) + 2;
      const newDots: Dot[] = [];
      
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          newDots.push({
            x: col * spacing,
            y: row * spacing,
            id: row * cols + col,
          });
        }
      }
      setDots(newDots);
    };

    generateDots();
    window.addEventListener("resize", generateDots);
    return () => window.removeEventListener("resize", generateDots);
  }, []);

  // Track mouse position
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  return (
    <div ref={containerRef} className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#FDF8F3]">
      {/* Interactive dots */}
      {dots.map((dot) => (
        <InteractiveDot
          key={dot.id}
          dot={dot}
          mouseX={smoothMouseX}
          mouseY={smoothMouseY}
        />
      ))}
      
      {/* Subtle ambient glow that follows mouse */}
      <motion.div
        className="absolute w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{
          x: mouseX,
          y: mouseY,
          translateX: "-50%",
          translateY: "-50%",
          background: `radial-gradient(circle, rgba(217, 119, 6, 0.08) 0%, transparent 60%)`,
        }}
      />
    </div>
  );
}

interface InteractiveDotProps {
  dot: Dot;
  mouseX: ReturnType<typeof useSpring>;
  mouseY: ReturnType<typeof useSpring>;
}

function InteractiveDot({ dot, mouseX, mouseY }: InteractiveDotProps) {
  const [distance, setDistance] = useState(100);
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribeX = mouseX.on("change", (x) => {
      const unsubscribeY = mouseY.on("change", (y) => {
        const dx = x - dot.x;
        const dy = y - dot.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        setDistance(dist);
      });
      return () => unsubscribeY();
    });
    
    return () => unsubscribeX();
  }, [dot.x, dot.y, mouseX, mouseY]);

  // Calculate dot properties based on distance to mouse
  const maxDistance = 150;
  const proximity = Math.max(0, 1 - distance / maxDistance);
  
  // Dot gets bigger, brighter, and moves slightly toward mouse when close
  const scale = 1 + proximity * 1.5;
  const opacity = 0.2 + proximity * 0.6;
  const offsetX = proximity * (mouseX.get() - dot.x) * 0.1;
  const offsetY = proximity * (mouseY.get() - dot.y) * 0.1;

  return (
    <motion.div
      ref={dotRef}
      className="absolute rounded-full"
      style={{
        left: dot.x,
        top: dot.y,
        width: 4,
        height: 4,
        backgroundColor: proximity > 0.5 ? "#d97706" : "#a8a29e",
        opacity,
        scale,
        x: offsetX,
        y: offsetY,
      }}
      animate={{
        scale,
        x: offsetX,
        y: offsetY,
      }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 20,
      }}
    />
  );
}
