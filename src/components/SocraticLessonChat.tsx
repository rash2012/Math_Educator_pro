import React, { useState, useRef, useEffect } from 'react';
import { 
  Bot, 
  Send, 
  Sparkles, 
  CheckCircle2, 
  XCircle, 
  Lightbulb, 
  RotateCcw, 
  Loader2, 
  HelpCircle, 
  ChevronDown, 
  ChevronUp, 
  Zap, 
  Award,
  BookOpen,
  ArrowLeft,
  ArrowRight,
  PlayCircle
} from 'lucide-react';
import { MathRenderer } from './MathRenderer';
import { 
  askSocraticTutorAI, 
  SOCRATIC_QUICK_PROMPTS, 
  type SocraticContext, 
  type SocraticOption, 
  type SocraticMessageItem,
  type SocraticMode 
} from '../services/socraticTutor';

interface SocraticLessonChatProps {
  context: SocraticContext;
  onMasteryAchieved?: () => void;
  className?: string;
}

export const SocraticLessonChat: React.FC<SocraticLessonChatProps> = ({
  context,
  onMasteryAchieved,
  className = ''
}) => {
  const [messages, setMessages] = useState<SocraticMessageItem[]>([
    {
      id: 'welcome',
      sender: 'tutor',
      text: `مرحباً بك يا بطل الرياضيات! 🎓\nأنا **المعلم السقراطي الذكي** المخصص لفقرة: **"${context.sectionTitle}"**.\n\nسننطلق في حوار استنتاجي ذكي ومدروس لا يتجاوز 4 خطوات تفكيرية، لتفهم وتستنتج الفكرة بنفسك.\n\nاختر أحد المحاور التفاعلية أدناه أو اكتب سؤالك لنبدأ!`,
      timestamp: Date.now()
    }
  ]);

  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeHintIndex, setActiveHintIndex] = useState<number | null>(null);
  const [masteryCount, setMasteryCount] = useState(0);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [currentMode, setCurrentMode] = useState<SocraticMode>('lesson_first_concept');
  const [isConceptCompleted, setIsConceptCompleted] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, isConceptCompleted]);

  // Handle Free-text or Quick Prompt send
  const handleSendMessage = async (textToSend?: string, modeOverride?: SocraticMode) => {
    const text = (textToSend || inputQuery).trim();
    if (!text || isLoading) return;

    const mode: SocraticMode = modeOverride || (textToSend ? 'lesson_first_concept' : 'free_question');
    setCurrentMode(mode);
    setCurrentStep(1);
    setIsConceptCompleted(false);

    const userMsgId = 'usr_' + Date.now();
    const newStudentMsg: SocraticMessageItem = {
      id: userMsgId,
      sender: 'student',
      text,
      stepIndex: 1,
      mode,
      timestamp: Date.now()
    };

    const updatedMessages = [...messages, newStudentMsg];
    setMessages(updatedMessages);
    setInputQuery('');
    setIsLoading(true);

    try {
      const response = await askSocraticTutorAI(
        text,
        context,
        updatedMessages,
        undefined,
        1,
        mode
      );

      const tutorMsgId = 'tut_' + Date.now();
      const newTutorMsg: SocraticMessageItem = {
        id: tutorMsgId,
        sender: 'tutor',
        text: response.message,
        options: response.options,
        hint: response.stepHint,
        stepIndex: response.stepIndex,
        mode,
        timestamp: Date.now()
      };

      setMessages([...updatedMessages, newTutorMsg]);
      setCurrentStep(response.stepIndex);

      if (response.isConceptMastered || response.canShowActionButtons) {
        setIsConceptCompleted(true);
        setMasteryCount(prev => prev + 1);
        onMasteryAchieved?.();
      }
    } catch (error) {
      console.error('Error in Socratic AI interaction:', error);
      const errorMsg: SocraticMessageItem = {
        id: 'err_' + Date.now(),
        sender: 'tutor',
        text: 'حدث خطأ في الاتصال بالمعلم السقراطي. يرجى المحاولة مرة أخرى أو اختيار سؤال آخر.',
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Option Click in Branching Tree
  const handleSelectOption = async (messageIndex: number, option: SocraticOption) => {
    if (isLoading) return;

    const targetMsg = messages[messageIndex];
    if (!targetMsg || targetMsg.selectedOptionId) return; // already answered

    // 1. Mark this option as selected
    const updatedMessages = [...messages];
    updatedMessages[messageIndex] = {
      ...targetMsg,
      selectedOptionId: option.id,
      isCorrectSelection: option.isCorrect,
      feedback: option.feedback
    };
    setMessages(updatedMessages);

    // Increment step
    const nextStep = Math.min((targetMsg.stepIndex || currentStep) + 1, 4);
    setCurrentStep(nextStep);

    // 2. Query Tutor for next scaffolding step based on this selection
    setIsLoading(true);
    try {
      const promptContext = option.isCorrect
        ? `أحسنت! الطالب اختار الإجابة الصحيحة: "${option.text}". عزز إجابته بملاحظة رياضية ذكية ثم اطرح الخطوة التفكيرية التالية (الخطوة ${nextStep} من 4).`
        : `الطالب اختار الإجابة: "${option.text}" وهي غير دقيقة لأن: "${option.feedback}". وجهه بتلميح لطيف ومباشر وصحح المسار (الخطوة ${nextStep} من 4).`;

      const response = await askSocraticTutorAI(
        promptContext,
        context,
        updatedMessages,
        option,
        nextStep,
        currentMode
      );

      const tutorMsgId = 'tut_' + Date.now();
      const newTutorMsg: SocraticMessageItem = {
        id: tutorMsgId,
        sender: 'tutor',
        text: response.message,
        options: response.options,
        hint: response.stepHint,
        stepIndex: response.stepIndex,
        mode: currentMode,
        timestamp: Date.now()
      };

      setMessages([...updatedMessages, newTutorMsg]);

      if (response.isConceptMastered || nextStep >= 4) {
        setIsConceptCompleted(true);
        setMasteryCount(prev => prev + 1);
        onMasteryAchieved?.();
      }
    } catch (error) {
      console.error('Error handling Socratic option selection:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Launch Illustrative Example (Mode: illustrative_example)
  const handleLaunchIllustrativeExample = () => {
    handleSendMessage('قدم لي مثالاً توضيحياً وتطبيقياً مبسطاً للمفهوم السابق الذي شرحته، مع 4 خطوات موجهة لاختبار فهمي.', 'illustrative_example');
  };

  // Continue to Next Concepts (Mode: next_concepts)
  const handleContinueNextConcepts = () => {
    handleSendMessage('تابع شرح المفهوم أو المبرهنة التالية في هذا الدرس بنفس الطريقة التفاعلية عبر 4 خطوات موجهة.', 'next_concepts');
  };

  const handleResetChat = () => {
    setMessages([
      {
        id: 'welcome_reset',
        sender: 'tutor',
        text: `تمت إعادة تهيئة الجلسة السقراطية لفقرة: **"${context.sectionTitle}"**.\nاختر سؤالاً من الأسئلة السريعة أو اكتب مسألتك لننطلق من جديد! 🚀`,
        timestamp: Date.now()
      }
    ]);
    setActiveHintIndex(null);
    setCurrentStep(1);
    setIsConceptCompleted(false);
  };

  return (
    <div className={`flex flex-col bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden ${className}`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-700 via-indigo-700 to-indigo-800 text-white px-4 sm:px-6 py-3.5 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-xs">
            <Bot className="text-amber-300" size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-sm sm:text-base leading-tight">
                المعلم السقراطي الذكي
              </h3>
              <span className="bg-amber-400/20 text-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-300/30">
                حوار تفاعلي موجه (4 خطوات)
              </span>
            </div>
            <p className="text-[11px] text-violet-100 font-medium line-clamp-1 mt-0.5">
              فقرة: {context.sectionTitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Step indicator */}
          <div className="hidden sm:flex items-center gap-1 bg-white/10 border border-white/20 px-2.5 py-1 rounded-lg text-xs font-bold">
            <Zap size={13} className="text-amber-300" />
            <span>خطوة {currentStep} من 4</span>
          </div>

          {masteryCount > 0 && (
            <div className="hidden md:flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs px-2.5 py-1 rounded-lg font-black">
              <Award size={14} className="text-emerald-300" />
              <span>{masteryCount} مفاهيم متقنة</span>
            </div>
          )}
          <button
            onClick={handleResetChat}
            title="إعادة بدء الحوار"
            className="p-1.5 hover:bg-white/15 text-violet-100 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      {/* Quick Prompts Bar */}
      <div className="bg-slate-50/90 border-b border-slate-200 px-3 sm:px-4 py-2 flex items-center gap-1.5 overflow-x-auto hide-scrollbar">
        <span className="text-[11px] font-black text-slate-500 shrink-0 flex items-center gap-1">
          <Sparkles size={12} className="text-violet-600" />
          انطلاقة سريعة:
        </span>
        {SOCRATIC_QUICK_PROMPTS.map(qp => (
          <button
            key={qp.id}
            onClick={() => handleSendMessage(qp.prompt, 'lesson_first_concept')}
            disabled={isLoading}
            className="text-[11px] font-bold text-slate-700 bg-white hover:bg-violet-50 hover:text-violet-700 border border-slate-200 hover:border-violet-300 rounded-lg px-2.5 py-1 transition-all whitespace-nowrap shrink-0 shadow-2xs active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {qp.label}
          </button>
        ))}
      </div>

      {/* Messages Feed */}
      <div 
        ref={chatContainerRef}
        className="flex-1 p-4 sm:p-5 space-y-4 overflow-y-auto max-h-[500px] min-h-[320px] bg-slate-50/40"
      >
        {messages.map((msg, idx) => {
          const isTutor = msg.sender === 'tutor';

          return (
            <div 
              key={msg.id || idx}
              className={`flex gap-3 ${isTutor ? 'items-start' : 'items-start flex-row-reverse'}`}
            >
              {/* Avatar */}
              <div className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center shadow-2xs mt-1 ${
                isTutor 
                  ? 'bg-gradient-to-br from-violet-600 to-indigo-700 text-white' 
                  : 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white font-black text-xs'
              }`}>
                {isTutor ? <Bot size={16} /> : 'ط'}
              </div>

              {/* Bubble & Options */}
              <div className={`flex-1 max-w-[88%] sm:max-w-[80%] space-y-2.5`}>
                <div className={`p-4 rounded-2xl shadow-xs text-sm leading-relaxed ${
                  isTutor 
                    ? 'bg-white border border-slate-200/90 text-slate-900 rounded-tr-xs' 
                    : 'bg-violet-600 text-white rounded-tl-xs'
                }`}>
                  <MathRenderer content={msg.text} />
                </div>

                {/* Socratic Branching Options (if present on this message) */}
                {isTutor && msg.options && msg.options.length > 0 && (
                  <div className="bg-white/90 border border-indigo-100 rounded-xl p-3 space-y-2 shadow-xs">
                    <div className="flex items-center justify-between text-xs font-black text-indigo-950 pb-1 border-b border-indigo-50">
                      <span className="flex items-center gap-1.5">
                        <Zap size={14} className="text-amber-500" />
                        اختر خطوتك التفكيرية القادمة {msg.stepIndex ? `(الخطوة ${msg.stepIndex} من 4)` : ''}:
                      </span>
                      {msg.selectedOptionId && (
                        <span className="text-[11px] text-slate-500 font-bold">
                          تم الاختيار
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {msg.options.map((opt) => {
                        const isSelected = msg.selectedOptionId === opt.id;
                        const isAnswered = Boolean(msg.selectedOptionId);

                        let btnClasses = 'bg-white border-slate-200 text-slate-800 hover:border-violet-400 hover:bg-violet-50/50';

                        if (isAnswered) {
                          if (isSelected) {
                            btnClasses = opt.isCorrect
                              ? 'bg-emerald-50 border-emerald-500 text-emerald-950 ring-2 ring-emerald-400/30'
                              : 'bg-rose-50 border-rose-400 text-rose-950 ring-2 ring-rose-400/30';
                          } else if (opt.isCorrect) {
                            btnClasses = 'bg-emerald-50/40 border-emerald-300 text-emerald-900';
                          } else {
                            btnClasses = 'bg-slate-50 border-slate-200 text-slate-400 opacity-60';
                          }
                        }

                        return (
                          <button
                            key={opt.id}
                            disabled={isAnswered || isLoading}
                            onClick={() => handleSelectOption(idx, opt)}
                            className={`p-2.5 rounded-xl border text-xs sm:text-sm font-bold text-right transition-all flex items-start gap-2 shadow-2xs ${btnClasses} ${
                              !isAnswered ? 'cursor-pointer active:scale-98' : 'cursor-default'
                            }`}
                          >
                            <span className="mt-0.5 shrink-0">
                              {isSelected ? (
                                opt.isCorrect ? (
                                  <CheckCircle2 size={16} className="text-emerald-600" />
                                ) : (
                                  <XCircle size={16} className="text-rose-600" />
                                )
                              ) : (
                                <span className="w-4 h-4 rounded-full border border-slate-300 inline-block" />
                              )}
                            </span>
                            <div className="flex-1">
                              <MathRenderer content={opt.text} />
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Feedback when selected */}
                    {msg.selectedOptionId && msg.feedback && (
                      <div className={`p-2.5 rounded-lg text-xs leading-relaxed mt-2 flex items-start gap-2 ${
                        msg.isCorrectSelection 
                          ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' 
                          : 'bg-amber-50 text-amber-950 border border-amber-200'
                      }`}>
                        {msg.isCorrectSelection ? (
                          <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <Lightbulb size={16} className="text-amber-600 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <span className="font-black block mb-0.5">
                            {msg.isCorrectSelection ? 'رائع جداً!' : 'تشخيص المعلم السقراطي:'}
                          </span>
                          <MathRenderer content={msg.feedback} />
                        </div>
                      </div>
                    )}

                    {/* Step Hint Expander */}
                    {msg.hint && !msg.isCorrectSelection && (
                      <div className="pt-1">
                        <button
                          onClick={() => setActiveHintIndex(activeHintIndex === idx ? null : idx)}
                          className="text-[11px] font-bold text-violet-700 hover:text-violet-900 flex items-center gap-1 cursor-pointer"
                        >
                          <HelpCircle size={13} />
                          {activeHintIndex === idx ? 'إخفاء التلميح المفاهيمي' : 'هل تحتاج إلى تلميح مفاهيمي؟'}
                          {activeHintIndex === idx ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>

                        {activeHintIndex === idx && (
                          <div className="mt-1.5 p-2.5 bg-violet-50/80 border border-violet-200 rounded-lg text-xs text-violet-950">
                            <span className="font-black block mb-0.5">💡 تلميح:</span>
                            <MathRenderer content={msg.hint} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Action Buttons when 4-step Scaffolding is completed */}
        {isConceptCompleted && !isLoading && (
          <div className="bg-gradient-to-r from-violet-50 via-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3 animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <CheckCircle2 size={20} />
              </span>
              <div>
                <h4 className="font-black text-sm text-slate-900">
                  اكتمل توضيح المفهوم بنجاح! 🎯
                </h4>
                <p className="text-xs text-slate-600">
                  ما هي خطوتك التالية مع المعلم السقراطي؟
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {/* Button 1: Illustrative Example */}
              <button
                onClick={handleLaunchIllustrativeExample}
                className="p-3 rounded-xl bg-white hover:bg-amber-50 border border-amber-300 hover:border-amber-400 text-amber-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-2xs hover:shadow-xs active:scale-98 cursor-pointer"
              >
                <Sparkles size={16} className="text-amber-600" />
                <span>🌟 مثال توضيحي للمفهوم السابق</span>
              </button>

              {/* Button 2: Continue to next concepts */}
              <button
                onClick={handleContinueNextConcepts}
                className="p-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-2xs hover:shadow-xs active:scale-98 cursor-pointer"
              >
                <PlayCircle size={16} />
                <span>🚀 متابعة شرح الفقرات الأخرى</span>
              </button>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center gap-3 bg-white border border-slate-200 p-3.5 rounded-2xl w-fit shadow-xs">
            <Loader2 className="animate-spin text-violet-600" size={18} />
            <span className="text-xs font-bold text-slate-600">
              المعلم السقراطي يبني خطوتك التفكيرية...
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="p-3 sm:p-4 bg-white border-t border-slate-200">
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            placeholder="اكتب استفسارك أو مسألتك الرياضية هنا..."
            disabled={isLoading}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!inputQuery.trim() || isLoading}
            className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white p-2.5 rounded-xl shadow-xs transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
            title="إرسال"
          >
            {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
          </button>
        </form>
      </div>
    </div>
  );
};
