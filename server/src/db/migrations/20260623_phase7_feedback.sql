ALTER TABLE answer_feedback
  ADD COLUMN IF NOT EXISTS response_snapshot text,
  ADD COLUMN IF NOT EXISTS user_role text;

CREATE INDEX IF NOT EXISTS idx_answer_feedback_pharmacy_created ON answer_feedback(pharmacy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_answer_feedback_rating ON answer_feedback(rating);
