export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activation_requests: {
        Row: {
          code: string | null
          created_at: string | null
          id: string
          status: string | null
          user_id: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
          user_id?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activation_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_data: {
        Row: {
          analysis_errors: Json | null
          analysis_status: Json | null
          content_id: string
          extracted_text: string | null
          json_data: Json | null
          pdf_url: string | null
        }
        Insert: {
          analysis_errors?: Json | null
          analysis_status?: Json | null
          content_id: string
          extracted_text?: string | null
          json_data?: Json | null
          pdf_url?: string | null
        }
        Update: {
          analysis_errors?: Json | null
          analysis_status?: Json | null
          content_id?: string
          extracted_text?: string | null
          json_data?: Json | null
          pdf_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analysis_data_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: true
            referencedRelation: "curriculum_content"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_content: {
        Row: {
          analysis_data: Json | null
          analysis_errors: Json | null
          analysis_status: Json | null
          book_part: string | null
          clean_text: string | null
          created_at: string | null
          created_by: string | null
          embedding: string | null
          extracted_text: string | null
          grade_level: string | null
          id: string
          is_curriculum: boolean | null
          is_published: boolean | null
          lesson_name: string | null
          order_index: number | null
          parent_id: string | null
          pdf_url: string | null
          raw_exercises: Json | null
          subject: string | null
          title: string
          type: string | null
          unit_name: string | null
          updated_at: string | null
        }
        Insert: {
          analysis_data?: Json | null
          analysis_errors?: Json | null
          analysis_status?: Json | null
          book_part?: string | null
          clean_text?: string | null
          created_at?: string | null
          created_by?: string | null
          embedding?: string | null
          extracted_text?: string | null
          grade_level?: string | null
          id?: string
          is_curriculum?: boolean | null
          is_published?: boolean | null
          lesson_name?: string | null
          order_index?: number | null
          parent_id?: string | null
          pdf_url?: string | null
          raw_exercises?: Json | null
          subject?: string | null
          title: string
          type?: string | null
          unit_name?: string | null
          updated_at?: string | null
        }
        Update: {
          analysis_data?: Json | null
          analysis_errors?: Json | null
          analysis_status?: Json | null
          book_part?: string | null
          clean_text?: string | null
          created_at?: string | null
          created_by?: string | null
          embedding?: string | null
          extracted_text?: string | null
          grade_level?: string | null
          id?: string
          is_curriculum?: boolean | null
          is_published?: boolean | null
          lesson_name?: string | null
          order_index?: number | null
          parent_id?: string | null
          pdf_url?: string | null
          raw_exercises?: Json | null
          subject?: string | null
          title?: string
          type?: string | null
          unit_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_content_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_content_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "curriculum_content"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_paths: {
        Row: {
          created_at: string | null
          grade_level: string | null
          id: string
          level: string | null
          progress: number | null
          subject: string | null
          title: string
          topics: Json | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          grade_level?: string | null
          id?: string
          level?: string | null
          progress?: number | null
          subject?: string | null
          title: string
          topics?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          grade_level?: string | null
          id?: string
          level?: string | null
          progress?: number | null
          subject?: string | null
          title?: string
          topics?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learning_paths_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      NewAIGeneratedDrafts: {
        Row: {
          context: Json
          created_at: string | null
          created_by_user_id: string | null
          draft_type: string
          generated_by_model: string | null
          generated_content: Json
          id: string
          incorporated_into_id: string | null
          incorporated_into_table: string | null
          is_reviewed: boolean | null
          reviewed_at: string | null
          source: string | null
        }
        Insert: {
          context: Json
          created_at?: string | null
          created_by_user_id?: string | null
          draft_type: string
          generated_by_model?: string | null
          generated_content: Json
          id?: string
          incorporated_into_id?: string | null
          incorporated_into_table?: string | null
          is_reviewed?: boolean | null
          reviewed_at?: string | null
          source?: string | null
        }
        Update: {
          context?: Json
          created_at?: string | null
          created_by_user_id?: string | null
          draft_type?: string
          generated_by_model?: string | null
          generated_content?: Json
          id?: string
          incorporated_into_id?: string | null
          incorporated_into_table?: string | null
          is_reviewed?: boolean | null
          reviewed_at?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "NewAIGeneratedDrafts_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      NewCountries: {
        Row: {
          code: string
          id: string
          name: string
        }
        Insert: {
          code: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      NewDocuments: {
        Row: {
          created_at: string | null
          doc_type: string
          families_analysis: string | null
          id: string
          is_published: boolean | null
          lesson_id: string | null
          series_name: string | null
          teacher_name: string | null
          teacher_role: string | null
          title: string
          unit_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          doc_type: string
          families_analysis?: string | null
          id?: string
          is_published?: boolean | null
          lesson_id?: string | null
          series_name?: string | null
          teacher_name?: string | null
          teacher_role?: string | null
          title: string
          unit_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          doc_type?: string
          families_analysis?: string | null
          id?: string
          is_published?: boolean | null
          lesson_id?: string | null
          series_name?: string | null
          teacher_name?: string | null
          teacher_role?: string | null
          title?: string
          unit_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "NewDocuments_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "NewLessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "NewDocuments_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "NewUnits"
            referencedColumns: ["id"]
          },
        ]
      }
      NewExamSummaries: {
        Row: {
          created_at: string | null
          id: string
          injected_test_ids: string[] | null
          is_published: boolean | null
          source_document_ids: string[] | null
          subject_id: string
          summary_text: string
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          injected_test_ids?: string[] | null
          is_published?: boolean | null
          source_document_ids?: string[] | null
          subject_id: string
          summary_text: string
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          injected_test_ids?: string[] | null
          is_published?: boolean | null
          source_document_ids?: string[] | null
          subject_id?: string
          summary_text?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "NewExamSummaries_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "NewSubjects"
            referencedColumns: ["id"]
          },
        ]
      }
      NewExerciseFamilies: {
        Row: {
          created_at: string | null
          document_id: string | null
          family_name: string
          has_manual_edits: boolean | null
          id: string
          is_published: boolean | null
          lead_exercise_id: string | null
          target_concepts: Json | null
          unit_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          document_id?: string | null
          family_name: string
          has_manual_edits?: boolean | null
          id?: string
          is_published?: boolean | null
          lead_exercise_id?: string | null
          target_concepts?: Json | null
          unit_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          document_id?: string | null
          family_name?: string
          has_manual_edits?: boolean | null
          id?: string
          is_published?: boolean | null
          lead_exercise_id?: string | null
          target_concepts?: Json | null
          unit_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_lead_exercise"
            columns: ["lead_exercise_id"]
            isOneToOne: false
            referencedRelation: "NewLessonSectionExercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "NewExerciseFamilies_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "NewDocuments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "NewExerciseFamilies_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "NewUnits"
            referencedColumns: ["id"]
          },
        ]
      }
      NewExercises: {
        Row: {
          document_id: string | null
          id: string
          label: string | null
          main_text: string
          order_index: number
          strategy_text: string | null
          svg_code: string | null
        }
        Insert: {
          document_id?: string | null
          id?: string
          label?: string | null
          main_text: string
          order_index: number
          strategy_text?: string | null
          svg_code?: string | null
        }
        Update: {
          document_id?: string | null
          id?: string
          label?: string | null
          main_text?: string
          order_index?: number
          strategy_text?: string | null
          svg_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "NewExercises_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "NewDocuments"
            referencedColumns: ["id"]
          },
        ]
      }
      NewExerciseStations: {
        Row: {
          choices: Json | null
          concept_map: string | null
          correct_choice_index: number | null
          created_at: string | null
          exercise_id: string | null
          hint_level1: string | null
          hint_level2: string | null
          hint_text: string | null
          id: string
          question_text: string
          skip_explanation: string | null
          station_order: number
          title: string | null
          updated_at: string | null
        }
        Insert: {
          choices?: Json | null
          concept_map?: string | null
          correct_choice_index?: number | null
          created_at?: string | null
          exercise_id?: string | null
          hint_level1?: string | null
          hint_level2?: string | null
          hint_text?: string | null
          id?: string
          question_text: string
          skip_explanation?: string | null
          station_order: number
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          choices?: Json | null
          concept_map?: string | null
          correct_choice_index?: number | null
          created_at?: string | null
          exercise_id?: string | null
          hint_level1?: string | null
          hint_level2?: string | null
          hint_text?: string | null
          id?: string
          question_text?: string
          skip_explanation?: string | null
          station_order?: number
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "NewExerciseStations_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "NewLessonSectionExercises"
            referencedColumns: ["id"]
          },
        ]
      }
      NewExerciseSubQuestions: {
        Row: {
          exercise_id: string | null
          id: string
          order_index: number
          question_svg_code: string | null
          solution: string | null
          solution_svg_code: string | null
          text: string
        }
        Insert: {
          exercise_id?: string | null
          id?: string
          order_index: number
          question_svg_code?: string | null
          solution?: string | null
          solution_svg_code?: string | null
          text: string
        }
        Update: {
          exercise_id?: string | null
          id?: string
          order_index?: number
          question_svg_code?: string | null
          solution?: string | null
          solution_svg_code?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "NewExerciseSubQuestions_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "NewExercises"
            referencedColumns: ["id"]
          },
        ]
      }
      NewGradeLevels: {
        Row: {
          country_id: string | null
          id: string
          name: string
          order_index: number
        }
        Insert: {
          country_id?: string | null
          id?: string
          name: string
          order_index: number
        }
        Update: {
          country_id?: string | null
          id?: string
          name?: string
          order_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "NewGradeLevels_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "NewCountries"
            referencedColumns: ["id"]
          },
        ]
      }
      NewLessons: {
        Row: {
          id: string
          name: string
          order_index: number
          unit_id: string | null
          youtube_url: string | null
        }
        Insert: {
          id?: string
          name: string
          order_index: number
          unit_id?: string | null
          youtube_url?: string | null
        }
        Update: {
          id?: string
          name?: string
          order_index?: number
          unit_id?: string | null
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "NewLessons_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "NewUnits"
            referencedColumns: ["id"]
          },
        ]
      }
      NewLessonSectionExercises: {
        Row: {
          family_id: string | null
          id: string
          is_lead_exercise: boolean | null
          kind: string
          order_index: number
          primary_concept: string | null
          question_text: string
          secondary_concepts: Json | null
          section_id: string | null
          solution_text: string
          strategy_text: string | null
          svg_code: string | null
          title: string
        }
        Insert: {
          family_id?: string | null
          id?: string
          is_lead_exercise?: boolean | null
          kind: string
          order_index: number
          primary_concept?: string | null
          question_text: string
          secondary_concepts?: Json | null
          section_id?: string | null
          solution_text: string
          strategy_text?: string | null
          svg_code?: string | null
          title: string
        }
        Update: {
          family_id?: string | null
          id?: string
          is_lead_exercise?: boolean | null
          kind?: string
          order_index?: number
          primary_concept?: string | null
          question_text?: string
          secondary_concepts?: Json | null
          section_id?: string | null
          solution_text?: string
          strategy_text?: string | null
          svg_code?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "NewLessonSectionExercises_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "NewExerciseFamilies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "NewLessonSectionExercises_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "NewLessonSections"
            referencedColumns: ["id"]
          },
        ]
      }
      NewLessonSections: {
        Row: {
          analysis_additions: Json | null
          analysis_rephrased_content: string | null
          concept_label: string | null
          content: string
          document_id: string | null
          exam_guidance: string | null
          example_text: string | null
          extra_example_text: string | null
          extra_solution_text: string | null
          guidance: string | null
          id: string
          illustrations_label: string | null
          is_practice_only: boolean | null
          notes: string | null
          order_index: number
          practical_section_label: string | null
          practice_section_label: string | null
          solution_text: string | null
          svg_code: string | null
          title: string
          traps: string | null
        }
        Insert: {
          analysis_additions?: Json | null
          analysis_rephrased_content?: string | null
          concept_label?: string | null
          content: string
          document_id?: string | null
          exam_guidance?: string | null
          example_text?: string | null
          extra_example_text?: string | null
          extra_solution_text?: string | null
          guidance?: string | null
          id?: string
          illustrations_label?: string | null
          is_practice_only?: boolean | null
          notes?: string | null
          order_index: number
          practical_section_label?: string | null
          practice_section_label?: string | null
          solution_text?: string | null
          svg_code?: string | null
          title: string
          traps?: string | null
        }
        Update: {
          analysis_additions?: Json | null
          analysis_rephrased_content?: string | null
          concept_label?: string | null
          content?: string
          document_id?: string | null
          exam_guidance?: string | null
          example_text?: string | null
          extra_example_text?: string | null
          extra_solution_text?: string | null
          guidance?: string | null
          id?: string
          illustrations_label?: string | null
          is_practice_only?: boolean | null
          notes?: string | null
          order_index?: number
          practical_section_label?: string | null
          practice_section_label?: string | null
          solution_text?: string | null
          svg_code?: string | null
          title?: string
          traps?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "NewLessonSections_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "NewDocuments"
            referencedColumns: ["id"]
          },
        ]
      }
      NewPastPaperQuestions: {
        Row: {
          id: string
          item_type: string | null
          order_index: number
          paper_id: string | null
          question: string
          solution: string
          solution_svg_code: string | null
          sub_parts: Json | null
          svg_code: string | null
          topic: string | null
        }
        Insert: {
          id?: string
          item_type?: string | null
          order_index: number
          paper_id?: string | null
          question: string
          solution: string
          solution_svg_code?: string | null
          sub_parts?: Json | null
          svg_code?: string | null
          topic?: string | null
        }
        Update: {
          id?: string
          item_type?: string | null
          order_index?: number
          paper_id?: string | null
          question?: string
          solution?: string
          solution_svg_code?: string | null
          sub_parts?: Json | null
          svg_code?: string | null
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "NewPastPaperQuestions_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "NewPastPapers"
            referencedColumns: ["id"]
          },
        ]
      }
      NewPastPapers: {
        Row: {
          created_at: string | null
          exam_year: string
          id: string
          is_published: boolean | null
          subject_id: string
          title: string
        }
        Insert: {
          created_at?: string | null
          exam_year: string
          id?: string
          is_published?: boolean | null
          subject_id: string
          title: string
        }
        Update: {
          created_at?: string | null
          exam_year?: string
          id?: string
          is_published?: boolean | null
          subject_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "NewPastPapers_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "NewSubjects"
            referencedColumns: ["id"]
          },
        ]
      }
      NewPdfContents: {
        Row: {
          document_id: string | null
          id: string
          storage_path: string | null
          structured_content: Json | null
          text_content: string | null
        }
        Insert: {
          document_id?: string | null
          id?: string
          storage_path?: string | null
          structured_content?: Json | null
          text_content?: string | null
        }
        Update: {
          document_id?: string | null
          id?: string
          storage_path?: string | null
          structured_content?: Json | null
          text_content?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "NewPdfContents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "NewDocuments"
            referencedColumns: ["id"]
          },
        ]
      }
      NewQuestionBankItems: {
        Row: {
          ai_guidance: string | null
          bank_id: string | null
          difficulty: number | null
          id: string
          item_type: string | null
          order_index: number
          question: string
          solution: string
          solution_svg_code: string | null
          sub_parts: Json | null
          svg_code: string | null
          topic: string
        }
        Insert: {
          ai_guidance?: string | null
          bank_id?: string | null
          difficulty?: number | null
          id?: string
          item_type?: string | null
          order_index: number
          question: string
          solution: string
          solution_svg_code?: string | null
          sub_parts?: Json | null
          svg_code?: string | null
          topic: string
        }
        Update: {
          ai_guidance?: string | null
          bank_id?: string | null
          difficulty?: number | null
          id?: string
          item_type?: string | null
          order_index?: number
          question?: string
          solution?: string
          solution_svg_code?: string | null
          sub_parts?: Json | null
          svg_code?: string | null
          topic?: string
        }
        Relationships: [
          {
            foreignKeyName: "NewQuestionBankItems_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "NewQuestionBanks"
            referencedColumns: ["id"]
          },
        ]
      }
      NewQuestionBanks: {
        Row: {
          condensed_summary_text: string | null
          created_at: string | null
          document_id: string | null
          id: string
          is_published: boolean | null
          summary_text: string | null
          title: string
          unit_id: string
          updated_at: string | null
        }
        Insert: {
          condensed_summary_text?: string | null
          created_at?: string | null
          document_id?: string | null
          id?: string
          is_published?: boolean | null
          summary_text?: string | null
          title: string
          unit_id: string
          updated_at?: string | null
        }
        Update: {
          condensed_summary_text?: string | null
          created_at?: string | null
          document_id?: string | null
          id?: string
          is_published?: boolean | null
          summary_text?: string | null
          title?: string
          unit_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "NewQuestionBanks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "NewDocuments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "NewQuestionBanks_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "NewUnits"
            referencedColumns: ["id"]
          },
        ]
      }
      NewStudentExerciseAttempts: {
        Row: {
          completed_at: string | null
          exercise_id: string | null
          id: string
          station4_correct_first_try: boolean | null
          station4_selected_option_index: number | null
          stations_data: Json
          total_points_awarded: number | null
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          exercise_id?: string | null
          id?: string
          station4_correct_first_try?: boolean | null
          station4_selected_option_index?: number | null
          stations_data: Json
          total_points_awarded?: number | null
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          exercise_id?: string | null
          id?: string
          station4_correct_first_try?: boolean | null
          station4_selected_option_index?: number | null
          stations_data?: Json
          total_points_awarded?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "NewStudentExerciseAttempts_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "NewLessonSectionExercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "NewStudentExerciseAttempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      NewStudentQuizAttempts: {
        Row: {
          attempted_at: string | null
          id: string
          quiz_id: string | null
          score: number
          user_id: string | null
        }
        Insert: {
          attempted_at?: string | null
          id?: string
          quiz_id?: string | null
          score: number
          user_id?: string | null
        }
        Update: {
          attempted_at?: string | null
          id?: string
          quiz_id?: string | null
          score?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "NewStudentQuizAttempts_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "NewUnitQuizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      NewStudentUnitProgress: {
        Row: {
          completed_section_ids: string[] | null
          id: string
          last_active: string | null
          trainer_points: number | null
          unit_id: string | null
          user_id: string | null
        }
        Insert: {
          completed_section_ids?: string[] | null
          id?: string
          last_active?: string | null
          trainer_points?: number | null
          unit_id?: string | null
          user_id?: string | null
        }
        Update: {
          completed_section_ids?: string[] | null
          id?: string
          last_active?: string | null
          trainer_points?: number | null
          unit_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "NewStudentUnitProgress_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "NewUnits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "NewStudentUnitProgress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      NewSubjects: {
        Row: {
          grade_level_id: string | null
          id: string
          name: string
        }
        Insert: {
          grade_level_id?: string | null
          id?: string
          name: string
        }
        Update: {
          grade_level_id?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "NewSubjects_grade_level_id_fkey"
            columns: ["grade_level_id"]
            isOneToOne: false
            referencedRelation: "NewGradeLevels"
            referencedColumns: ["id"]
          },
        ]
      }
      NewTestCategories: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      NewTestGenerationConfigs: {
        Row: {
          duration_minutes: number | null
          exercises_count: number | null
          exercises_max_sub: number | null
          exercises_min_sub: number | null
          id: string
          is_system_default: boolean | null
          mcq_count: number | null
          name: string | null
          problems_count: number | null
          problems_max_sub: number | null
          problems_min_sub: number | null
          questions_count: number | null
          questions_max_sub: number | null
          questions_min_sub: number | null
        }
        Insert: {
          duration_minutes?: number | null
          exercises_count?: number | null
          exercises_max_sub?: number | null
          exercises_min_sub?: number | null
          id?: string
          is_system_default?: boolean | null
          mcq_count?: number | null
          name?: string | null
          problems_count?: number | null
          problems_max_sub?: number | null
          problems_min_sub?: number | null
          questions_count?: number | null
          questions_max_sub?: number | null
          questions_min_sub?: number | null
        }
        Update: {
          duration_minutes?: number | null
          exercises_count?: number | null
          exercises_max_sub?: number | null
          exercises_min_sub?: number | null
          id?: string
          is_system_default?: boolean | null
          mcq_count?: number | null
          name?: string | null
          problems_count?: number | null
          problems_max_sub?: number | null
          problems_min_sub?: number | null
          questions_count?: number | null
          questions_max_sub?: number | null
          questions_min_sub?: number | null
        }
        Relationships: []
      }
      NewTestQuestions: {
        Row: {
          correct_option_index: number | null
          id: string
          options: Json | null
          order_index: number
          section_id: string | null
          solution: string
          solution_svg_code: string | null
          sub_questions: Json | null
          svg_code: string | null
          text: string
        }
        Insert: {
          correct_option_index?: number | null
          id?: string
          options?: Json | null
          order_index: number
          section_id?: string | null
          solution: string
          solution_svg_code?: string | null
          sub_questions?: Json | null
          svg_code?: string | null
          text: string
        }
        Update: {
          correct_option_index?: number | null
          id?: string
          options?: Json | null
          order_index?: number
          section_id?: string | null
          solution?: string
          solution_svg_code?: string | null
          sub_questions?: Json | null
          svg_code?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "NewTestQuestions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "NewTestSections"
            referencedColumns: ["id"]
          },
        ]
      }
      NewTests: {
        Row: {
          category_id: string | null
          created_at: string | null
          difficulty: string
          estimated_time_minutes: number | null
          id: string
          is_published: boolean | null
          is_reviewed: boolean | null
          review_issues: Json | null
          review_report: string | null
          scope: string
          source_document_ids: string[] | null
          title: string
          topic_label: string | null
          unit_id: string | null
          unit_ids: string[] | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          difficulty: string
          estimated_time_minutes?: number | null
          id?: string
          is_published?: boolean | null
          is_reviewed?: boolean | null
          review_issues?: Json | null
          review_report?: string | null
          scope: string
          source_document_ids?: string[] | null
          title: string
          topic_label?: string | null
          unit_id?: string | null
          unit_ids?: string[] | null
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          difficulty?: string
          estimated_time_minutes?: number | null
          id?: string
          is_published?: boolean | null
          is_reviewed?: boolean | null
          review_issues?: Json | null
          review_report?: string | null
          scope?: string
          source_document_ids?: string[] | null
          title?: string
          topic_label?: string | null
          unit_id?: string | null
          unit_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "NewTests_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "NewTestCategories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "NewTests_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "NewUnits"
            referencedColumns: ["id"]
          },
        ]
      }
      NewTestSections: {
        Row: {
          id: string
          order_index: number
          section_type: string
          test_id: string | null
          title: string
        }
        Insert: {
          id?: string
          order_index: number
          section_type: string
          test_id?: string | null
          title: string
        }
        Update: {
          id?: string
          order_index?: number
          section_type?: string
          test_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "NewTestSections_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "NewTests"
            referencedColumns: ["id"]
          },
        ]
      }
      NewUnitComprehensiveReviews: {
        Row: {
          created_at: string | null
          definitions: Json | null
          document_id: string | null
          formulas_summary: string | null
          id: string
          is_published: boolean | null
          results: Json | null
          summary_text: string
          theorems: Json | null
          title: string
          traps_and_tips: Json | null
          unit_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          definitions?: Json | null
          document_id?: string | null
          formulas_summary?: string | null
          id?: string
          is_published?: boolean | null
          results?: Json | null
          summary_text: string
          theorems?: Json | null
          title: string
          traps_and_tips?: Json | null
          unit_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          definitions?: Json | null
          document_id?: string | null
          formulas_summary?: string | null
          id?: string
          is_published?: boolean | null
          results?: Json | null
          summary_text?: string
          theorems?: Json | null
          title?: string
          traps_and_tips?: Json | null
          unit_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "NewUnitComprehensiveReviews_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "NewDocuments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "NewUnitComprehensiveReviews_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: true
            referencedRelation: "NewUnits"
            referencedColumns: ["id"]
          },
        ]
      }
      NewUnitMindMaps: {
        Row: {
          created_at: string | null
          document_id: string | null
          id: string
          is_published: boolean | null
          markdown_schema: string | null
          svg_code: string
          title: string
          tree_data: Json | null
          unit_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          document_id?: string | null
          id?: string
          is_published?: boolean | null
          markdown_schema?: string | null
          svg_code: string
          title: string
          tree_data?: Json | null
          unit_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          document_id?: string | null
          id?: string
          is_published?: boolean | null
          markdown_schema?: string | null
          svg_code?: string
          title?: string
          tree_data?: Json | null
          unit_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "NewUnitMindMaps_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "NewDocuments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "NewUnitMindMaps_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: true
            referencedRelation: "NewUnits"
            referencedColumns: ["id"]
          },
        ]
      }
      NewUnitQuizQuestions: {
        Row: {
          correct_option_id: string
          difficulty: string | null
          explanation: string | null
          hint: string | null
          id: string
          options: Json
          question_number: number
          question_text: string
          quiz_id: string | null
          topic: string | null
          validation_score: number | null
        }
        Insert: {
          correct_option_id: string
          difficulty?: string | null
          explanation?: string | null
          hint?: string | null
          id?: string
          options: Json
          question_number: number
          question_text: string
          quiz_id?: string | null
          topic?: string | null
          validation_score?: number | null
        }
        Update: {
          correct_option_id?: string
          difficulty?: string | null
          explanation?: string | null
          hint?: string | null
          id?: string
          options?: Json
          question_number?: number
          question_text?: string
          quiz_id?: string | null
          topic?: string | null
          validation_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "NewUnitQuizQuestions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "NewUnitQuizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      NewUnitQuizzes: {
        Row: {
          created_at: string | null
          document_id: string | null
          id: string
          is_published: boolean | null
          is_reviewed: boolean | null
          passing_score: number | null
          title: string
          total_questions: number
          unit_id: string | null
          updated_at: string | null
          validation_score: number | null
        }
        Insert: {
          created_at?: string | null
          document_id?: string | null
          id?: string
          is_published?: boolean | null
          is_reviewed?: boolean | null
          passing_score?: number | null
          title: string
          total_questions: number
          unit_id?: string | null
          updated_at?: string | null
          validation_score?: number | null
        }
        Update: {
          created_at?: string | null
          document_id?: string | null
          id?: string
          is_published?: boolean | null
          is_reviewed?: boolean | null
          passing_score?: number | null
          title?: string
          total_questions?: number
          unit_id?: string | null
          updated_at?: string | null
          validation_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "NewUnitQuizzes_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "NewDocuments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "NewUnitQuizzes_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "NewUnits"
            referencedColumns: ["id"]
          },
        ]
      }
      NewUnits: {
        Row: {
          book_part: string | null
          id: string
          name: string
          order_index: number
          subject_id: string | null
        }
        Insert: {
          book_part?: string | null
          id?: string
          name: string
          order_index: number
          subject_id?: string | null
        }
        Update: {
          book_part?: string | null
          id?: string
          name?: string
          order_index?: number
          subject_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "NewUnits_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "NewSubjects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          analysis_data: Json | null
          analysis_errors: Json | null
          analysis_status: Json | null
          created_at: string | null
          extracted_text: string | null
          file_path: string | null
          id: string
          original_filename: string | null
          status: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          analysis_data?: Json | null
          analysis_errors?: Json | null
          analysis_status?: Json | null
          created_at?: string | null
          extracted_text?: string | null
          file_path?: string | null
          id?: string
          original_filename?: string | null
          status?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          analysis_data?: Json | null
          analysis_errors?: Json | null
          analysis_status?: Json | null
          created_at?: string | null
          extracted_text?: string | null
          file_path?: string | null
          id?: string
          original_filename?: string | null
          status?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      question_banks: {
        Row: {
          book_part: string | null
          created_at: string | null
          created_by: string | null
          embedding: string | null
          grade_level: string | null
          id: string
          is_published: boolean | null
          questions: Json | null
          subject: string | null
          title: string
          unit_name: string | null
          updated_at: string | null
        }
        Insert: {
          book_part?: string | null
          created_at?: string | null
          created_by?: string | null
          embedding?: string | null
          grade_level?: string | null
          id?: string
          is_published?: boolean | null
          questions?: Json | null
          subject?: string | null
          title: string
          unit_name?: string | null
          updated_at?: string | null
        }
        Update: {
          book_part?: string | null
          created_at?: string | null
          created_by?: string | null
          embedding?: string | null
          grade_level?: string | null
          id?: string
          is_published?: boolean | null
          questions?: Json | null
          subject?: string | null
          title?: string
          unit_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_banks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_unit_exercises: {
        Row: {
          created_at: string | null
          curriculum_content_id: string | null
          exercises: Json | null
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          curriculum_content_id?: string | null
          exercises?: Json | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          curriculum_content_id?: string | null
          exercises?: Json | null
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_unit_exercises_curriculum_content_id_fkey"
            columns: ["curriculum_content_id"]
            isOneToOne: false
            referencedRelation: "curriculum_content"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string | null
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string | null
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string | null
        }
        Relationships: []
      }
      study_guides: {
        Row: {
          content: string | null
          created_at: string | null
          id: string
          project_id: string | null
          title: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          id?: string
          project_id?: string | null
          title: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          id?: string
          project_id?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "study_guides_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_guides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tests: {
        Row: {
          book_part: string | null
          content: Json | null
          created_at: string | null
          created_by: string | null
          difficulty: string | null
          estimated_time: number | null
          grade_level: string | null
          id: string
          is_published: boolean | null
          solution: Json | null
          subject: string | null
          title: string
          type: string
          unit_name: string | null
          units: Json | null
          updated_at: string | null
        }
        Insert: {
          book_part?: string | null
          content?: Json | null
          created_at?: string | null
          created_by?: string | null
          difficulty?: string | null
          estimated_time?: number | null
          grade_level?: string | null
          id?: string
          is_published?: boolean | null
          solution?: Json | null
          subject?: string | null
          title: string
          type: string
          unit_name?: string | null
          units?: Json | null
          updated_at?: string | null
        }
        Update: {
          book_part?: string | null
          content?: Json | null
          created_at?: string | null
          created_by?: string | null
          difficulty?: string | null
          estimated_time?: number | null
          grade_level?: string | null
          id?: string
          is_published?: boolean | null
          solution?: Json | null
          subject?: string | null
          title?: string
          type?: string
          unit_name?: string | null
          units?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_exercises: {
        Row: {
          book_part: string | null
          created_at: string | null
          curriculum_content_id: string | null
          extracted_text: string | null
          grade_level: string | null
          id: string
          raw_exercises: Json | null
          subject: string | null
          title: string
          type: string | null
          unit_name: string | null
          updated_at: string | null
        }
        Insert: {
          book_part?: string | null
          created_at?: string | null
          curriculum_content_id?: string | null
          extracted_text?: string | null
          grade_level?: string | null
          id?: string
          raw_exercises?: Json | null
          subject?: string | null
          title: string
          type?: string | null
          unit_name?: string | null
          updated_at?: string | null
        }
        Update: {
          book_part?: string | null
          created_at?: string | null
          curriculum_content_id?: string | null
          extracted_text?: string | null
          grade_level?: string | null
          id?: string
          raw_exercises?: Json | null
          subject?: string | null
          title?: string
          type?: string | null
          unit_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unit_exercises_curriculum_content_id_fkey"
            columns: ["curriculum_content_id"]
            isOneToOne: false
            referencedRelation: "curriculum_content"
            referencedColumns: ["id"]
          },
        ]
      }
      user_progress: {
        Row: {
          content_id: string | null
          created_at: string | null
          id: string
          metadata: Json | null
          score: number | null
          section_id: string | null
          total_questions: number | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          content_id?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          score?: number | null
          section_id?: string | null
          total_questions?: number | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          content_id?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          score?: number | null
          section_id?: string | null
          total_questions?: number | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          account_status: string | null
          activation_code: string | null
          created_at: string | null
          device_id: string | null
          email: string
          expiry_date: string | null
          has_seen_welcome: boolean | null
          id: string
          is_active: boolean | null
          last_active_at: string | null
          last_login: string | null
          name: string
          password: string
          payment_image_url: string | null
          phone: string | null
          role: string | null
          subscription_type: string | null
          total_study_time: number | null
          trial_count: number | null
          upgrade_request: number | null
          upgrade_request_type: string | null
          visit_count: number | null
        }
        Insert: {
          account_status?: string | null
          activation_code?: string | null
          created_at?: string | null
          device_id?: string | null
          email: string
          expiry_date?: string | null
          has_seen_welcome?: boolean | null
          id?: string
          is_active?: boolean | null
          last_active_at?: string | null
          last_login?: string | null
          name: string
          password: string
          payment_image_url?: string | null
          phone?: string | null
          role?: string | null
          subscription_type?: string | null
          total_study_time?: number | null
          trial_count?: number | null
          upgrade_request?: number | null
          upgrade_request_type?: string | null
          visit_count?: number | null
        }
        Update: {
          account_status?: string | null
          activation_code?: string | null
          created_at?: string | null
          device_id?: string | null
          email?: string
          expiry_date?: string | null
          has_seen_welcome?: boolean | null
          id?: string
          is_active?: boolean | null
          last_active_at?: string | null
          last_login?: string | null
          name?: string
          password?: string
          payment_image_url?: string | null
          phone?: string | null
          role?: string | null
          subscription_type?: string | null
          total_study_time?: number | null
          trial_count?: number | null
          upgrade_request?: number | null
          upgrade_request_type?: string | null
          visit_count?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_curriculum: {
        Args: {
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          analysis_data: Json
          extracted_text: string
          id: string
          similarity: number
          subject: string
          title: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
