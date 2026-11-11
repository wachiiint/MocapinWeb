BEGIN;
CREATE TABLE patient_profiles (
    account_id bigint PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    full_name text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 1 AND 200),
    phone text NOT NULL UNIQUE CHECK (phone ~ '^0[0-9]{9}$'),
    age_years smallint NOT NULL CHECK (age_years > 0),
    sex text NOT NULL CHECK (sex IN ('male', 'female')),
    height_cm double precision NOT NULL CHECK (height_cm > 0 AND height_cm < 'Infinity'::float8),
    weight_kg double precision NOT NULL CHECK (weight_kg > 0 AND weight_kg < 'Infinity'::float8),
    created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
