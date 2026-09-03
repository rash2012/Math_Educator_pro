# مرجع مخطط قاعدة البيانات السحابية (Supabase Database Schema Reference)

تم استخراج وتوثيق هذا المرجع الرسمي من ملف الأنواع `src/types/newSchema.types.ts` المعرّف لكافة جداول وعلاقات قاعدة بيانات المشروع.

---

## 🏛️ 1. الجداول الحديثة (New* Curriculum & System Schema)

| # | الجدول (`Table`) | الغرض الوظيفي | الجدول الأب / المفاتيح الأجنبية (`Foreign Keys`) |
|---|---|---|---|
| 1 | **NewCountries** | الدول والمناهج الوطنية المعتمدة (مثل: سوريا) | - |
| 2 | **NewGradeLevels** | الصفوف والمراحل الدراسية | `NewCountries` (`country_id`) |
| 3 | **NewSubjects** | المواد الدراسية (مثل: الرياضيات) | `NewGradeLevels` (`grade_level_id`) |
| 4 | **NewUnits** | الوحدات الدراسية وأجزاء الكتاب المدرسي | `NewSubjects` (`subject_id`) |
| 5 | **NewLessons** | الدروس التعليمية والفيديوهات المرفقة | `NewUnits` (`unit_id`) |
| 6 | **NewDocuments** | الحاوية المركزية للوثائق والوحدات المعتمدة | `NewUnits` (`unit_id`), `NewLessons` (`lesson_id`) |
| 7 | **NewPdfContents** | النصوص والمراجع ومسارات ملفات PDF التخزينية | `NewDocuments` (`document_id`) |
| 8 | **NewLessonSections** | الفقرات النظرية، التوجيهات، والمطبات الامتحانية | `NewDocuments` (`document_id`) |
| 9 | **NewExerciseFamilies** | عائلات التمارين المصنفة مفاهيمياً والتمرين الرائد | `NewDocuments` (`document_id`), `NewUnits` (`unit_id`), `NewLessonSectionExercises` (`lead_exercise_id`) |
| 10 | **NewLessonSectionExercises** | التمارين والمسائل التطبيقية المرتبطة بالفقرات | `NewLessonSections` (`section_id`), `NewExerciseFamilies` (`family_id`) |
| 11 | **NewExerciseStations** | المحطات التدريبية الأربع للتمارين (المفاهيم، المشتتات، الحل، النمط) | `NewLessonSectionExercises` (`exercise_id`) |
| 12 | **NewExercises** | التمارين المستقلة للمستندات والوثائق | `NewDocuments` (`document_id`) |
| 13 | **NewExerciseSubQuestions** | الطلبات والأسئلة الفرعية لتمارين المستندات | `NewExercises` (`exercise_id`) |
| 14 | **NewUnitComprehensiveReviews** | المراجعة الشاملة للوحدة (مبرهنات، تعاريف، نتائج، مطبات) | `NewDocuments` (`document_id`), `NewUnits` (`unit_id`) |
| 15 | **NewUnitMindMaps** | الخرائط الذهنية الشجرية للوحدة وشيفرات SVG | `NewDocuments` (`document_id`), `NewUnits` (`unit_id`) |
| 16 | **NewUnitQuizzes** | اختبارات الوحدات المؤتمتة والشاملة | `NewDocuments` (`document_id`), `NewUnits` (`unit_id`) |
| 17 | **NewUnitQuizQuestions** | أسئلة وخيارات اختبار الوحدة مع أوزان التحقق | `NewUnitQuizzes` (`quiz_id`) |
| 18 | **NewQuestionBanks** | بنوك الأسئلة المصنفة حسب الوحدات والمستندات | `NewDocuments` (`document_id`), `NewUnits` (`unit_id`) |
| 19 | **NewQuestionBankItems** | مفردات وأسئلة بنك الأسئلة الشامل وسلالم التصحيح | `NewQuestionBanks` (`bank_id`) |
| 20 | **NewTestCategories** | تصنيفات وقوالب الاختبارات الامتحانية | - |
| 21 | **NewTestGenerationConfigs** | إعدادات ومعايير التوليد الآلي للاختبارات | - |
| 22 | **NewTests** | النماذج الامتحانية والاختبارات المعتمدة وتقارير التدقيق | `NewTestCategories` (`category_id`), `NewUnits` (`unit_id`) |
| 23 | **NewTestSections** | أقسام الاختبار (أسئلة عامة، تمارين، مسائل) | `NewTests` (`test_id`) |
| 24 | **NewTestQuestions** | أسئلة الاختبارات والخيارات وسلالم التصحيح | `NewTestSections` (`section_id`) |
| 25 | **NewExamSummaries** | ملخصات المراجعة الامتحانية الشاملة للمادة | `NewSubjects` (`subject_id`) |
| 26 | **NewPastPapers** | أسئلة الدورات الامتحانية الوزارية السابقة | `NewSubjects` (`subject_id`) |
| 27 | **NewPastPaperQuestions** | أسئلة وسلالم تصحيح الدورات السابقة | `NewPastPapers` (`paper_id`) |
| 28 | **NewAIGeneratedDrafts** | مسودات الذكاء الاصطناعي الواردة من تطبيق الأندرويد قيد المراجعة | `users` (`created_by_user_id`) |
| 29 | **NewStudentUnitProgress** | تقدم الطالب ونقاطه في الوحدة والفقرات المكتملة | `users` (`user_id`), `NewUnits` (`unit_id`) |
| 30 | **NewStudentExerciseAttempts** | سجل محاولات الطالب وإجابات المحطة الرابعة ونقاط الميدان | `users` (`user_id`), `NewLessonSectionExercises` (`exercise_id`) |
| 31 | **NewStudentQuizAttempts** | درجات ونتائج محاولات الطلاب في اختبارات الوحدات | `users` (`user_id`), `NewUnitQuizzes` (`quiz_id`) |

