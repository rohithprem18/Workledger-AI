package backend.WF.security;

import jakarta.persistence.*;
import lombok.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "token_blacklist", indexes = {
        @Index(name = "idx_token_blacklist_expires", columnList = "expires_at"),
        @Index(name = "idx_token_blacklist_username", columnList = "username"),
        @Index(name = "idx_token_blacklist_jti", columnList = "token_jti")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TokenBlacklist {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "token_jti", nullable = false, unique = true, length = 255)
    private String tokenJti;

    @Column(name = "username", nullable = false, length = 100)
    private String username;

    @Column(name = "blacklisted_at", nullable = false)
    private OffsetDateTime blacklistedAt;

    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;
}
