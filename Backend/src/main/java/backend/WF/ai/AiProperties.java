package backend.WF.ai;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuration for the generative layer.
 *
 * <p>The platform is designed to run correctly with the language model switched
 * off: every AI-assisted feature has a deterministic engine behind it, and the
 * model only ever adds explanation or improves recall. {@code enabled=false} is
 * therefore a supported production configuration, not a degraded one.
 */
@Getter
@Setter
@ConfigurationProperties(prefix = "workledger.ai")
public class AiProperties {

    /** Master switch. When false, no outbound model call is ever made. */
    private boolean enabled = false;

    /** Label recorded on rows produced with model assistance, e.g. "groq/llama-3.3-70b". */
    private String engineLabel = "llm";

    /** Contract text beyond this many characters is truncated before prompting. */
    private int maxSourceChars = 24_000;

    /** Give up on a model call after this long and fall back to the deterministic path. */
    private int timeoutSeconds = 60;
}
