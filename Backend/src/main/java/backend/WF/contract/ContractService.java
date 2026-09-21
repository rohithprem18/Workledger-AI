package backend.WF.contract;

import backend.WF.billing.BillingTypeEntity;
import backend.WF.billing.BillingTypeRepository;
import backend.WF.company.ClientCompany;
import backend.WF.company.CompanyRepository;
import backend.WF.exception.EntityNotFoundException;
import backend.WF.skill.Skill;
import backend.WF.skill.SkillRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ContractService {

    private final ContractRepository contractRepository;
    private final ContractRequirementRepository requirementRepository;
    private final CompanyRepository companyRepository;
    private final SkillRepository skillRepository;
    private final BillingTypeRepository billingTypeRepository;

    @Transactional
    public ContractResponse createContract(ContractCreateRequest request) {
        ClientCompany company = companyRepository.findById(request.getCompanyId())
                .orElseThrow(() -> new EntityNotFoundException("ClientCompany", request.getCompanyId()));

        BillingTypeEntity billingType = billingTypeRepository.findById(request.getBillingTypeId())
                .orElseThrow(() -> new EntityNotFoundException("BillingType", request.getBillingTypeId()));

        Contract contract = Contract.builder()
                .company(company)
                .title(request.getTitle())
                .description(request.getDescription())
                .billingType(billingType)
                .startDate(request.getStartDate())
                .endDate(request.getEndDate())
                .active(true)
                .build();
        contract = contractRepository.save(contract);

        if (request.getRequirements() != null) {
            for (RequirementRequest rr : request.getRequirements()) {
                Skill skill = skillRepository.findById(rr.getSkillId())
                        .orElseThrow(() -> new EntityNotFoundException("Skill", rr.getSkillId()));
                ContractRequirement req = ContractRequirement.builder()
                        .contract(contract)
                        .skill(skill)
                        .requiredEmployeeCount(rr.getRequiredEmployeeCount())
                        .hourlyRate(rr.getHourlyRate())
                        .expectedHoursPerDay(rr.getExpectedHoursPerDay())
                        .minProficiency(rr.getMinProficiency())
                        .startDate(rr.getStartDate())
                        .endDate(rr.getEndDate())
                        .build();
                contract.getRequirements().add(requirementRepository.save(req));
            }
        }

        return toResponse(contract);
    }

    @Transactional(readOnly = true)
    public ContractResponse getContract(UUID id) {
        return toResponse(loadContract(id));
    }

    @Transactional(readOnly = true)
    public List<ContractResponse> getAllContracts() {
        return contractRepository.findByActiveTrue().stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ContractResponse> getContractsByCompany(UUID companyId) {
        return contractRepository.findByCompanyId(companyId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<RequirementResponse> getRequirements(UUID contractId) {
        return requirementRepository.findByContractId(contractId).stream()
                .map(this::toRequirementResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public RequirementResponse getRequirement(UUID requirementId) {
        return toRequirementResponse(requirementRepository.findById(requirementId)
                .orElseThrow(() -> new EntityNotFoundException("ContractRequirement", requirementId)));
    }

    @Transactional
    public RequirementResponse addRequirement(UUID contractId, RequirementRequest request) {
        Contract contract = loadContract(contractId);
        Skill skill = skillRepository.findById(request.getSkillId())
                .orElseThrow(() -> new EntityNotFoundException("Skill", request.getSkillId()));
        ContractRequirement req = ContractRequirement.builder()
                .contract(contract)
                .skill(skill)
                .requiredEmployeeCount(request.getRequiredEmployeeCount())
                .hourlyRate(request.getHourlyRate())
                .expectedHoursPerDay(request.getExpectedHoursPerDay())
                .minProficiency(request.getMinProficiency())
                .startDate(request.getStartDate())
                .endDate(request.getEndDate())
                .build();
        return toRequirementResponse(requirementRepository.save(req));
    }

    public Contract loadContract(UUID id) {
        return contractRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Contract", id));
    }

    public ContractRequirement loadRequirement(UUID id) {
        return requirementRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("ContractRequirement", id));
    }

    private ContractResponse toResponse(Contract c) {
        List<RequirementResponse> reqs = c.getRequirements().stream()
                .map(this::toRequirementResponse)
                .toList();
        BillingTypeEntity bt = c.getBillingType();
        return ContractResponse.builder()
                .id(c.getId())
                .companyId(c.getCompany().getId())
                .companyName(c.getCompany().getName())
                .title(c.getTitle())
                .description(c.getDescription())
                .billingTypeId(bt != null ? bt.getId() : null)
                .billingTypeCode(bt != null ? bt.getCode() : null)
                .billingTypeLabel(bt != null ? bt.getLabel() : null)
                .startDate(c.getStartDate())
                .endDate(c.getEndDate())
                .active(c.isActive())
                .requirements(reqs)
                .build();
    }

    private RequirementResponse toRequirementResponse(ContractRequirement r) {
        return RequirementResponse.builder()
                .id(r.getId())
                .skillId(r.getSkill().getId())
                .skillName(r.getSkill().getName())
                .requiredEmployeeCount(r.getRequiredEmployeeCount())
                .hourlyRate(r.getHourlyRate())
                .expectedHoursPerDay(r.getExpectedHoursPerDay())
                .minProficiency(r.getMinProficiency())
                .startDate(r.getStartDate())
                .endDate(r.getEndDate())
                .fulfilledCount(r.getFulfilledCount())
                .remainingSlots(r.remainingSlots())
                .build();
    }
}
