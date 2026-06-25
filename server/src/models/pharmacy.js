import * as db from "../db/pool.js";

const query = db.query || db.default?.query || db.pool?.query?.bind(db.pool);

export async function findPharmacyByPublicId(pharmacyId) {
  const { rows } = await query(
    `
    SELECT id, pharmacy_id, pharmacy_name, trading_name, province, city, country, status, created_at, updated_at
    FROM pharmacies
    WHERE pharmacy_id = $1
    LIMIT 1
    `,
    [pharmacyId],
  );
  return rows[0] || null;
}

export async function createPharmacy({
  pharmacyId,
  pharmacyName,
  tradingName,
  province,
  city,
  country = "South Africa",
  status = "ACTIVE",
}) {
  const { rows } = await query(
    `
    INSERT INTO pharmacies (
      pharmacy_id,
      pharmacy_code,
      pharmacy_name,
      trading_name,
      province,
      city,
      country,
      status
    )
    VALUES ($1, $1, $2, $3, $4, $5, $6, $7)
    RETURNING id, pharmacy_id, pharmacy_name, trading_name, province, city, country, status, created_at, updated_at
    `,
    [pharmacyId, pharmacyName, tradingName || pharmacyName, province || null, city || null, country, status],
  );
  return rows[0];
}
