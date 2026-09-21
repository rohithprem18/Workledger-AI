package backend.WF.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;

@Service
@RequiredArgsConstructor
public class JwtService {

    private final JwtProperties jwtProperties;
    private final TokenBlacklistRepository tokenBlacklistRepository;

    public String generateToken(UserDetails userDetails) {
        return generateToken(new HashMap<>(), userDetails);
    }

    public String generateToken(Map<String, Object> extraClaims, UserDetails userDetails) {
        return generateAccessToken(extraClaims, userDetails);
    }

    public String generateAccessToken(UserDetails userDetails) {
        return generateAccessToken(new HashMap<>(), userDetails);
    }

    public String generateAccessToken(Map<String, Object> extraClaims, UserDetails userDetails) {
        String jti = UUID.randomUUID().toString();
        long nowMs = System.currentTimeMillis();
        long expirationMs = nowMs + jwtProperties.getAccessExpirationMs();

        Map<String, Object> claims = new HashMap<>(extraClaims);
        claims.put("jti", jti);
        claims.put("type", "access");

        return Jwts.builder()
                .claims(claims)
                .subject(userDetails.getUsername())
                .issuedAt(new Date(nowMs))
                .expiration(new Date(expirationMs))
                .signWith(getSigningKey())
                .compact();
    }

    public String generateRefreshToken(UserDetails userDetails) {
        String jti = UUID.randomUUID().toString();
        long nowMs = System.currentTimeMillis();
        long expirationMs = nowMs + jwtProperties.getRefreshExpirationMs();

        Map<String, Object> claims = new HashMap<>();
        claims.put("jti", jti);
        claims.put("type", "refresh");

        return Jwts.builder()
                .claims(claims)
                .subject(userDetails.getUsername())
                .issuedAt(new Date(nowMs))
                .expiration(new Date(expirationMs))
                .signWith(getSigningKey())
                .compact();
    }

    public String extractUsername(String token) {
        return extractClaim(token, Claims::getSubject);
    }

    public String extractJti(String token) {
        return extractClaim(token, claims -> (String) claims.get("jti"));
    }

    public Date extractExpiration(String token) {
        return extractClaim(token, Claims::getExpiration);
    }

    public boolean isTokenValid(String token, UserDetails userDetails) {
        String username = extractUsername(token);
        if (!username.equals(userDetails.getUsername()) || isTokenExpired(token)) {
            return false;
        }

        String jti = extractClaim(token, claims -> (String) claims.get("jti"));
        if (jti != null && tokenBlacklistRepository.existsByTokenJti(jti)) {
            return false;
        }

        return true;
    }

    public boolean isRefreshTokenValid(String token, UserDetails userDetails) {
        String username = extractUsername(token);
        String tokenType = extractClaim(token, claims -> (String) claims.get("type"));

        if (!username.equals(userDetails.getUsername()) || !"refresh".equals(tokenType)) {
            return false;
        }

        if (isTokenExpired(token)) {
            return false;
        }

        String jti = extractClaim(token, claims -> (String) claims.get("jti"));
        return jti == null || !tokenBlacklistRepository.existsByTokenJti(jti);
    }

    private boolean isTokenExpired(String token) {
        return extractExpiration(token).before(new Date());
    }

    private <T> T extractClaim(String token, Function<Claims, T> claimsResolver) {
        Claims claims = extractAllClaims(token);
        return claimsResolver.apply(claims);
    }

    private Claims extractAllClaims(String token) {
        return Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    private SecretKey getSigningKey() {
        byte[] keyBytes = jwtProperties.getSecret().getBytes(StandardCharsets.UTF_8);
        return Keys.hmacShaKeyFor(keyBytes);
    }
}
