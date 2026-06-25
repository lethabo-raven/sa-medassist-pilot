ALTER TABLE pharmacies
  ADD COLUMN IF NOT EXISTS registration_number text,
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS manager_name text;

ALTER TABLE pharmacy_employees
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS cellphone text;

CREATE INDEX IF NOT EXISTS idx_pharmacies_status ON pharmacies(status);
CREATE INDEX IF NOT EXISTS idx_pharmacies_province ON pharmacies(province);
CREATE INDEX IF NOT EXISTS idx_pharmacy_employees_role_status ON pharmacy_employees(role, status);
