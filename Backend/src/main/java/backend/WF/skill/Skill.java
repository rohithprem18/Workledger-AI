package backend.WF.skill;

import backend.WF.common.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "skills")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Skill extends BaseEntity {

    @Column(unique = true, nullable = false, length = 100)
    private String name;

    private String description;
}
