const fs = require('fs');
let code = fs.readFileSync('src/components/PatternGuidedTrainer.tsx', 'utf8');

// 1. Add Search Icon to imports
code = code.replace(/import\s*\{([\s\S]*?)HelpCircle/g, "import { $1HelpCircle, Search");

// 2. Add Interfaces
const interfaceInsertion = `
export interface StationAttemptData {
  hint_level_reached: 0 | 1 | 2;
  hint_source: 'voluntary' | 'reactive' | null;
  was_skipped: boolean;
}
export interface AttemptSummary {
  stations_data: Record<number, StationAttemptData>;
  station4_correct_first_try: boolean | null;
  station4_selected_option_index: number | null;
  total_points_awarded: number;
}
`;
code = code.replace("interface PatternGuidedTrainerProps {", interfaceInsertion + "\ninterface PatternGuidedTrainerProps {");

// 3. States
const oldStates = `  const [currentStationIdx, setCurrentStationIdx] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [isCurrentAnswerSubmitted, setIsCurrentAnswerSubmitted] = useState(false);
  const [isCurrentCorrect, setIsCurrentCorrect] = useState<boolean | null>(null);
  const [mistakesCount, setMistakesCount] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [failedFinalAttempt, setFailedFinalAttempt] = useState(false);`;

const newStates = `  const [currentStationIdx, setCurrentStationIdx] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [isCurrentAnswerSubmitted, setIsCurrentAnswerSubmitted] = useState(false);
  const [isCurrentCorrect, setIsCurrentCorrect] = useState<boolean | null>(null);
  const [mistakesCount, setMistakesCount] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [failedFinalAttempt, setFailedFinalAttempt] = useState(false);

  // Attempt Data States
  const [stationsData, setStationsData] = useState<Record<number, StationAttemptData>>({});
  const [station4CorrectFirstTry, setStation4CorrectFirstTry] = useState<boolean | null>(null);
  const [station4SelectedOptionIndex, setStation4SelectedOptionIndex] = useState<number | null>(null);
  const [totalPointsAwarded, setTotalPointsAwarded] = useState(0);`;

code = code.replace(oldStates, newStates);

// 4. resetTrainingSession
const oldReset = `    // Shuffle options for all questions
    const newShuffledMap: Record<string, GuidedOption[]> = {};
    questionsToUse.forEach(q => {
      newShuffledMap[q.id] = shuffleArray(q.options);
    });`;

const newReset = `    // Reset attempt states
    const initialStationsData: Record<number, StationAttemptData> = {};
    questionsToUse.forEach((_, idx) => {
      initialStationsData[idx] = { hint_level_reached: 0, hint_source: null, was_skipped: false };
    });
    setStationsData(initialStationsData);
    setStation4CorrectFirstTry(null);
    setStation4SelectedOptionIndex(null);
    setTotalPointsAwarded(0);

    // Shuffle options for all questions
    const newShuffledMap: Record<string, GuidedOption[]> = {};
    questionsToUse.forEach(q => {
      newShuffledMap[q.id] = shuffleArray(q.options);
    });`;

code = code.replace(oldReset, newReset);

// 5. Handlers
const oldHandlersRegex = /  const handleSelectOption = \([\s\S]*?const handleNextStation = \(\) => \{[\s\S]*?  \};/g;

const newHandlers = `
  const handleHintRequest = (isVoluntary: boolean) => {
    setStationsData(prev => {
      const current = prev[currentStationIdx] || { hint_level_reached: 0, hint_source: null, was_skipped: false };
      if (current.hint_level_reached >= 2 || current.was_skipped) return prev;
      
      const newLevel = (current.hint_level_reached + 1) as 1 | 2;
      const newSource = current.hint_level_reached === 0 ? (isVoluntary ? 'voluntary' : 'reactive') : current.hint_source;
      
      return {
        ...prev,
        [currentStationIdx]: { ...current, hint_level_reached: newLevel, hint_source: newSource }
      };
    });
  };

  const handleSkipStation = () => {
    setStationsData(prev => ({
      ...prev,
      [currentStationIdx]: { ...(prev[currentStationIdx] || {}), was_skipped: true }
    }));
    setIsCurrentAnswerSubmitted(true);
    setIsCurrentCorrect(false); // Mark wrong but skipped
  };

  const calculateAndSetTotalPoints = (finalCorrect: boolean) => {
    let pts = 0;
    Object.keys(stationsData).forEach(key => {
      const st = stationsData[Number(key)];
      if (st.was_skipped) return; 
      if (st.hint_level_reached === 0) pts += 10;
      else if (st.hint_level_reached === 1) pts += 5;
      else if (st.hint_level_reached === 2) pts += 2;
    });
    
    const usedHints = Object.values(stationsData).some(st => st.hint_level_reached > 0);
    if (finalCorrect && !usedHints) {
      pts += 20; // bonus
    } else if (finalCorrect) {
      pts += 10;
    }
    setTotalPointsAwarded(pts);
  };

  const handleSelectOption = (optionId: string) => {
    const currentData = stationsData[currentStationIdx];
    if (isCurrentCorrect === true || currentData?.was_skipped) return;
    
    setSelectedOptionId(optionId);
    
    const isFinalStation = currentQuestion?.isFinalResult || currentStationIdx === guidedQuestions.length - 1;
    if (isFinalStation && currentQuestion) {
      const chosenOption = currentQuestion.options.find(opt => opt.id === optionId);
      const isCorrect = !!chosenOption?.isCorrect;
      const optIndex = currentQuestion.options.findIndex(opt => opt.id === optionId);
      
      if (station4CorrectFirstTry === null) {
        setStation4CorrectFirstTry(isCorrect);
        setStation4SelectedOptionIndex(optIndex);
      }
      
      setIsCurrentAnswerSubmitted(true);
      setIsCurrentCorrect(isCorrect);
      setIsCompleted(true);
      
      calculateAndSetTotalPoints(isCorrect);
    }
  };

  const handleVerifyOption = () => {
    if (!currentQuestion || !selectedOptionId) return;

    const chosenOption = currentQuestion.options.find(opt => opt.id === selectedOptionId);
    const correct = !!chosenOption?.isCorrect;

    if (correct) {
      setIsCurrentAnswerSubmitted(true);
      setIsCurrentCorrect(true);
    } else {
      setMistakesCount(prev => prev + 1);
      setIsCurrentAnswerSubmitted(true);
      setIsCurrentCorrect(false);
      handleHintRequest(false);
    }
  };

  const handleNextStation = () => {
    if (currentStationIdx < guidedQuestions.length - 1) {
      setCurrentStationIdx(prev => prev + 1);
      setSelectedOptionId(null);
      setIsCurrentAnswerSubmitted(false);
      setIsCurrentCorrect(null);
    } else {
      setIsCompleted(true);
    }
  };
`;
code = code.replace(oldHandlersRegex, newHandlers.trim());

// 6. JSX UI Updates
// Find the exact UI chunk we want to replace
const startMarker = '<div className="flex items-center justify-between pt-3 border-t border-slate-100 flex-wrap gap-3">';
const endMarker = '</div>\\s*</div>\\s*</div>';
const uiRegex = new RegExp(startMarker.replace(/[.*+?^$\\{\\}()|[\\]\\\\]/g, '\\\\$&') + '[\\\\s\\\\S]*?' + '(<\\\\/div>\\\\s*<\\\\/div>\\\\s*<\\\\/div>)', 'g');

const newUI = `
                <div className="flex flex-col gap-4 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      {isCurrentCorrect === false && !stationsData[currentStationIdx]?.was_skipped && (
                        <span className="text-xs font-extrabold text-rose-600 flex items-center gap-1.5 animate-fade-in">
                          <XCircle size={15} />
                          إجابة غير صحيحة!
                        </span>
                      )}
                      {isCurrentCorrect === true && (
                        <span className="text-xs font-extrabold text-emerald-700 flex items-center gap-1.5 animate-fade-in">
                          <CheckCircle2 size={15} />
                          {currentQuestion.isFinalResult || currentStationIdx === guidedQuestions.length - 1
                            ? 'أحسنت! هذا بالضبط ما توقعناه ✅'
                            : 'إجابة صحيحة ومتقنة! أحسنت.'}
                        </span>
                      )}
                      {stationsData[currentStationIdx]?.was_skipped && (
                         <span className="text-xs font-extrabold text-slate-600 flex items-center gap-1.5 animate-fade-in">
                          <Compass size={15} />
                          تم التخطي. اقرأ طريقة التفكير الصحيحة للمتابعة.
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mr-auto">
                      {/* Hint Button (stations 1-3 only) */}
                      {!(currentQuestion.isFinalResult || currentStationIdx === guidedQuestions.length - 1) && 
                        stationsData[currentStationIdx]?.hint_level_reached < 2 &&
                        isCurrentCorrect !== true &&
                        !stationsData[currentStationIdx]?.was_skipped && (
                        <button
                          type="button"
                          onClick={() => handleHintRequest(true)}
                          className="px-4 py-2.5 bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 text-xs font-black rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-2"
                        >
                          <Search size={15} />
                          🔍 أحتاج تلميحاً
                        </button>
                      )}

                      {/* Verify Button (stations 1-3 only) */}
                      {!(currentQuestion.isFinalResult || currentStationIdx === guidedQuestions.length - 1) && !isCurrentCorrect && !stationsData[currentStationIdx]?.was_skipped && (
                        <button
                          type="button"
                          disabled={!selectedOptionId}
                          onClick={handleVerifyOption}
                          className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-xs font-black rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
                        >
                          تحقق من الإجابة
                        </button>
                      )}

                      {/* Next Station Button */}
                      {(isCurrentCorrect === true || stationsData[currentStationIdx]?.was_skipped) && !isCompleted && (
                        <button
                          type="button"
                          onClick={handleNextStation}
                          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-xs transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
                        >
                          <span>الانتقال للمحطة التالية</span>
                          <ChevronLeft size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Skip Button after 2 hints (stations 1-3 only) */}
                  {!(currentQuestion.isFinalResult || currentStationIdx === guidedQuestions.length - 1) &&
                   stationsData[currentStationIdx]?.hint_level_reached === 2 &&
                   !isCurrentCorrect && 
                   !stationsData[currentStationIdx]?.was_skipped && (
                    <div className="flex justify-end animate-fade-in pt-2">
                       <button
                          type="button"
                          onClick={handleSkipStation}
                          className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-black rounded-xl shadow-xs transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
                        >
                          <span>تخطَّ هذه المحطة وشاهد كيف نفكر بها</span>
                          <ChevronLeft size={16} />
                        </button>
                    </div>
                  )}

                  {/* Diagnostic / Solution for Final Station (Wrong) */}
                  {(currentQuestion.isFinalResult || currentStationIdx === guidedQuestions.length - 1) && 
                   isCurrentAnswerSubmitted && 
                   isCurrentCorrect === false && (
                     <div className="bg-rose-50/90 border border-rose-200 rounded-xl p-4 text-rose-950 text-xs leading-relaxed space-y-1.5 shadow-xs animate-slide-down">
                        <div className="flex items-center gap-2 font-black text-rose-900">
                          <AlertTriangle size={16} className="text-rose-600" />
                          <span>تشخيص الإجابة:</span>
                        </div>
                        <div className="text-slate-800 pr-6">
                           يبدو أن الخيار الذي حددته يحتوي على انحراف في تطبيق القاعدة الأخيرة. دعنا نرى الحل المفصل.
                        </div>
                     </div>
                  )}

                  {/* Pedagogical Hints & Concept Map */}
                  <div className="space-y-3">
                    {/* Level 1 Hint (Concept Shift) */}
                    {(stationsData[currentStationIdx]?.hint_level_reached >= 1 || stationsData[currentStationIdx]?.was_skipped) && currentQuestion.conceptMap && (
                      <div className="bg-indigo-50/90 border border-indigo-200 rounded-xl p-4 text-indigo-950 text-xs leading-relaxed space-y-1.5 shadow-xs animate-slide-down">
                        <div className="flex items-center gap-2 font-black text-indigo-900">
                          <Compass size={16} className="text-indigo-600" />
                          <span>🗺️ النقلة المفاهيمية (كيف تفكر بها):</span>
                        </div>
                        <div className="text-slate-800 pr-6">
                          <MathRenderer content={currentQuestion.conceptMap} />
                        </div>
                      </div>
                    )}

                    {/* Level 2 Hint (Bottom-out hint) */}
                    {stationsData[currentStationIdx]?.hint_level_reached >= 2 && currentQuestion.hint && !stationsData[currentStationIdx]?.was_skipped && (
                      <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-4 text-amber-950 text-xs leading-relaxed space-y-1.5 shadow-xs animate-slide-down">
                        <div className="flex items-center gap-2 font-black text-amber-900">
                          <Lightbulb size={16} className="text-amber-600" />
                          <span>💡 تلميح قريب من الحل:</span>
                        </div>
                        <div className="text-slate-800 pr-6">
                          <MathRenderer content={currentQuestion.hint} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
`;

code = code.replace(uiRegex, newUI);

fs.writeFileSync('src/components/PatternGuidedTrainer.tsx', code, 'utf8');
console.log('Patched PatternGuidedTrainer.tsx successfully.');
