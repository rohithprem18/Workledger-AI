package backend.WF.company;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface CompanyRepository extends JpaRepository<ClientCompany, UUID> {

    List<ClientCompany> findByActiveTrue();

    boolean existsByNameIgnoreCase(String name);
}
