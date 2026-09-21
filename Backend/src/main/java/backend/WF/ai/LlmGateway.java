package backend.WF.ai;

import java.util.Optional;

/**
 * The single outbound boundary to a language model.
 *
 * <p>Every method returns {@link Optional} rather than throwing: an unavailable,
 * slow, rate-limited or misconfigured model is an ordinary condition here, and
 * callers are required to have a deterministic answer ready regardless. Nothing
 * in the platform blocks on a model reply.
 */
public interface LlmGateway {

    /** True when a model is configured and calls will actually be attempted. */
    boolean isEnabled();

    /** Label identifying the engine that produced a given row, for provenance. */
    String engineLabel();

    /** Free-form completion. Empty when disabled or when the call failed. */
    Optional<String> complete(String systemPrompt, String userPrompt);

    /**
     * Completion constrained to a single JSON object. The implementation strips
     * markdown fences and any prose surrounding the object before returning, so
     * callers receive something they can hand straight to a JSON parser.
     */
    Optional<String> completeJson(String systemPrompt, String userPrompt);
}
