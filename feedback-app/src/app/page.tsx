"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ContainerScroll } from "@/components/ui/container-scroll-animation";
import { DottedBackground } from "@/components/dotted-background";
import { FeedbackForm } from "@/components/feedback-form";
import { Button } from "@/components/ui/button";
import { Maximize2, MessageSquare, Sparkles } from "lucide-react";

export default function Home() {
  const [userName, setUserName] = useState<string>("");
  const [focusedMode, setFocusedMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setMounted(true);
    
    const storedName = localStorage.getItem("innovateus-user-name");
    if (storedName) {
      setUserName(storedName);
      return;
    }
    
    const params = new URLSearchParams(window.location.search);
    const nameParam = params.get("name");
    if (nameParam) {
      setUserName(nameParam);
      localStorage.setItem("innovateus-user-name", nameParam);
    }
  }, []);

  const handleEnterFocus = () => {
    // Scroll to center the card in viewport first
    if (sectionRef.current) {
      const section = sectionRef.current;
      const rect = section.getBoundingClientRect();
      const scrollTop = window.scrollY + rect.top + (rect.height / 2) - (window.innerHeight / 2);
      
      window.scrollTo({
        top: scrollTop,
        behavior: 'smooth'
      });
    }
    
    // Start with normal size (not fullscreen)
    setTimeout(() => {
      setFocusedMode(true);
      setIsFullscreen(false);
      document.body.style.overflow = "hidden";
    }, 400);
  };

  const handleToggleSize = () => {
    setIsFullscreen(!isFullscreen);
  };

  const handleExitFocus = () => {
    setFocusedMode(false);
    setIsFullscreen(false);
    document.body.style.overflow = "";
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#FDF8F3] flex items-center justify-center">
        <div className="animate-pulse text-stone-400">Loading...</div>
      </div>
    );
  }

  return (
    <main className="relative min-h-screen bg-[#FDF8F3]">
      <DottedBackground />

      {/* Hero Section - hidden when focused */}
      {!focusedMode && (
        <section className="relative pt-20 pb-3 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <AnimatePresence>
              {userName && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4"
                >
                  <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium" style={{ backgroundColor: 'rgba(208, 144, 6, 0.15)', color: '#D09006' }}>
                    <Sparkles className="w-4 h-4" style={{ color: '#FDCE3E' }} />
                    Hi, {userName}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4"
            >
              <span style={{ color: '#124D8F' }}>Innovate</span>
              <span style={{ color: '#D09006' }}>(US)</span>
              <span className="text-stone-600"> Impact Check-In</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
              className="text-lg md:text-xl text-stone-600 max-w-2xl mx-auto"
            >
              AI-powered voice & text feedback for{" "}
              <span style={{ color: '#124D8F' }} className="font-medium">behavior change measurement</span>
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
              className="mt-8 flex flex-wrap items-center justify-center gap-3"
            >
              <span className="px-4 py-1.5 rounded-full text-sm font-semibold bg-emerald-100 text-emerald-700">
                Anonymous responses
              </span>
              <span className="px-4 py-1.5 rounded-full text-sm font-semibold bg-blue-100 text-blue-700">
                Voice + Text support
              </span>
              <span className="px-4 py-1.5 rounded-full text-sm font-semibold bg-amber-100 text-amber-700">
                3-minute check-in
              </span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-8 flex flex-col items-center gap-2"
            >
              <span className="text-sm text-stone-500">Scroll to begin</span>
              <motion.div
                animate={{ y: [0, 8, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="w-6 h-10 rounded-full border-2 border-stone-300 flex items-start justify-center p-2"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-stone-400" />
              </motion.div>
            </motion.div>
          </div>
        </section>
      )}

      {/* Scroll-triggered Tab/Screen Section */}
      <section ref={sectionRef} className="relative">
        <ContainerScroll
          isFocused={focusedMode}
          isFullscreen={isFullscreen}
          titleComponent={
            !focusedMode && (
              <div className="mb-8 md:mb-12">
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-stone-900 mb-2">
                  Share Your Experience
                </h2>
                <p className="text-base md:text-lg text-stone-600 font-medium tracking-wide">
                  Your feedback helps improve future training programs
                </p>
              </div>
            )
          }
        >
          <div className="h-full w-full relative pointer-events-auto">
            {/* Placeholder when not in focus mode */}
            {!focusedMode && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center p-6 z-10 pointer-events-auto cursor-pointer"
                onClick={handleEnterFocus}
              >
                <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 pointer-events-none" style={{ backgroundColor: 'rgba(253, 206, 62, 0.2)' }}>
                  <MessageSquare className="w-8 h-8" style={{ color: '#FDCE3E' }} />
                </div>
                <h3 className="text-xl font-medium text-stone-800 mb-2 text-center pointer-events-none">
                  Ready to share your feedback?
                </h3>
                <p className="text-stone-600 text-center mb-6 max-w-sm pointer-events-none">
                  Click to enter the form with voice AI assistance
                </p>
                <div className="flex gap-3">
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEnterFocus();
                    }}
                    size="lg"
                    className="gap-2 text-white font-semibold shadow-md border-0"
                    style={{ backgroundColor: '#124D8F' }}
                  >
                    <Maximize2 className="w-5 h-5" style={{ color: '#FDCE3E' }} />
                    Enter Form
                  </Button>
                </div>
              </div>
            )}

            {/* Active Form when in focus mode */}
            {focusedMode && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.3 }}
                className="h-full flex flex-col"
              >
                <FeedbackForm
                  userName={userName}
                  isFullscreen={isFullscreen}
                  onExitFocus={handleExitFocus}
                  onToggleSize={handleToggleSize}
                />
              </motion.div>
            )}
          </div>
        </ContainerScroll>
      </section>

      {/* Footer - hidden when focused */}
      {!focusedMode && (
        <footer className="py-8 text-center text-stone-500 text-sm">
          <p>&copy; 2026 InnovateUS. Your feedback is confidential.</p>
        </footer>
      )}
    </main>
  );
}
