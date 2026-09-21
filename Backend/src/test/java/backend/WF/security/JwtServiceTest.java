package backend.WF.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Token generation and claim extraction are pure logic over a secret and a
 * clock, so this runs as a plain unit test. Booting a Spring context here would
 * make the suite depend on a reachable database to test something that never
 * touches one.
 */
@ExtendWith(MockitoExtension.class)
public class JwtServiceTest {

    private static final String SECRET =
            "404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970";

    @Mock
    private TokenBlacklistRepository tokenBlacklistRepository;

    private JwtService jwtService;
    private UserDetails testUser;

    @BeforeEach
    public void setUp() {
        JwtProperties properties = new JwtProperties();
        properties.setSecret(SECRET);
        properties.setExpirationMs(86_400_000L);
        properties.setAccessExpirationMs(900_000L);
        properties.setRefreshExpirationMs(604_800_000L);
        properties.validate();

        jwtService = new JwtService(properties, tokenBlacklistRepository);

        testUser = User.builder()
                .username("testuser")
                .password("password")
                .authorities("ROLE_USER")
                .build();
    }

    @Test
    public void testGenerateAccessToken() {
        String token = jwtService.generateAccessToken(testUser);
        assertNotNull(token, "Access token should be generated");
        assertFalse(token.isEmpty(), "Token should not be empty");
    }

    @Test
    public void testGenerateRefreshToken() {
        String token = jwtService.generateRefreshToken(testUser);
        assertNotNull(token, "Refresh token should be generated");
        assertFalse(token.isEmpty(), "Token should not be empty");
    }

    @Test
    public void testExtractUsername() {
        String token = jwtService.generateAccessToken(testUser);
        assertEquals("testuser", jwtService.extractUsername(token), "Username should match");
    }

    @Test
    public void testTokenContainsJti() {
        String jti = jwtService.extractJti(jwtService.generateAccessToken(testUser));
        assertNotNull(jti, "Token should contain jti claim");
        assertFalse(jti.isEmpty(), "Jti should not be empty");
    }

    @Test
    public void testAccessAndRefreshTokensHaveDistinctJti() {
        String accessJti = jwtService.extractJti(jwtService.generateAccessToken(testUser));
        String refreshJti = jwtService.extractJti(jwtService.generateRefreshToken(testUser));

        assertNotNull(accessJti, "Access token should have jti");
        assertNotNull(refreshJti, "Refresh token should have jti");
        assertNotEquals(accessJti, refreshJti,
                "Each token needs its own jti so one can be revoked without the other");
    }

    @Test
    public void testExtractExpiration() {
        java.util.Date expiration =
                jwtService.extractExpiration(jwtService.generateAccessToken(testUser));
        assertNotNull(expiration, "Expiration should be extracted");
        assertTrue(expiration.after(new java.util.Date()), "Token should not be expired immediately");
    }

    @Test
    public void testRefreshTokenOutlivesAccessToken() {
        java.util.Date access =
                jwtService.extractExpiration(jwtService.generateAccessToken(testUser));
        java.util.Date refresh =
                jwtService.extractExpiration(jwtService.generateRefreshToken(testUser));

        assertTrue(refresh.after(access),
                "A refresh token must outlive the access token it renews");
    }
}
