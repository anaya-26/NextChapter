-- Full-text search over source passages (used for retrieval, citations and syllabus coverage).
-- Queries must use the same expression: to_tsvector('english', "text").
CREATE INDEX "SourceChunk_text_fts_idx" ON "SourceChunk" USING GIN (to_tsvector('english', "text"));
