package backend.WF.security;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Exercises the {@link PasswordStrength} constraint through a standalone Bean
 * Validation factory. Building the validator directly keeps the test hermetic —
 * the constraint is the subject, not Spring's wiring of it.
 */
public class PasswordStrengthValidatorTest {

    private static ValidatorFactory factory;
    private static Validator validator;

    private TestPasswordRequest testRequest;

    @BeforeAll
    public static void initValidator() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    public static void closeValidator() {
        if (factory != null) {
            factory.close();
        }
    }

    @BeforeEach
    public void setUp() {
        testRequest = new TestPasswordRequest();
    }

    private Set<ConstraintViolation<TestPasswordRequest>> validate(String password) {
        testRequest.password = password;
        return validator.validate(testRequest);
    }

    @Test
    public void testStrongPasswordIsValid() {
        assertTrue(validate("StrongPass123!").isEmpty(), "Strong password should be valid");
    }

    @Test
    public void testComplexStrongPassword() {
        assertTrue(validate("MyP@ssw0rd!Secure#2024").isEmpty(), "Complex password should be valid");
    }

    @Test
    public void testPasswordTooShort() {
        assertFalse(validate("Short1!").isEmpty(), "Password shorter than 12 chars should be invalid");
    }

    @Test
    public void testPasswordMissingUppercase() {
        assertFalse(validate("lowercase123!").isEmpty(), "Password without uppercase should be invalid");
    }

    @Test
    public void testPasswordMissingLowercase() {
        assertFalse(validate("UPPERCASE123!").isEmpty(), "Password without lowercase should be invalid");
    }

    @Test
    public void testPasswordMissingDigit() {
        assertFalse(validate("NoDigitsHere!@#").isEmpty(), "Password without digit should be invalid");
    }

    @Test
    public void testPasswordMissingSpecialChar() {
        assertFalse(validate("NoSpecialChar123").isEmpty(), "Password without special char should be invalid");
    }

    @Test
    public void testPasswordWithWhitespaceIsRejected() {
        assertFalse(validate("Has Space123!").isEmpty(), "Password containing whitespace should be invalid");
    }

    @Test
    public void testNullPassword() {
        assertFalse(validate(null).isEmpty(), "Null password should be invalid");
    }

    @Test
    public void testEmptyPassword() {
        assertFalse(validate("").isEmpty(), "Empty password should be invalid");
    }

    /** Carrier for the constraint under test. */
    public static class TestPasswordRequest {
        @PasswordStrength
        public String password;
    }
}
