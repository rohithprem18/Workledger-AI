package backend.WF.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Guards the password-hashing and token-lifetime choices the platform depends
 * on. Both are decided by construction, not by configuration, so this runs
 * without a Spring context.
 */
public class SecurityHardeningTest {

    private PasswordEncoder passwordEncoder;
    private JwtProperties jwtProperties;

    @BeforeEach
    public void setUp() {
        passwordEncoder = new BCryptPasswordEncoder();

        jwtProperties = new JwtProperties();
        jwtProperties.setSecret("404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970");
        jwtProperties.setExpirationMs(86_400_000L);
        jwtProperties.setAccessExpirationMs(900_000L);
        jwtProperties.setRefreshExpirationMs(604_800_000L);
    }

    @Test
    public void testJwtPropertiesValidateSuccessfully() {
        assertDoesNotThrow(() -> jwtProperties.validate());
        assertTrue(jwtProperties.getSecret().length() >= 32, "JWT secret must be at least 32 chars");
        assertTrue(jwtProperties.getExpirationMs() > 0, "Expiration must be positive");
    }

    @Test
    public void testShortJwtSecretIsRejected() {
        JwtProperties weak = new JwtProperties();
        weak.setSecret("too-short");
        assertThrows(IllegalArgumentException.class, weak::validate,
                "A secret under 256 bits must be refused at startup, not accepted quietly");
    }

    @Test
    public void testMissingJwtSecretIsRejected() {
        JwtProperties missing = new JwtProperties();
        assertThrows(IllegalArgumentException.class, missing::validate,
                "Starting with no JWT secret must fail loudly");
    }

    @Test
    public void testBCryptPasswordEncoding() {
        String rawPassword = "TestPassword123!@#";
        String encodedPassword = passwordEncoder.encode(rawPassword);

        assertNotEquals(rawPassword, encodedPassword, "Password should be encoded");
        assertTrue(passwordEncoder.matches(rawPassword, encodedPassword),
                "Encoded password should match raw password");
    }

    @Test
    public void testPasswordEncoderRejectsWrongPassword() {
        String encodedPassword = passwordEncoder.encode("TestPassword123!@#");
        assertFalse(passwordEncoder.matches("WrongPassword123!@#", encodedPassword),
                "Wrong password should not match");
    }

    @Test
    public void testBCryptHashesAreUnique() {
        String password = "TestPassword123!@#";
        String hash1 = passwordEncoder.encode(password);
        String hash2 = passwordEncoder.encode(password);

        assertNotEquals(hash1, hash2,
                "Two hashes of the same password should differ — each carries its own salt");
        assertTrue(passwordEncoder.matches(password, hash1), "Both hashes should match the password");
        assertTrue(passwordEncoder.matches(password, hash2), "Both hashes should match the password");
    }

    @Test
    public void testTokenExpirationTimes() {
        assertEquals(86_400_000L, jwtProperties.getExpirationMs(), "Legacy expiration should be 24 hours");
        assertEquals(900_000L, jwtProperties.getAccessExpirationMs(), "Access token should be 15 minutes");
        assertEquals(604_800_000L, jwtProperties.getRefreshExpirationMs(), "Refresh token should be 7 days");
    }

    @Test
    public void testAccessTokenIsShorterThanRefreshToken() {
        assertTrue(jwtProperties.getAccessExpirationMs() < jwtProperties.getRefreshExpirationMs(),
                "Access token expiration should be shorter than refresh token");
    }
}
