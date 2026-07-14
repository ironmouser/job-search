-- Initialize the Database Schema for the AI Job Search Agent

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: jobs
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT,
    salary_range TEXT,
    description TEXT,
    requirements TEXT,
    url TEXT UNIQUE NOT NULL,
    source TEXT,
    status TEXT DEFAULT 'discovered' CHECK (status IN ('discovered', 'scored', 'asset_generated', 'applied', 'interviewing', 'rejected', 'offer')),
    applied_at TIMESTAMP WITH TIME ZONE
);

-- Table: opportunity_scores
CREATE TABLE opportunity_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    total_score INTEGER NOT NULL,
    compensation_score INTEGER NOT NULL,
    product_fit_score INTEGER NOT NULL,
    remote_flexibility_score INTEGER NOT NULL,
    ai_maturity_score INTEGER NOT NULL,
    leadership_score INTEGER NOT NULL,
    growth_score INTEGER NOT NULL,
    culture_score INTEGER NOT NULL,
    tech_stack_score INTEGER NOT NULL,
    analysis_notes TEXT
);

-- Table: application_assets
CREATE TABLE application_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    tailored_resume_markdown TEXT,
    cover_letter_markdown TEXT,
    networking_message TEXT,
    portfolio_recommendation TEXT
);

-- Indexes for performance
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_scores_total ON opportunity_scores(total_score DESC);
CREATE INDEX idx_scores_job_id ON opportunity_scores(job_id);
CREATE INDEX idx_assets_job_id ON application_assets(job_id);
