"use client";

export function DottedBackground() {
  return (
    <div 
      className="fixed inset-0 pointer-events-none z-0"
      style={{
        backgroundImage: `radial-gradient(circle, #d6d3d1 1px, transparent 1px)`,
        backgroundSize: '24px 24px',
        opacity: 0.4,
      }}
    />
  );
}
