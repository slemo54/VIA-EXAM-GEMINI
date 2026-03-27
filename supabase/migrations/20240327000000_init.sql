CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create exams table
CREATE TABLE exams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    total_questions INT DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create answer_keys table
CREATE TABLE answer_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
    answers JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create submissions table
CREATE TABLE submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
    student_identifier VARCHAR(255),
    status VARCHAR(50) DEFAULT 'processing',
    original_file_url TEXT,
    annotated_file_url TEXT,
    score NUMERIC(5,2),
    raw_results JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE answer_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- Allow public access for now
CREATE POLICY "Public profiles are viewable by everyone."
  ON exams FOR SELECT
  USING ( true );
CREATE POLICY "Public profiles are insertable by everyone."
  ON exams FOR INSERT
  WITH CHECK ( true );

CREATE POLICY "Public profiles are viewable by everyone."
  ON answer_keys FOR SELECT
  USING ( true );
CREATE POLICY "Public profiles are insertable by everyone."
  ON answer_keys FOR INSERT
  WITH CHECK ( true );

CREATE POLICY "Public profiles are viewable by everyone."
  ON submissions FOR SELECT
  USING ( true );
CREATE POLICY "Public profiles are insertable by everyone."
  ON submissions FOR INSERT
  WITH CHECK ( true );
CREATE POLICY "Public profiles are updateable by everyone."
  ON submissions FOR UPDATE
  USING ( true );
