package backend.WF.contract;

import backend.WF.common.BaseEntity;
import backend.WF.skill.Skill;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "contract_requirements")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ContractRequirement extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "contract_id", nullable = false)
    private Contract contract;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "skill_id", nullable = false)
    private Skill skill;

    @Column(name = "required_employee_count", nullable = false)
    private int requiredEmployeeCount;

    @Column(name = "hourly_rate", nullable = false, precision = 10, scale = 2)
    private BigDecimal hourlyRate;

    @Column(name = "expected_hours_per_day", nullable = false, precision = 5, scale = 2)
    private BigDecimal expectedHoursPerDay;

    @Column(name = "min_proficiency", nullable = false)
    @Builder.Default
    private int minProficiency = 1;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Column(name = "fulfilled_count", nullable = false)
    @Builder.Default
    private int fulfilledCount = 0;

    public boolean isFullyFulfilled() {
        return fulfilledCount >= requiredEmployeeCount;
    }

    public int remainingSlots() {
        return requiredEmployeeCount - fulfilledCount;
    }
}
