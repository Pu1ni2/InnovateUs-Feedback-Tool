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
        <section className="relative pt-20 pb-10 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <AnimatePresence>
              {userName && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4"
                >
                  <span className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100/80 text-amber-800 rounded-full text-sm font-medium">
                    <Sparkles className="w-4 h-4" />
                    Hi, {userName}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="text-4xl md:text-5xl lg:text-6xl font-semibold text-stone-800 tracking-tight mb-4"
            >
              InnovateUS Feedback
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
              className="text-lg md:text-xl text-stone-600 max-w-2xl mx-auto"
            >
              Help us understand the real-world impact of AI training.
            </motion.p>

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
                <h2 className="text-2xl md:text-3xl font-medium text-stone-800 mb-2">
                  Share Your Experience
                </h2>
                <p className="text-stone-600">
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
                <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-4 pointer-events-none">
                  <MessageSquare className="w-8 h-8 text-amber-600" />
                </div>
                <h3 className="text-xl font-medium text-stone-800 mb-2 text-center pointer-events-none">
                  Ready to share your feedback?
                </h3>
                <p className="text-stone-600 text-center mb-6 max-w-sm pointer-events-none">
                  Click to enter the form (Normal or Full Screen)
                </p>
                <div className="flex gap-3">
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEnterFocus();
                    }}
                    size="lg"
                    className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    <Maximize2 className="w-4 h-4" />
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
                  mode="focused"
                  isFullscreen={isFullscreen}
                  onEnterFocus={handleEnterFocus}
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
          <p>© 2026 InnovateUS. Your feedback is confidential.</p>
        </footer>
      )}
    </main>
  );
}
