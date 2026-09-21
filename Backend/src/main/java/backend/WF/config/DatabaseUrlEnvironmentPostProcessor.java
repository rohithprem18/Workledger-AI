package backend.WF.config;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.HashMap;
import java.util.Map;

/**
 * Translates a platform-supplied {@code DATABASE_URL} into the JDBC settings
 * Spring expects.
 *
 * <p>Render, Railway, Heroku and Fly all hand a service a URL shaped like
 * {@code postgres://user:password@host:5432/dbname}. Spring cannot open a
 * connection from that, so without this the same deployment that works
 * everywhere else needs the URL split into three variables by hand — and gets
 * it wrong once, silently, at 2am.
 *
 * <p>Runs as an {@link EnvironmentPostProcessor} because the datasource is
 * resolved before any bean exists to fix it up. An explicitly set
 * {@code DB_URL} always wins: this only fills in what was not configured.
 */
public class DatabaseUrlEnvironmentPostProcessor
        implements EnvironmentPostProcessor, Ordered {

    private static final String SOURCE_NAME = "workledger-database-url";

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment,
                                       SpringApplication application) {

        // An operator who set DB_URL meant it; do not second-guess them.
        if (environment.containsProperty("DB_URL")) {
            return;
        }

        String databaseUrl = environment.getProperty("DATABASE_URL");
        if (databaseUrl == null || databaseUrl.isBlank()) {
            return;
        }
        if (databaseUrl.startsWith("jdbc:")) {
            environment.getPropertySources().addFirst(new MapPropertySource(
                    SOURCE_NAME, Map.of("spring.datasource.url", databaseUrl)));
            return;
        }

        try {
            environment.getPropertySources()
                    .addFirst(new MapPropertySource(SOURCE_NAME, parse(databaseUrl)));
        } catch (URISyntaxException | IllegalArgumentException e) {
            // Fail loudly rather than falling back to localhost, which would
            // start the app pointed at a database that is not the real one.
            throw new IllegalStateException(
                    "DATABASE_URL is set but could not be parsed: " + e.getMessage(), e);
        }
    }

    static Map<String, Object> parse(String databaseUrl) throws URISyntaxException {
        URI uri = new URI(databaseUrl);

        String host = uri.getHost();
        if (host == null) {
            throw new IllegalArgumentException("no host in DATABASE_URL");
        }
        int port = uri.getPort() == -1 ? 5432 : uri.getPort();
        String database = uri.getPath() == null ? "" : uri.getPath().replaceFirst("^/", "");

        StringBuilder jdbc = new StringBuilder("jdbc:postgresql://")
                .append(host).append(':').append(port).append('/').append(database);

        // Managed Postgres almost always requires TLS, and the driver does not
        // assume it. Preserve any query string that was already there.
        String query = uri.getQuery();
        jdbc.append('?').append(query == null || query.isBlank() ? "sslmode=require" : query);

        Map<String, Object> properties = new HashMap<>();
        properties.put("spring.datasource.url", jdbc.toString());

        String userInfo = uri.getUserInfo();
        if (userInfo != null && !userInfo.isBlank()) {
            int separator = userInfo.indexOf(':');
            if (separator < 0) {
                properties.put("spring.datasource.username", decode(userInfo));
            } else {
                properties.put("spring.datasource.username", decode(userInfo.substring(0, separator)));
                properties.put("spring.datasource.password", decode(userInfo.substring(separator + 1)));
            }
        }
        return properties;
    }

    private static String decode(String value) {
        return java.net.URLDecoder.decode(value, java.nio.charset.StandardCharsets.UTF_8);
    }

    @Override
    public int getOrder() {
        // After config files are loaded, so an application.yml DB_URL is visible.
        return Ordered.LOWEST_PRECEDENCE;
    }
}
