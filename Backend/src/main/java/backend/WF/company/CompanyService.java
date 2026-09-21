package backend.WF.company;

import backend.WF.exception.BusinessRuleViolationException;
import backend.WF.exception.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CompanyService {

    private final CompanyRepository companyRepository;

    @Transactional
    public CompanyResponse createCompany(CompanyRequest request) {
        if (companyRepository.existsByNameIgnoreCase(request.getName())) {
            throw new BusinessRuleViolationException("Company already exists: " + request.getName());
        }
        ClientCompany company = ClientCompany.builder()
                .name(request.getName())
                .contactEmail(request.getContactEmail())
                .contactPhone(request.getContactPhone())
                .address(request.getAddress())
                .active(true)
                .build();
        return toResponse(companyRepository.save(company));
    }

    @Transactional
    public CompanyResponse updateCompany(UUID id, CompanyRequest request) {
        ClientCompany company = loadCompany(id);
        company.setName(request.getName());
        company.setContactEmail(request.getContactEmail());
        company.setContactPhone(request.getContactPhone());
        company.setAddress(request.getAddress());
        return toResponse(companyRepository.save(company));
    }

    @Transactional
    public void deactivateCompany(UUID id) {
        ClientCompany company = loadCompany(id);
        company.setActive(false);
        companyRepository.save(company);
    }

    @Transactional(readOnly = true)
    public CompanyResponse getCompany(UUID id) {
        return toResponse(loadCompany(id));
    }

    @Transactional(readOnly = true)
    public List<CompanyResponse> getAllCompanies() {
        return companyRepository.findByActiveTrue().stream()
                .map(this::toResponse)
                .toList();
    }

    public ClientCompany loadCompany(UUID id) {
        return companyRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("ClientCompany", id));
    }

    private CompanyResponse toResponse(ClientCompany c) {
        return CompanyResponse.builder()
                .id(c.getId())
                .name(c.getName())
                .contactEmail(c.getContactEmail())
                .contactPhone(c.getContactPhone())
                .address(c.getAddress())
                .active(c.isActive())
                .build();
    }
}
