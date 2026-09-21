package backend.WF.company;

import backend.WF.common.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "client_companies")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ClientCompany extends BaseEntity {

    @Column(unique = true, nullable = false)
    private String name;

    @Column(name = "contact_email")
    private String contactEmail;

    @Column(name = "contact_phone", length = 20)
    private String contactPhone;

    private String address;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
