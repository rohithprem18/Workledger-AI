package backend.WF.assignment;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

@Getter
@NoArgsConstructor
public class BulkAssignRequest {

    @NotEmpty(message = "At least one assignment is required")
    @Valid
    private List<BulkAssignItem> assignments;
}
