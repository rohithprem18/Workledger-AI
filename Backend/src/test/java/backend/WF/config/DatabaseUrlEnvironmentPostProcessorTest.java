package backend.WF.config;

import org.junit.jupiter.api.Test;

import java.net.URISyntaxException;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * A wrong answer here means the application starts against the wrong database,
 * or fails to start at all on a platform that is configured correctly — so the
 * URL shapes each provider actually emits are pinned down.
 */
class DatabaseUrlEnvironmentPostProcessorTest {

    @Test
    void convertsARenderStyleUrlToJdbc() throws URISyntaxException {
        Map<String, Object> result = DatabaseUrlEnvironmentPostProcessor
                .parse("postgres://wl_user:s3cret@dpg-abc123.oregon-postgres.render.com/workledger");

        assertEquals("jdbc:postgresql://dpg-abc123.oregon-postgres.render.com:5432/workledger?sslmode=require",
                result.get("spring.datasource.url"));
        assertEquals("wl_user", result.get("spring.datasource.username"));
        assertEquals("s3cret", result.get("spring.datasource.password"));
    }

    @Test
    void honoursAnExplicitPort() throws URISyntaxException {
        Map<String, Object> result = DatabaseUrlEnvironmentPostProcessor
                .parse("postgresql://user:pass@db.internal:6543/appdb");

        assertEquals("jdbc:postgresql://db.internal:6543/appdb?sslmode=require",
                result.get("spring.datasource.url"));
    }

    @Test
    void preservesAQueryStringThatWasAlreadyThere() throws URISyntaxException {
        Map<String, Object> result = DatabaseUrlEnvironmentPostProcessor
                .parse("postgres://user:pass@host/db?sslmode=disable");

        assertEquals("jdbc:postgresql://host:5432/db?sslmode=disable",
                result.get("spring.datasource.url"),
                "An explicit sslmode must not be overwritten with require");
    }

    @Test
    void decodesPercentEncodedCredentials() throws URISyntaxException {
        // Managed providers generate passwords containing reserved characters.
        Map<String, Object> result = DatabaseUrlEnvironmentPostProcessor
                .parse("postgres://user:p%40ss%3Aword@host/db");

        assertEquals("p@ss:word", result.get("spring.datasource.password"));
    }

    @Test
    void handlesAUrlWithNoCredentials() throws URISyntaxException {
        Map<String, Object> result = DatabaseUrlEnvironmentPostProcessor
                .parse("postgres://localhost:5432/workledger");

        assertEquals("jdbc:postgresql://localhost:5432/workledger?sslmode=require",
                result.get("spring.datasource.url"));
        assertFalse(result.containsKey("spring.datasource.username"));
        assertFalse(result.containsKey("spring.datasource.password"));
    }

    @Test
    void rejectsAUrlWithNoHost() {
        assertThrows(IllegalArgumentException.class,
                () -> DatabaseUrlEnvironmentPostProcessor.parse("postgres:///justadatabase"),
                "Silently defaulting to localhost would point production at the wrong database");
    }
}
