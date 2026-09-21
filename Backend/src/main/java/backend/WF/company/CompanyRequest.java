package backend.WF.company;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class CompanyRequest {

    @NotBlank(message = "Company name is required")
    private String name;

    @Email(message = "Invalid contact email")
    private String contactEmail;

    private String contactPhone;
    private String address;
}
