import { query } from "../db/pool.js";

export async function enqueueReview({ pharmacyId = null, answerId, reason, question, answer, actor = "anonymous", metadata = {} }) {
  await query(
    `INSERT INTO review_queue (pharmacy_id, answer_id, reason, question, answer, actor, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [pharmacyId, answerId, reason, question, answer, actor, JSON.stringify(metadata)]
  );
}
