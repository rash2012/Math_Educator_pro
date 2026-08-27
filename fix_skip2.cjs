const fs = require('fs');
let code = fs.readFileSync('src/components/PatternGuidedTrainer.tsx', 'utf8');

const oldSkipCondition = `(isCurrentCorrect === true || stationsData[currentStationIdx]?.was_skipped) && !isCompleted`;
const newSkipCondition = `(isCurrentCorrect === true || stationsData[currentStationIdx]?.was_skipped) && !(currentQuestion.isFinalResult || currentStationIdx === guidedQuestions.length - 1)`;

code = code.replace(oldSkipCondition, newSkipCondition);

const pointsJSX = `
                {/* Attempt Summary */}
                <div className="mt-4 p-4 bg-white/80 rounded-xl border border-emerald-200 text-xs text-emerald-950 leading-relaxed text-right space-y-1">
                  <span className="font-extrabold text-emerald-900 block flex items-center gap-1.5 mb-2">
                    <CheckCircle2 size={14} className="text-emerald-600" />
                    <span>خلاصة محاولتك:</span>
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-500">النقاط المكتسبة: </span>
                      <span className="font-black text-emerald-700">{totalPointsAwarded} نقطة</span>
                    </div>
                    <div>
                      <span className="text-slate-500">سؤال الحسم: </span>
                      <span className="font-black text-emerald-700">{station4CorrectFirstTry ? 'صحيح من المحاولة الأولى' : 'تم استعراض الحل للتصحيح'}</span>
                    </div>
                  </div>
                </div>
`;

code = code.replace('{exercise.strategyText && (', pointsJSX + '\n                {exercise.strategyText && (');
fs.writeFileSync('src/components/PatternGuidedTrainer.tsx', code, 'utf8');
console.log('Fixed final next button & points UI.');
