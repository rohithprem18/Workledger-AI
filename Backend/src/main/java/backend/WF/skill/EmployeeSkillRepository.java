package backend.WF.skill;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface EmployeeSkillRepository extends JpaRepository<EmployeeSkill, UUID> {

    List<EmployeeSkill> findByEmployeeId(UUID employeeId);

    Optional<EmployeeSkill> findByEmployeeIdAndSkillId(UUID employeeId, UUID skillId);

    boolean existsByEmployeeIdAndSkillId(UUID employeeId, UUID skillId);

    boolean existsByEmployeeIdAndSkillIdAndProficiencyLevelGreaterThanEqual(
            UUID employeeId, UUID skillId, int proficiencyLevel);
}
