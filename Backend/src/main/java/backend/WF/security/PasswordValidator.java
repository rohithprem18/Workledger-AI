package backend.WF.security;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import org.passay.*;

import java.util.Arrays;
import java.util.List;

public class PasswordValidator implements ConstraintValidator<PasswordStrength, String> {

    private static final PasswordValidator INSTANCE = new PasswordValidator();

    @Override
    public void initialize(PasswordStrength annotation) {
    }

    @Override
    public boolean isValid(String password, ConstraintValidatorContext context) {
        if (password == null || password.trim().isEmpty()) {
            addConstraintViolation(context, "Password cannot be empty");
            return false;
        }

        org.passay.PasswordValidator validator = new org.passay.PasswordValidator(Arrays.asList(
                new LengthRule(12, Integer.MAX_VALUE),
                new CharacterRule(EnglishCharacterData.UpperCase, 1),
                new CharacterRule(EnglishCharacterData.LowerCase, 1),
                new CharacterRule(EnglishCharacterData.Digit, 1),
                new CharacterRule(EnglishCharacterData.Special, 1),
                new WhitespaceRule()
        ));

        RuleResult result = validator.validate(new PasswordData(password));

        if (!result.isValid()) {
            context.disableDefaultConstraintViolation();
            List<String> messages = validator.getMessages(result);
            for (String message : messages) {
                addConstraintViolation(context, message);
            }
            return false;
        }

        return true;
    }

    private void addConstraintViolation(ConstraintValidatorContext context, String message) {
        context.buildConstraintViolationWithTemplate(message)
                .addConstraintViolation();
    }
}
