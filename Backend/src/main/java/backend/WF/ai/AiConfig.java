package backend.WF.ai;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Optional;

@Configuration
@EnableConfigurationProperties(AiProperties.class)
public class AiConfig {

    /**
     * Stands in when no chat model is on the classpath or none could be
     * auto-configured, so the application context starts and every AI-assisted
     * endpoint keeps working on its deterministic engine alone.
     */
    @Bean
    @org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean(LlmGateway.class)
    public LlmGateway disabledLlmGateway() {
        return new LlmGateway() {
            @Override public boolean isEnabled() { return false; }
            @Override public String engineLabel() { return "disabled"; }
            @Override public Optional<String> complete(String s, String u) { return Optional.empty(); }
            @Override public Optional<String> completeJson(String s, String u) { return Optional.empty(); }
        };
    }
}
