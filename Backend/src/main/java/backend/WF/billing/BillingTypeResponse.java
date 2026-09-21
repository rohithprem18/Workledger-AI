package backend.WF.billing;

import lombok.Builder;
import lombok.Getter;

import java.util.UUID;

@Getter
@Builder
public class BillingTypeResponse {
    private UUID id;
    private String code;
    private String label;
    private boolean active;
}
