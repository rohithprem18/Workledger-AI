package backend.WF.contract;

import lombok.Builder;
import lombok.Getter;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Getter
@Builder
public class ContractResponse {

    private UUID id;
    private UUID companyId;
    private String companyName;
    private String title;
    private String description;
    private UUID billingTypeId;
    private String billingTypeCode;
    private String billingTypeLabel;
    private LocalDate startDate;
    private LocalDate endDate;
    private boolean active;
    private List<RequirementResponse> requirements;
}
