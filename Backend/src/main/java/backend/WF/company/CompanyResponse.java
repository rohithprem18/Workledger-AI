package backend.WF.company;

import lombok.Builder;
import lombok.Getter;

import java.util.UUID;

@Getter
@Builder
public class CompanyResponse {

    private UUID id;
    private String name;
    private String contactEmail;
    private String contactPhone;
    private String address;
    private boolean active;
}