---

## 👥 2. جداول المستخدمين والبيانات الإدارية والمشاريع

| # | الجدول (`Table`) | الغرض الوظيفي | المفاتيح الأجنبية (`Foreign Keys`) |
|---|---|---|---|
| 32 | **users** | حسابات الطلاب، المعلمين، المشرفين، والاشتراكات | - |
| 33 | **activation_requests** | طلبات تفعيل وتجديد أكواد الحسابات | `users` (`user_id`) |
| 34 | **site_settings** | إعدادات وتكوينات النظام | - |
| 35 | **projects** | مشاريع تحليل واستخراج الكتب الدراسية | `users` (`user_id`) |
| 36 | **study_guides** | أدلة وموجهات الدراسة | `projects` (`project_id`), `users` (`user_id`) |
| 37 | **learning_paths** | مسارات التعلم التفاعلية | `users` (`user_id`) |
| 38 | **curriculum_content** | المحتوى التعليمي العام | `users` (`created_by`), `curriculum_content` (`parent_id`) |
| 39 | **analysis_data** | بيانات التحليل المستخرجة من PDF | `curriculum_content` (`content_id`) |
| 40 | **unit_exercises** | تمارين الوحدات المستخرجة | `curriculum_content` (`curriculum_content_id`) |
| 41 | **raw_unit_exercises** | مسودة التمارين غير المعالجة | `curriculum_content` (`curriculum_content_id`) |
| 42 | **question_banks** | بنوك الأسئلة العامة | `users` (`created_by`) |
| 43 | **tests** | الاختبارات العامة | `users` (`created_by`) |
| 44 | **user_progress** | سجلات تقدم المستخدمين | `users` (`user_id`) |

---

## 🔒 القيد الصارم وميثاق الأمان الإلزامي (Critical Security & Schema Rules):

1. **حظر الكتابة على الجداول القديمة (Zero-Write Policy on Legacy Tables):**
   - **يُمنع منعاً باتاً** تنفيذ أي عملية تعديل، إضافة، أو حذف (`INSERT`, `UPDATE`, `DELETE`) على جداول الأندرويد القديمة الإنتاجية:
     - `curriculum_content`, `tests`, `question_banks`, `users`, `forum_posts`, `forum_replies`, `activation_requests`, `projects`, `learning_paths`, `study_guides`, `user_progress`, `analysis_data`, `unit_exercises`, `raw_unit_exercises`, `site_settings`.
   - **الاستثناء الوحيد المسموح للقراءة فقط:** قراءة `SELECT` من عمود `users.role` فقط (للتحقق من صلاحيات المدير `admin` عند الحاجة).
   - **حصر عمليات الكتابة:** كافة عمليات الكتابة (`INSERT` / `UPDATE` / `DELETE`) تقتصر **حصراً واستثناءً** على الجداول الحديثة التي تبدأ بـ `New*`.

2. **استخدام العميل المنمط حصراً:**
   - استيراد `supabase` أو `getSupabaseClient()` من `src/services/supabaseClient.ts` في كافة الاستعلامات.

3. **مطابقة أسماء الجداول والأعمدة 100%:**
   - الالتزام الصارم بأسماء الأعمدة ونوعية البيانات (مثل `order_index`, `is_published`, `unit_id`, `document_id`) كما هي معرفة في `newSchema.types.ts`.

