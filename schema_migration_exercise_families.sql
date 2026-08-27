-- ============================================================================
-- SQL Schema Migration & Atomic RPC Functions for Exercise Families & Guided Stations
-- Project: Math Educator Pro
-- Engine: PostgreSQL / Supabase / Cloud SQL
-- ============================================================================

-- 1. Table: NewExerciseFamilies (عائلات التمارين)
CREATE TABLE IF NOT EXISTS "NewExerciseFamilies" (
    id BIGSERIAL PRIMARY KEY,
    unit_id BIGINT,
    doc_id BIGINT NOT NULL,
    family_name TEXT NOT NULL,
    target_concepts JSONB NOT NULL DEFAULT '[]'::jsonb,
    lead_exercise_id TEXT,
    has_manual_edits BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index on unit_id and doc_id for fast lookup
CREATE INDEX IF NOT EXISTS idx_exercise_families_doc_id ON "NewExerciseFamilies"(doc_id);
CREATE INDEX IF NOT EXISTS idx_exercise_families_unit_id ON "NewExerciseFamilies"(unit_id);

-- 2. Alter Table: NewExercises (تحديث جدول التمارين لربطه بالعائلة والمفاهيم)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='NewExercises' AND column_name='family_id') THEN
        ALTER TABLE "NewExercises" ADD COLUMN family_id BIGINT REFERENCES "NewExerciseFamilies"(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='NewExercises' AND column_name='is_lead_exercise') THEN
        ALTER TABLE "NewExercises" ADD COLUMN is_lead_exercise BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='NewExercises' AND column_name='primary_concept') THEN
        ALTER TABLE "NewExercises" ADD COLUMN primary_concept TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='NewExercises' AND column_name='secondary_concepts') THEN
        ALTER TABLE "NewExercises" ADD COLUMN secondary_concepts JSONB NOT NULL DEFAULT '[]'::jsonb;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_exercises_family_id ON "NewExercises"(family_id);

-- 3. Table: NewExerciseStations (محطات الحل الموجه 1-4)
CREATE TABLE IF NOT EXISTS "NewExerciseStations" (
    id BIGSERIAL PRIMARY KEY,
    exercise_id TEXT NOT NULL,
    station_order INT NOT NULL CHECK (station_order BETWEEN 1 AND 4),
    title TEXT,
    question_text TEXT NOT NULL,
    choices JSONB DEFAULT '[]'::jsonb,
    correct_choice_index INT,
    hint_text TEXT,
    hint_level1 TEXT,
    hint_level2 TEXT,
    skip_explanation TEXT,
    concept_map TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stations_exercise_id ON "NewExerciseStations"(exercise_id);
CREATE INDEX IF NOT EXISTS idx_stations_order ON "NewExerciseStations"(exercise_id, station_order);

-- ============================================================================
-- 4. Atomic RPC Function: save_exercise_family_atomic
-- Performs an atomic transaction to insert/update a family, assign exercises,
-- and save the 4-stations for each non-lead exercise in one single database call.
-- ============================================================================
CREATE OR REPLACE FUNCTION save_exercise_family_atomic(
    p_doc_id BIGINT,
    p_unit_id BIGINT,
    p_family_name TEXT,
    p_target_concepts JSONB,
    p_lead_exercise_id TEXT,
    p_exercises JSONB, -- Array of objects: [{ id, is_lead, primary_concept, secondary_concepts, stations: [...] }]
    p_has_manual_edits BOOLEAN DEFAULT FALSE,
    p_family_id BIGINT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_family_id BIGINT;
    v_ex RECORD;
    v_st RECORD;
BEGIN
    -- 1. Create or Update Family Record
    IF p_family_id IS NOT NULL AND EXISTS (SELECT 1 FROM "NewExerciseFamilies" WHERE id = p_family_id) THEN
        UPDATE "NewExerciseFamilies"
        SET 
            family_name = p_family_name,
            target_concepts = p_target_concepts,
            lead_exercise_id = p_lead_exercise_id,
            has_manual_edits = p_has_manual_edits,
            updated_at = NOW()
        WHERE id = p_family_id;
        v_family_id := p_family_id;
    ELSE
        INSERT INTO "NewExerciseFamilies" (
            doc_id, unit_id, family_name, target_concepts, lead_exercise_id, has_manual_edits, created_at, updated_at
        ) VALUES (
            p_doc_id, p_unit_id, p_family_name, p_target_concepts, p_lead_exercise_id, p_has_manual_edits, NOW(), NOW()
        )
        RETURNING id INTO v_family_id;
    END IF;

    -- 2. Process Exercises & Stations
    FOR v_ex IN SELECT * FROM jsonb_to_recordset(p_exercises) AS x(
        id TEXT,
        is_lead_exercise BOOLEAN,
        primary_concept TEXT,
        secondary_concepts JSONB,
        stations JSONB
    )
    LOOP
        -- Update Exercise Record
        UPDATE "NewExercises"
        SET 
            family_id = v_family_id,
            is_lead_exercise = COALESCE(v_ex.is_lead_exercise, (v_ex.id = p_lead_exercise_id)),
            primary_concept = v_ex.primary_concept,
            secondary_concepts = COALESCE(v_ex.secondary_concepts, '[]'::jsonb)
        WHERE id::TEXT = v_ex.id;

        -- Remove previous stations for this exercise
        DELETE FROM "NewExerciseStations" WHERE exercise_id = v_ex.id;

        -- If not lead exercise, insert stations
        IF NOT COALESCE(v_ex.is_lead_exercise, (v_ex.id = p_lead_exercise_id)) AND v_ex.stations IS NOT NULL THEN
            FOR v_st IN SELECT * FROM jsonb_to_recordset(v_ex.stations) AS s(
                station_order INT,
                title TEXT,
                question_text TEXT,
                choices JSONB,
                correct_choice_index INT,
                hint_text TEXT,
                hint_level1 TEXT,
                hint_level2 TEXT,
                skip_explanation TEXT,
                concept_map TEXT
            )
            LOOP
                INSERT INTO "NewExerciseStations" (
                    exercise_id,
                    station_order,
                    title,
                    question_text,
                    choices,
                    correct_choice_index,
                    hint_text,
                    hint_level1,
                    hint_level2,
                    skip_explanation,
                    concept_map,
                    created_at,
                    updated_at
                ) VALUES (
                    v_ex.id,
                    v_st.station_order,
                    v_st.title,
                    v_st.question_text,
                    COALESCE(v_st.choices, '[]'::jsonb),
                    v_st.correct_choice_index,
                    v_st.hint_text,
                    v_st.hint_level1,
                    v_st.hint_level2,
                    v_st.skip_explanation,
                    v_st.concept_map,
                    NOW(),
                    NOW()
                );
            END LOOP;
        END IF;
    END LOOP;

    RETURN v_family_id;
END;
$$;
