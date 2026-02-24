"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Dot {
  x: number;
  y: number;
  id: number;
}

export function DottedBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dots, setDots] = useState<Dot[]>([]);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const rafRef = useRef<number>();
  const mouseRef = useRef({ x: 0, y: 0 });

  // Generate dots on mount
  useEffect(() => {
    const generateDots = () => {
      const spacing = 48; // Increased spacing for better performance
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

  // Track mouse position with RAF for performance
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const updateMousePos = () => {
      setMousePos(mouseRef.current);
      rafRef.current = requestAnimationFrame(updateMousePos);
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    rafRef.current = requestAnimationFrame(updateMousePos);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#FDF8F3]">
      {/* Static dots - rendered once for better performance */}
      {dots.map((dot) => (
        <InteractiveDot
          key={dot.id}
          dot={dot}
          mouseX={mousePos.x}
          mouseY={mousePos.y}
        />
      ))}
      
      {/* Single ambient glow - CSS-based, no JS animation */}
      <div
        className="absolute w-[400px] h-[400px] rounded-full pointer-events-none transition-transform duration-300 ease-out"
        style={{
          left: mousePos.x - 200,
          top: mousePos.y - 200,
          background: `radial-gradient(circle, rgba(217, 119, 6, 0.06) 0%, transparent 60%)`,
          willChange: 'transform',
        }}
      />
    </div>
  );
}

interface InteractiveDotProps {
  dot: Dot;
  mouseX: number;
  mouseY: number;
}

function InteractiveDot({ dot, mouseX, mouseY }: InteractiveDotProps) {
  // Calculate distance for visual effect (no state updates for performance)
  const dx = mouseX - dot.x;
  const dy = mouseY - dot.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  const maxDistance = 120;
  const proximity = Math.max(0, 1 - distance / maxDistance);
  
  // Simple CSS transform - no spring animation for performance
  const scale = 1 + proximity * 0.8;
  const opacity = 0.15 + proximity * 0.5;
  const isActive = proximity > 0.3;

  return (
    <div
      className="absolute rounded-full transition-all duration-200 ease-out"
      style={{
        left: dot.x - 2,
        top: dot.y - 2,
        width: 4,
        height: 4,
        backgroundColor: isActive ? "#b45309" : "#a8a29e",
        opacity,
        transform: `scale(${scale})`,
        willChange: 'transform, opacity',
      }}
    />
  );
}
