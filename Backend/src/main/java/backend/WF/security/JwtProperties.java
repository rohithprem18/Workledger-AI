package backend.WF.security;

import jakarta.annotation.PostConstruct;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "jwt")
@Getter
@Setter
public class JwtProperties {

    private String secret;
    private long expirationMs = 86400000;
    private long accessExpirationMs = 900000;
    private long refreshExpirationMs = 604800000;

    @PostConstruct
    public void validate() {
        if (secret == null || secret.trim().isEmpty()) {
            throw new IllegalArgumentException("JWT secret is required. Set JWT_SECRET env var or jwt.secret in application.yml");
        }
        if (secret.length() < 32) {
            throw new IllegalArgumentException("JWT secret must be at least 32 characters (256 bits)");
        }
        if (expirationMs <= 0 && accessExpirationMs <= 0) {
            throw new IllegalArgumentException("JWT expiration must be positive");
        }
    }
}
