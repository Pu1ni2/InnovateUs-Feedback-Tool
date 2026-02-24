"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Mic, 
  Send, 
  X, 
  CheckCircle2,
  Loader2,
  MessageSquare,
  Volume2,
  Expand,
  Shrink,
  RotateCcw
} from "lucide-react";
import RealtimeVoice from "./realtime-voice";
import { createSession, textSubmit, checkCovered, playBase64Audio } from "@/lib/api";

// Types
interface Question {
  id: number;
  text: string;
}

interface FormData {
  [key: number]: string;
}

interface Result {
  questionIndex: number;
  question: string;
  summary: string;
  structured?: any;
}

interface Message {
  role: 'ai' | 'user';
  text: string;
  isFollowUp?: boolean;
  isSkip?: boolean;
  isTransition?: boolean;
}

interface FeedbackFormProps {
  userName?: string;
  isFullscreen?: boolean;
  onExitFocus: () => void;
  onToggleSize?: () => void;
}

const MAX_FOLLOWUPS = 2;

export function FeedbackForm({ 
  userName, 
  isFullscreen = false,
  onExitFocus,
  onToggleSize
}: FeedbackFormProps) {
  // Session state
  const [sessionId, setSessionId] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Question flow state
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<FormData>({});
  const [followUpCount, setFollowUpCount] = useState(0);
  const [completedQs, setCompletedQs] = useState<Set<number>>(new Set());
  const [results, setResults] = useState<Result[]>([]);
  
  // UI state
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Chat/conversation state
  const [conversation, setConversation] = useState<Message[]>([]);
  
  // Refs
  const chatEndRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const questionsRef = useRef(questions);
  
  useEffect(() => { questionsRef.current = questions }, [questions]);
  
  useEffect(() => { 
    mountedRef.current = true; 
    return () => { mountedRef.current = false } 
  }, []);
  
  useEffect(() => { 
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) 
  }, [conversation]);

  // Initialize session
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await createSession();
        if (cancelled || !mountedRef.current) return;
        
        setSessionId(data.session_id);
        const questionList = (data.questions || []).map((q: string, i: number) => ({ 
          id: i, 
          text: q 
        }));
        setQuestions(questionList);
        
        const firstIntro = (data.spoken_intros && data.spoken_intros[0]) || data.questions[0];
        setConversation([{ role: 'ai', text: firstIntro }]);
      } catch (e: any) {
        if (!cancelled && mountedRef.current) setError(e.message || 'Failed to initialize');
      } finally {
        if (!cancelled && mountedRef.current) setLoading(false);
      }
    })();
    return () => { cancelled = true };
  }, []);

  const progress = questions.length
    ? (Math.max(completedQs.size, currentStep) / questions.length) * 100
    : 0;

  const currentQuestion = questions[currentStep];
  const currentAnswer = currentQuestion ? formData[currentQuestion.id] || "" : "";

  /* ── Voice callbacks ─────────────────────────────────── */
  const onUserTranscript = useCallback((text: string) => {
    // Voice transcript should appear in chat only, never in typed input.
    setConversation(prev => [...prev, { role: 'user', text }]);
  }, []);

  const detectQuestionIndex = useCallback((transcript: string) => {
    const lower = transcript.toLowerCase();
    const qs = questionsRef.current;
    if (!qs.length) return -1;
    const markers = [
      ['new approach', 'technique', 'actually tried'],
      ['what happened', 'outcome', 'team responded'],
      ['difficult', 'got in the way', 'competing priorities'],
    ];
    for (let i = markers.length - 1; i >= 0; i--) {
      if (i < qs.length && markers[i].some(m => lower.includes(m))) return i;
    }
    return -1;
  }, []);

  const onAITranscript = useCallback((text: string) => {
    const normalize = (v: string) =>
      v.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    const tokenSet = (v: string) =>
      new Set(
        normalize(v)
          .split(' ')
          .filter(t => t.length > 3)
      );
    const overlapRatio = (a: string, b: string) => {
      const A = tokenSet(a);
      const B = tokenSet(b);
      if (!A.size || !B.size) return 0;
      let common = 0;
      A.forEach(t => { if (B.has(t)) common += 1; });
      return common / Math.max(A.size, B.size);
    };

    // Avoid duplicate AI messages when voice speaks text already shown in chat.
    setConversation(prev => {
      const nextText = normalize(text);
      if (!nextText) return prev;

      const recentAi = prev.filter(m => m.role === 'ai').slice(-4);
      const hasUserMessage = prev.some(m => m.role === 'user');

      const isDuplicate = recentAi.some(m => {
        const oldText = normalize(m.text);
        if (!oldText) return false;
        if (oldText === nextText) return true;
        const oldStart = oldText.slice(0, 80);
        const newStart = nextText.slice(0, 80);
        if (oldText.includes(newStart) || nextText.includes(oldStart)) return true;
        // Catch paraphrased duplicates (same follow-up intent, different wording).
        return overlapRatio(oldText, nextText) >= 0.6;
      });
      if (isDuplicate) return prev;

      // Startup case: first question is already visible in chat; voice can read it without re-adding.
      if (!hasUserMessage) {
        const firstAi = prev.find(m => m.role === 'ai');
        const firstText = firstAi ? normalize(firstAi.text) : '';
        if (firstText) {
          const firstStart = firstText.slice(0, 80);
          const nextStart = nextText.slice(0, 80);
          if (firstText.includes(nextStart) || nextText.includes(firstStart)) {
            return prev;
          }
        }
      }
      return [...prev, { role: 'ai', text }];
    });
    const detected = detectQuestionIndex(text);
    if (detected >= 0) {
      setCurrentStep(prev => Math.max(prev, detected));
    }
  }, [detectQuestionIndex]);

  const onQuestionDone = useCallback((idx: number, summary: string) => {
    setCompletedQs(prev => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
    setResults(prev => {
      const updated = [...prev];
      const exists = updated.find(r => r.questionIndex === idx);
      if (!exists) {
        updated.push({
          questionIndex: idx,
          question: questionsRef.current[idx]?.text || `Question ${idx + 1}`,
          summary,
        });
      }
      return updated;
    });
    setCurrentStep(idx + 1);
    setFollowUpCount(0);
  }, []);

  const onCheckInComplete = useCallback((summaries: string[]) => {
    const qs = questionsRef.current;
    const finalResults = (summaries || []).map((s, i) => ({
      questionIndex: i,
      question: qs[i]?.text || `Question ${i + 1}`,
      summary: s,
    }));
    setResults(finalResults.length ? finalResults : results);
    setTimeout(() => setCompleted(true), 1500);
  }, [results]);

  const onVoiceDisconnect = useCallback((lastCompletedQ: number) => {
    if (lastCompletedQ >= 0) {
      const maxQ = questionsRef.current.length - 1;
      setCurrentStep(prev => {
        const nextQ = Math.min(lastCompletedQ + 1, maxQ);
        return nextQ > prev ? nextQ : prev;
      });
    }
  }, []);

  const onVoiceError = useCallback((msg: string) => {
    setError(msg);
    setTimeout(() => { if (mountedRef.current) setError(null) }, 5000);
  }, []);

  /* ── Text advance/finish ─────────────────────────────── */
  const advanceOrFinish = useCallback(async (newResults: Result[], coveredFuture: number[] = []) => {
    setFollowUpCount(0);

    let nextIdx = currentStep + 1;
    while (nextIdx < questions.length) {
      const isCovered = coveredFuture.includes(nextIdx) || await checkCovered(sessionId, nextIdx);
      if (!isCovered) break;
      setConversation(prev => [...prev, {
        role: 'ai',
        text: `It sounds like you already covered question ${nextIdx + 1}. Skipping ahead.`,
        isSkip: true,
      }]);
      setCompletedQs(prev => { const n = new Set(prev); n.add(nextIdx); return n });
      nextIdx++;
    }

    if (nextIdx >= questions.length) {
      setResults(newResults);
      setCompleted(true);
      return;
    }

    setCurrentStep(nextIdx);
    setConversation(prev => [...prev, {
      role: 'ai',
      text: questions[nextIdx].text,
    }]);
  }, [currentStep, questions, sessionId]);

  /* ── Process text analysis ───────────────────────────── */
  const handleAnalysis = useCallback(async (result: any, transcript: string | null) => {
    const { status, follow_up, follow_up_audio, transition_text, transition_audio,
            summary, covered_future_indices, structured } = result;

    // Note: User transcript is already added to conversation before API call
    // We just use 'transcript' here for summary fallback

    if (status === 'needs_follow_up' && follow_up) {
      setFollowUpCount(c => c + 1);
      setConversation(prev => [...prev, { role: 'ai', text: follow_up, isFollowUp: true }]);
      setIsProcessing(false);
      setAiThinking(false);
      if (follow_up_audio) {
        try { await playBase64Audio(follow_up_audio) } catch (_) {}
      }
      return;
    }

    if (transition_text) {
      setConversation(prev => [...prev, { role: 'ai', text: transition_text, isTransition: true }]);
    }
    if (transition_audio) {
      try { await playBase64Audio(transition_audio) } catch (_) {}
    }

    setCompletedQs(prev => { const n = new Set(prev); n.add(currentStep); return n });
    const newResults = [...results, {
      questionIndex: currentStep,
      question: questions[currentStep]?.text || '',
      summary: summary || transcript || '',
      structured,
    }];
    setResults(newResults);
    setIsProcessing(false);
    setAiThinking(false);
    await advanceOrFinish(newResults, covered_future_indices || []);
  }, [results, questions, currentStep, advanceOrFinish]);

  /* ── Text submit ─────────────────────────────────────── */
  const handleTextSubmit = useCallback(async () => {
    const text = currentAnswer.trim();
    if (!text || !sessionId) return;
    
    setIsProcessing(true);
    setAiThinking(true);
    setError(null);

    // Add user message to conversation immediately (like voice does)
    setConversation(prev => [...prev, { role: 'user', text }]);
    
    // Clear the text input
    if (currentQuestion) {
      setFormData(prev => ({ ...prev, [currentQuestion.id]: '' }));
    }

    try {
      const result = await textSubmit(sessionId, currentStep, text, followUpCount);
      await handleAnalysis(result, text);
    } catch (e: any) {
      setError(e.message || 'Something went wrong. Please try again.');
      setIsProcessing(false);
      setAiThinking(false);
    }
  }, [currentAnswer, sessionId, currentStep, followUpCount, handleAnalysis, currentQuestion]);

  const handleInputChange = (value: string) => {
    if (!currentQuestion) return;
    setFormData(prev => ({ ...prev, [currentQuestion.id]: value }));
  };

  const handleRestart = () => {
    setCurrentStep(0);
    setFormData({});
    setCompleted(false);
    setFollowUpCount(0);
    setCompletedQs(new Set());
    setResults([]);
    setConversation([]);
    // Re-initialize session
    setLoading(true);
    createSession().then(data => {
      setSessionId(data.session_id);
      const questionList = (data.questions || []).map((q: string, i: number) => ({ id: i, text: q }));
      setQuestions(questionList);
      const firstIntro = (data.spoken_intros && data.spoken_intros[0]) || data.questions[0];
      setConversation([{ role: 'ai', text: firstIntro }]);
      setLoading(false);
    });
  };

  /* ── Render ──────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <div className="w-8 h-8 border-2 border-amber-600 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-stone-600">Setting up your check-in...</span>
      </div>
    );
  }

  if (error && !questions.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <div className="text-red-600 mb-4">{error}</div>
        <Button onClick={handleRestart} variant="outline">Try Again</Button>
      </div>
    );
  }

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
            <RotateCcw className="w-4 h-4" />
            Submit Another Response
          </Button>
          <Button 
            onClick={onExitFocus} 
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
    <div className="flex flex-col h-full bg-[#FFFBF5]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-stone-200 bg-[#FFFBF5]/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="bg-amber-100 text-amber-800">
            {currentStep + 1} / {questions.length}
          </Badge>
          <span className="text-sm text-stone-600 font-medium">
            InnovateUS Check-In
          </span>
        </div>
        
        <div className="flex items-center gap-2">
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
          
          <Button
            size="sm"
            variant="outline"
            onClick={onExitFocus}
            className="gap-2 text-xs border-stone-300 hover:bg-stone-100 hover:text-red-600"
          >
            <X className="w-3 h-3" />
            Exit
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1 bg-stone-200 shrink-0">
        <motion.div
          className="h-full bg-amber-600"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Main Content - Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Chat Messages */}
        <div className="space-y-3">
          {conversation.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              {msg.role === 'ai' && (
                <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <Volume2 className="w-4 h-4 text-amber-600" />
                </div>
              )}
              <div className={`max-w-[80%] ${
                msg.role === 'user' 
                  ? 'bg-amber-700 text-white' 
                  : msg.isFollowUp 
                    ? 'bg-[#FFE4C4] text-[#8B4513] shadow-sm'
                    : msg.isSkip || msg.isTransition
                      ? 'bg-stone-100 text-stone-500 italic text-sm'
                      : 'bg-stone-100 text-stone-800'
              } rounded-2xl px-4 py-3 text-base leading-relaxed`}>
                {msg.isFollowUp && (
                  <div className="flex items-center gap-1.5 text-xs text-[#A0522D] font-medium mb-1.5 uppercase tracking-wide">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#CD853F] animate-pulse" />
                    <span>Continue</span>
                  </div>
                )}
                {(msg.isSkip || msg.isTransition) && (
                  <div className="text-xs text-stone-400 mb-1 flex items-center gap-1">
                    <span>→</span>
                    <span>Already covered</span>
                  </div>
                )}
                <p>{msg.text}</p>
              </div>
            </motion.div>
          ))}
          <div ref={chatEndRef} />
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

        {/* Error Toast */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Input Area */}
      <div className="p-4 border-t border-stone-200 bg-[#FFFBF5] shrink-0">
        {/* Voice Input Section */}
        <div className="mb-3">
          <RealtimeVoice
            sessionId={sessionId}
            questionIndex={currentStep}
            onUserTranscript={onUserTranscript}
            onAITranscript={onAITranscript}
            onQuestionDone={onQuestionDone}
            onCheckInComplete={onCheckInComplete}
            onDisconnect={onVoiceDisconnect}
            onError={onVoiceError}
            disabled={isProcessing}
            isFullscreen={isFullscreen}
          />
        </div>

        <Separator className="my-3 bg-stone-200" />

        {/* Text Input - matching reference image */}
        <div className="space-y-2">
          <div className="relative flex items-center bg-white border border-stone-300 rounded-2xl px-4 py-3 shadow-sm">
            <Mic className="w-5 h-5 text-stone-400 mr-3 shrink-0" />
            <Textarea
              value={currentAnswer}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="Type your response..."
              className="bg-transparent border-0 resize-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 p-0 text-base text-stone-800 placeholder:text-stone-400 flex-1 min-h-[24px] max-h-[120px]"
              onKeyDown={(e) => { 
                if (e.key === 'Enter' && !e.shiftKey) { 
                  e.preventDefault(); 
                  handleTextSubmit() 
                } 
              }}
            />
            <button
              onClick={handleTextSubmit}
              disabled={!currentAnswer.trim() || isProcessing}
              className="ml-3 w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all hover:opacity-90"
              style={{ backgroundColor: '#B85C14' }}
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              ) : (
                <Send className="w-4 h-4 text-white" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
