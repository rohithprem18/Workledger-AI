package backend.WF.audit;

import backend.WF.common.ApiResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.lang.reflect.Method;
import java.util.UUID;

@Aspect
@Component
@Slf4j
public class AuditAspect {

    private final AuditLogRepository auditLogRepository;
    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    public AuditAspect(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    @Around("@annotation(auditable)")
    public Object auditMethod(ProceedingJoinPoint joinPoint, Auditable auditable) throws Throwable {
        Object result = joinPoint.proceed();

        try {
            UUID userId = resolveCurrentUserId();
            UUID entityId = resolveEntityId(result);
            String newValue = serializeToJson(result);

            AuditLog auditLog = AuditLog.builder()
                    .userId(userId)
                    .action(auditable.action())
                    .entityType(auditable.entityType())
                    .entityId(entityId)
                    .oldValue(null)
                    .newValue(newValue)
                    .build();

            auditLogRepository.save(auditLog);
        } catch (Exception e) {
            log.warn("Failed to write audit log for action={}: {}", auditable.action(), e.getMessage());
        }

        return result;
    }

    private UUID resolveCurrentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) return null;
        // Principal name is the username; we store it as a string
        // For a UUID user ID we'd need to look up the user, but to keep this dependency-free,
        // we store null here and rely on the action/entityType for traceability.
        return null;
    }

    private UUID resolveEntityId(Object result) {
        if (result == null) return null;
        try {
            // Handle ApiResponse<T> wrappers
            if (result instanceof ApiResponse<?> response) {
                Object data = response.getData();
                if (data != null) {
                    Method getId = data.getClass().getMethod("getId");
                    Object id = getId.invoke(data);
                    if (id instanceof UUID uuid) return uuid;
                }
            }
            // Direct DTO with getId()
            Method getId = result.getClass().getMethod("getId");
            Object id = getId.invoke(result);
            if (id instanceof UUID uuid) return uuid;
        } catch (Exception ignored) {
        }
        return null;
    }

    private String serializeToJson(Object obj) {
        if (obj == null) return null;
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (Exception e) {
            return obj.toString();
        }
    }
}
