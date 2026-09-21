package backend.WF.security;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface TokenBlacklistRepository extends JpaRepository<TokenBlacklist, UUID> {

    Optional<TokenBlacklist> findByTokenJti(String tokenJti);

    boolean existsByTokenJti(String tokenJti);

    @Modifying
    @Query("DELETE FROM TokenBlacklist t WHERE t.expiresAt < ?1")
    void deleteExpiredTokens(OffsetDateTime now);
}
