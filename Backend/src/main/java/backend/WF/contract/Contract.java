package backend.WF.contract;

import backend.WF.billing.BillingTypeEntity;
import backend.WF.common.BaseEntity;
import backend.WF.company.ClientCompany;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "contracts")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Contract extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", nullable = false)
    private ClientCompany company;

    @Column(nullable = false)
    private String title;

    private String description;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "billing_type_id", nullable = false)
    private BillingTypeEntity billingType;

    public String getBillingCode() {
        return billingType != null ? billingType.getCode() : null;
    }

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    @OneToMany(mappedBy = "contract", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<ContractRequirement> requirements = new ArrayList<>();
}
