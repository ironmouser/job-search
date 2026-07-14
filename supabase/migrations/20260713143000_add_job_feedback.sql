-- Table: job_feedback
CREATE TYPE feedback_status AS ENUM ('like', 'dislike');

CREATE TABLE job_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    feedback_type feedback_status NOT NULL,
    reasons TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(job_id)
);

CREATE INDEX idx_job_feedback_job_id ON job_feedback(job_id);
