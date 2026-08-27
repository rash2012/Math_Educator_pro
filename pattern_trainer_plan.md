1. **State Modifications:**
   - Add state for `hintState` tracking per station: `Record<number, { level: 0|1|2, source: 'voluntary'|'reactive'|null, skipped: boolean }>`
   - Add state for final station data: `finalStationData: { correctFirstTry: boolean, selectedOptionIndex: number | null }`
   - Modify DB interfaces in `src/db/index.ts` to include this tracking data (though the prompt asks to modify local state or save layer, we can add a simple type inside PatternGuidedTrainer.tsx first or adjust the DB type). Actually, I need to look at `src/db/index.ts` to see what `PracticeAttempt` or similar looks like. Oh, wait, the prompt asks to "modify the actual code of the component... and structure of the attempt storage". I'll add an `attemptData` interface and log it/pass it up.
2. **Logic - Hints for Stations 1-3:**
   - Add a button "🔍 أحتاج تلميحاً" next to "تحقق من الإجابة" for stations 0, 1, 2.
   - When button clicked: if level < 2, increment level. If level === 0, source = 'voluntary'.
   - When wrong answer submitted: if level < 2, increment level. If level === 0, source = 'reactive'.
   - Show hint based on level:
     - Level 1: `currentQuestion.hint`
     - Level 2: `currentQuestion.conceptMap` (or split hint into two parts, we need a level 2 hint. If we don't have 2 hints in the schema, we can use `hint` for level 1 and `conceptMap` for level 2, or prompt the AI to generate them. The prompt says "Level 1: conceptual shift... Level 2: bottom-out hint". I'll use `hint` as L1 and `conceptMap` as L2 for now).
   - If level == 2 and another mistake/click happens: show a button "تخطَّ هذه المحطة وشاهد كيف نفكر بها" which skips to next station.
3. **Logic - Final Station 4:**
   - No hint button.
   - When an option is selected -> INSTANTLY verify and SHOW FULL SOLUTION. No retry loop.
   - Show feedback based on correctness.
   - No negative points, but track correctness.
4. **UI Updates:**
   - Show hint boxes based on `hintState[idx].level`.
   - Update final station behavior to skip verify button and auto-submit.
