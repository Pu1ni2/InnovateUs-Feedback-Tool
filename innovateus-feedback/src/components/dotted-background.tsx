"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

export function DottedBackground() {
  const [mounted, setMounted] = useState(false);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // Smooth spring animation for subtle parallax
  const smoothX = useSpring(mouseX, { stiffness: 50, damping: 20 });
  const smoothY = useSpring(mouseY, { stiffness: 50, damping: 20 });
  
  // Secondary layer springs (slower parallax for depth)
  const slowerX = useSpring(smoothX, { stiffness: 30, damping: 25 });
  const slowerY = useSpring(smoothY, { stiffness: 30, damping: 25 });

  useEffect(() => {
    setMounted(true);
    
    const handleMouseMove = (e: MouseEvent) => {
      // Calculate offset from center (normalized -1 to 1)
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      
      // Apply subtle movement (max 20px)
      mouseX.set(x * 20);
      mouseY.set(y * 20);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
      {/* Warm cream base background */}
      <div className="absolute inset-0 bg-[#FDF8F3]" />
      
      {/* Dotted pattern layer with parallax */}
      <motion.div
        className="absolute inset-0 opacity-40"
        style={{
          x: smoothX,
          y: smoothY,
          backgroundImage: `radial-gradient(circle, #A8A29E 1.5px, transparent 1.5px)`,
          backgroundSize: "32px 32px",
        }}
      />
      
      {/* Secondary dotted layer (slower parallax for depth) */}
      <motion.div
        className="absolute inset-0 opacity-25"
        style={{
          x: slowerX,
          y: slowerY,
          backgroundImage: `radial-gradient(circle, #A8A29E 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      />

      {/* Subtle gradient overlay for warmth */}
      <div 
        className="absolute inset-0 opacity-30"
        style={{
          background: "radial-gradient(ellipse at 50% 0%, rgba(251, 245, 235, 0.8) 0%, transparent 50%)"
        }}
      />
    </div>
  );
}
