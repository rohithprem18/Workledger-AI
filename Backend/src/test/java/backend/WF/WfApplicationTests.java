package backend.WF;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * Verifies the whole application context wires up — every bean resolvable, no
 * circular dependency, and the JPA mappings validating against the schema
 * Flyway produces.
 *
 * <p>That last check is the valuable one, and it only means anything against a
 * real PostgreSQL instance: the schema uses {@code JSONB}, {@code TIMESTAMPTZ}
 * and {@code gen_random_uuid()}, none of which an embedded database reproduces
 * faithfully enough for the validation to be worth trusting.
 *
 * <p>So this test runs when a database is pointed at it — CI starts one, see
 * {@code .github/workflows/ci.yml} — and skips otherwise rather than failing a
 * laptop build that has no Postgres running.
 */
@SpringBootTest
@EnabledIfEnvironmentVariable(named = "DB_URL", matches = ".+",
        disabledReason = "Set DB_URL to run the full context test against PostgreSQL")
class WfApplicationTests {

    @Test
    void contextLoads() {
    }
}
