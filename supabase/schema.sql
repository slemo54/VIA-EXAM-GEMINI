-- ExamChecker AI Supabase Schema

-- 1. Exams Table
CREATE TABLE IF NOT EXISTS exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  question_count INTEGER DEFAULT 100,
  passing_threshold INTEGER DEFAULT 60,
  penalty NUMERIC(4,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Answer Keys Table (Normalized)
CREATE TABLE IF NOT EXISTS answer_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  question_number INTEGER NOT NULL,
  correct_option TEXT NOT NULL,
  UNIQUE(exam_id, question_number)
);

-- 3. Results Table
CREATE TABLE IF NOT EXISTS results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  candidate_number TEXT NOT NULL,
  score NUMERIC(6,2) NOT NULL,
  total_correct INTEGER DEFAULT 0,
  total_wrong INTEGER DEFAULT 0,
  total_answered INTEGER DEFAULT 0,
  pass_fail BOOLEAN DEFAULT false,
  answers_json JSONB NOT NULL,
  confidence NUMERIC(4,3),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (RLS) - Basic setup for anon access
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE answer_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;

-- Simple policies for anon access (Vercel/Anon Key context)
CREATE POLICY "Allow anon read exams" ON exams FOR SELECT USING (true);
CREATE POLICY "Allow anon insert exams" ON exams FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update exams" ON exams FOR UPDATE USING (true);
CREATE POLICY "Allow anon delete exams" ON exams FOR DELETE USING (true);

CREATE POLICY "Allow anon read answer_keys" ON answer_keys FOR SELECT USING (true);
CREATE POLICY "Allow anon insert answer_keys" ON answer_keys FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon delete answer_keys" ON answer_keys FOR DELETE USING (true);

CREATE POLICY "Allow anon read results" ON results FOR SELECT USING (true);
CREATE POLICY "Allow anon insert results" ON results FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon delete results" ON results FOR DELETE USING (true);
