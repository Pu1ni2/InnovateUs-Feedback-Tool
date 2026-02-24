"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Mic, 
  MicOff, 
  Send, 
  X, 
  Maximize2, 
  Minimize2,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Volume2,
  Expand,
  Shrink
} from "lucide-react";

// Types
interface Question {
  id: number;
  text: string;
}

interface FormData {
  [key: number]: string;
}

interface FeedbackFormProps {
  userName?: string;
  mode: "inline" | "focused";
  isFullscreen?: boolean;
  onEnterFocus: () => void;
  onExitFocus: () => void;
  onToggleSize?: () => void;
}

const QUESTIONS: Question[] = [
  { id: 1, text: "What did you try?" },
  { id: 2, text: "What happened?" },
  { id: 3, text: "What got in the way?" },
];

export function FeedbackForm({ 
  userName, 
  mode, 
  isFullscreen = false,
  onEnterFocus, 
  onExitFocus,
  onToggleSize
}: FeedbackFormProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<FormData>({});
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [followUpCount, setFollowUpCount] = useState(0);

  const currentQuestion = QUESTIONS[currentStep];
  const currentAnswer = formData[currentQuestion?.id] || "";

  const handleInputChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      [currentQuestion.id]: value,
    }));
  };

  const handleNext = useCallback(async () => {
    if (!currentAnswer.trim()) return;
    
    setIsProcessing(true);
    setAiThinking(true);
    
    // Simulate AI processing
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    setAiThinking(false);
    setIsProcessing(false);
    
    if (currentStep < QUESTIONS.length - 1) {
      setCurrentStep((prev) => prev + 1);
      setFollowUpCount(0);
    } else {
      setCompleted(true);
    }
  }, [currentAnswer, currentStep]);

  const handleSubmit = async () => {
    setIsProcessing(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsProcessing(false);
    setCompleted(true);
  };

  const toggleVoice = () => {
    setIsVoiceActive(!isVoiceActive);
  };

  const handleRestart = () => {
    setCurrentStep(0);
    setFormData({});
    setCompleted(false);
    setFollowUpCount(0);
  };

  if (completed) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center h-full p-6 text-center"
      >
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-xl font-semibold text-stone-800 mb-2">
          Thank You{userName ? `, ${userName}` : ""}!
        </h3>
        <p className="text-stone-600 mb-6 max-w-sm">
          Your feedback helps us understand the real-world impact of AI training.
        </p>
        <div className="flex gap-3">
          <Button onClick={handleRestart} variant="outline" className="gap-2">
            Submit Another Response
          </Button>
          <Button 
            onClick={onExitFocus} 
            variant="default"
            className="gap-2 bg-amber-600 hover:bg-amber-700"
          >
            <X className="w-4 h-4" />
            Close Form
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-stone-200 bg-[#FFFBF5]/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="bg-stone-200 text-stone-700">
            {currentStep + 1} / {QUESTIONS.length}
          </Badge>
          <span className="text-sm text-stone-600">
            InnovateUS Feedback
          </span>
        </div>
        
        {/* Size Toggle + Exit Options */}
        <div className="flex items-center gap-2">
          {/* Toggle between Normal and Fullscreen sizes */}
          {onToggleSize && (
            <Button
              size="sm"
              variant="outline"
              onClick={onToggleSize}
              className="gap-2 text-xs border-stone-300 hover:bg-stone-100"
            >
              {isFullscreen ? (
                <>
                  <Shrink className="w-3 h-3" />
                  Normal Size
                </>
              ) : (
                <>
                  <Expand className="w-3 h-3" />
                  Full Screen
                </>
              )}
            </Button>
          )}
          
          {/* Exit to placeholder */}
          <Button
            size="sm"
            variant="outline"
            onClick={onExitFocus}
            className="gap-2 text-xs border-stone-300 hover:bg-stone-100 hover:text-red-600"
          >
            <X className="w-3 h-3" />
            Exit Form
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1 bg-stone-200">
        <motion.div
          className="h-full bg-amber-600"
          initial={{ width: 0 }}
          animate={{ width: `${((currentStep + 1) / QUESTIONS.length) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Question */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-3"
          >
            <h2 className="text-lg font-medium text-stone-800">
              {currentQuestion.text}
            </h2>
            
            {/* AI Follow-up indicator */}
            {followUpCount > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 p-2 rounded-md"
              >
                <MessageSquare className="w-4 h-4" />
                <span>AI is asking a follow-up to better understand your experience</span>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Text Input */}
        <div className="space-y-2">
          <Label htmlFor="response" className="text-sm text-stone-600">
            Your response
          </Label>
          <Textarea
            id="response"
            value={currentAnswer}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Type your answer here..."
            className={`bg-white border-stone-300 resize-none focus:ring-amber-500 focus:border-amber-500 ${
              isFullscreen ? 'min-h-[200px]' : 'min-h-[120px]'
            }`}
          />
        </div>

        {/* AI Processing Indicator */}
        {aiThinking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 text-sm text-stone-500"
          >
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>AI is analyzing your response...</span>
          </motion.div>
        )}

        {/* Voice Input Section */}
        <div className="flex items-center gap-3 p-3 bg-stone-100 rounded-lg">
          <Button
            size="sm"
            variant={isVoiceActive ? "default" : "outline"}
            onClick={toggleVoice}
            className={`gap-2 ${isVoiceActive ? "bg-amber-600 hover:bg-amber-700" : "border-stone-300"}`}
          >
            {isVoiceActive ? (
              <>
                <Mic className="w-4 h-4" />
                Listening...
              </>
            ) : (
              <>
                <Volume2 className="w-4 h-4" />
                Voice Input
              </>
            )}
          </Button>
          
          {isVoiceActive && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              className="flex items-center gap-2"
            >
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse delay-75" />
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse delay-150" />
              </div>
              <span className="text-xs text-stone-500">Speak now</span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-stone-200 bg-[#FFFBF5]">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0 || isProcessing}
            className="text-stone-500"
          >
            Back
          </Button>
          
          <div className="flex items-center gap-2">
            {currentStep === QUESTIONS.length - 1 ? (
              <Button
                onClick={handleSubmit}
                disabled={!currentAnswer.trim() || isProcessing}
                className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Submit
              </Button>
            ) : (
              <Button
                onClick={handleNext}
                disabled={!currentAnswer.trim() || isProcessing}
                className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Next
                    <Send className="w-4 h-4" />
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
