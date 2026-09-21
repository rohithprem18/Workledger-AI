package backend.WF.common;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Liveness endpoint for hosting platforms.
 *
 * <p>Unauthenticated on purpose — a health check that needs a token is a health
 * check that reports "unhealthy" the moment authentication breaks, which is
 * exactly when you need the platform to keep the container alive so you can
 * look at it.
 *
 * <p>It touches the database, because an API that cannot reach its database is
 * not serving traffic in any sense that matters. Nothing sensitive is returned.
 */
@RestController
@RequiredArgsConstructor
public class HealthController {

    private final JdbcTemplate jdbcTemplate;

    @Value("${workledger.ai.enabled:false}")
    private boolean aiEnabled;

    @GetMapping("/api/health")
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("service", "workledger-ai");

        boolean databaseUp;
        try {
            jdbcTemplate.queryForObject("SELECT 1", Integer.class);
            databaseUp = true;
        } catch (Exception e) {
            databaseUp = false;
        }

        body.put("status", databaseUp ? "UP" : "DEGRADED");
        body.put("database", databaseUp ? "UP" : "DOWN");
        // Which engines are live, so a deploy can be confirmed without logging in.
        body.put("aiAssist", aiEnabled ? "enabled" : "deterministic-only");

        return databaseUp
                ? ResponseEntity.ok(body)
                : ResponseEntity.status(503).body(body);
    }
}
