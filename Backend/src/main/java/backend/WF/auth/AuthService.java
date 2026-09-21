package backend.WF.auth;

import backend.WF.security.*;
import backend.WF.exception.EntityNotFoundException;
import backend.WF.employee.Employee;
import backend.WF.employee.EmployeeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final AuthenticationManager authenticationManager;
    private final CustomUserDetailsService userDetailsService;
    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final EmployeeRepository employeeRepository;
    private final TokenBlacklistRepository tokenBlacklistRepository;

    @Transactional(readOnly = true)
    public LoginResponse login(LoginRequest request) {
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getUsername(), request.getPassword()));

        UserDetails userDetails = userDetailsService.loadUserByUsername(request.getUsername());
        String accessToken = jwtService.generateAccessToken(userDetails);
        String refreshToken = jwtService.generateRefreshToken(userDetails);

        User user = userRepository.findByUsername(request.getUsername())
                .orElseThrow(() -> new EntityNotFoundException("User not found: " + request.getUsername()));

        List<String> roles = user.getRoles().stream()
                .map(r -> r.getName())
                .toList();

        List<String> permissions = user.getRoles().stream()
                .flatMap(r -> r.getPermissions().stream())
                .map(p -> p.getCode())
                .distinct()
                .toList();

        String employeeId = null;
        Employee employee = employeeRepository.findByUserId(user.getId()).orElse(null);
        if (employee != null) {
            employeeId = employee.getId().toString();
        }

        return LoginResponse.builder()
                .token(accessToken)
                .refreshToken(refreshToken)
                .username(user.getUsername())
                .employeeId(employeeId)
                .roles(roles)
                .permissions(permissions)
                .build();
    }

    @Transactional
    public void logout(String token) {
        String jti = jwtService.extractJti(token);
        if (jti == null) {
            return;
        }

        String username = jwtService.extractUsername(token);
        Date expiration = jwtService.extractExpiration(token);

        TokenBlacklist blacklistedToken = TokenBlacklist.builder()
                .tokenJti(jti)
                .username(username)
                .blacklistedAt(OffsetDateTime.now())
                .expiresAt(Instant.ofEpochMilli(expiration.getTime()).atOffset(OffsetDateTime.now().getOffset()))
                .build();

        tokenBlacklistRepository.save(blacklistedToken);
    }

    @Transactional(readOnly = true)
    public String refresh(String refreshToken) {
        String username = jwtService.extractUsername(refreshToken);
        UserDetails userDetails = userDetailsService.loadUserByUsername(username);

        if (!jwtService.isRefreshTokenValid(refreshToken, userDetails)) {
            throw new IllegalArgumentException("Invalid or expired refresh token");
        }

        return jwtService.generateAccessToken(userDetails);
    }
}
