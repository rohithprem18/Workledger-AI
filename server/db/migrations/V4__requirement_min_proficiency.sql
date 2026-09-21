ALTER TABLE contract_requirements
    ADD COLUMN min_proficiency INT NOT NULL DEFAULT 1
    CHECK (min_proficiency BETWEEN 1 AND 5);
