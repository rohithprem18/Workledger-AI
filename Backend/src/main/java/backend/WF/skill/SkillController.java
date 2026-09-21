package backend.WF.skill;

import backend.WF.common.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class SkillController {

    private final SkillService skillService;

    @PostMapping("/api/skills")
    @PreAuthorize("hasAuthority('MANAGE_SKILLS')")
    public ResponseEntity<ApiResponse<SkillResponse>> createSkill(@Valid @RequestBody SkillCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(skillService.createSkill(request)));
    }

    @GetMapping("/api/skills")
    public ResponseEntity<ApiResponse<List<SkillResponse>>> getAllSkills() {
        return ResponseEntity.ok(ApiResponse.ok(skillService.getAllSkills()));
    }

    @PostMapping("/api/employees/{employeeId}/skills")
    @PreAuthorize("hasAuthority('MANAGE_SKILLS')")
    public ResponseEntity<ApiResponse<SkillResponse>> assignSkill(
            @PathVariable UUID employeeId,
            @Valid @RequestBody AssignSkillRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(skillService.assignSkillToEmployee(employeeId, request)));
    }

    @DeleteMapping("/api/employees/{employeeId}/skills/{skillId}")
    @PreAuthorize("hasAuthority('MANAGE_SKILLS')")
    public ResponseEntity<ApiResponse<Void>> removeSkill(
            @PathVariable UUID employeeId,
            @PathVariable UUID skillId) {
        skillService.removeSkillFromEmployee(employeeId, skillId);
        return ResponseEntity.ok(ApiResponse.ok("Skill removed", null));
    }

    @GetMapping("/api/employees/{employeeId}/skills")
    @PreAuthorize("hasAuthority('VIEW_EMPLOYEES')")
    public ResponseEntity<ApiResponse<List<SkillResponse>>> getEmployeeSkills(@PathVariable UUID employeeId) {
        return ResponseEntity.ok(ApiResponse.ok(skillService.getEmployeeSkills(employeeId)));
    }
}
