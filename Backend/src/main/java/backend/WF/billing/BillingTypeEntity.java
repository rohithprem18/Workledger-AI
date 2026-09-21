package backend.WF.billing;

import backend.WF.common.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "billing_types")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BillingTypeEntity extends BaseEntity {

    @Column(nullable = false, unique = true, length = 30)
    private String code;

    @Column(nullable = false, length = 100)
    private String label;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
