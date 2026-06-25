import * as db from "../pool.js";
import { hashSecret } from "../../services/auth.js";

const query = db.query || db.default?.query || db.pool?.query?.bind(db.pool);

if (process.env.DEMO_MODE !== "true") {
  console.error("Refusing to seed demo users unless DEMO_MODE=true.");
  process.exit(1);
}

if (!query) {
  console.error("Database query helper is unavailable.");
  process.exit(1);
}

const pharmacy = {
  id: "PH-SA-0001",
  code: "PH-SA-0001",
  name: "Demo Community Pharmacy",
  tradingName: "Demo Community Pharmacy",
  province: "Gauteng",
  city: "Pretoria",
  country: "South Africa",
  status: "ACTIVE",
};

const users = [
  {
    employeeNumber: "PA001",
    fullName: "Demo Pharmacist Assistant",
    role: "pharmacist_assistant",
    jobTitle: "Pharmacist Assistant",
    pin: "123456",
  },
  {
    employeeNumber: "PH001",
    fullName: "Demo Pharmacist",
    role: "pharmacist",
    jobTitle: "Pharmacist",
    pin: "123456",
  },
  {
    employeeNumber: "PM001",
    fullName: "Demo Pharmacy Manager",
    role: "pharmacy_manager",
    jobTitle: "Pharmacy Manager",
    pin: "123456",
  },
];

async function seed() {
  const { rows: pharmacyRows } = await query(
    `
    INSERT INTO pharmacies (
      pharmacy_id,
      pharmacy_code,
      pharmacy_name,
      trading_name,
      branch_name,
      contact_person,
      province,
      city,
      country,
      status
    )
    VALUES ($1, $2, $3, $4, 'Demo Branch', 'Demo Manager', $5, $6, $7, $8)
    ON CONFLICT (pharmacy_code)
    DO UPDATE SET
      pharmacy_id = EXCLUDED.pharmacy_id,
      pharmacy_name = EXCLUDED.pharmacy_name,
      trading_name = EXCLUDED.trading_name,
      province = EXCLUDED.province,
      city = EXCLUDED.city,
      country = EXCLUDED.country,
      status = EXCLUDED.status,
      updated_at = now()
    RETURNING id
    `,
    [
      pharmacy.id,
      pharmacy.code,
      pharmacy.name,
      pharmacy.tradingName,
      pharmacy.province,
      pharmacy.city,
      pharmacy.country,
      pharmacy.status,
    ],
  );

  const pharmacyId = pharmacyRows[0].id;

  for (const user of users) {
    await query(
      `
      INSERT INTO pharmacy_employees (
        pharmacy_id,
        employee_number,
        full_name,
        job_title,
        role,
        pin_hash,
        must_reset_pin,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, false, 'active')
      ON CONFLICT (pharmacy_id, employee_number)
      DO UPDATE SET
        full_name = EXCLUDED.full_name,
        job_title = EXCLUDED.job_title,
        role = EXCLUDED.role,
        pin_hash = EXCLUDED.pin_hash,
        must_reset_pin = false,
        status = 'active',
        failed_login_count = 0,
        locked_until = NULL,
        updated_at = now()
      `,
      [pharmacyId, user.employeeNumber, user.fullName, user.jobTitle, user.role, hashSecret(user.pin)],
    );
  }

  console.log("Demo users seeded for DEMO-PHARMACY. These accounts are demo-only.");
}

seed()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    db.pool?.end?.();
  });
