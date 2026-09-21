package backend.WF.intelligence;

import java.util.List;

/**
 * An engine that proposes contract attributes from document text.
 *
 * <p>Two implementations exist and both always run: a language model for recall
 * on prose that no pattern anticipates, and a pattern matcher that is exact,
 * free and never unavailable. Neither is trusted on its own — see
 * {@link ContractExtractionService} for how their output is merged.
 */
public interface AttributeExtractor {

    /** Recorded on the document so a reviewer knows which engine proposed what. */
    String engineName();

    /** False when the engine cannot run right now (no API key, model disabled). */
    boolean isAvailable();

    /**
     * Proposes candidates. Must not throw: an engine that fails returns an empty
     * list so the other engine's output still reaches the reviewer.
     */
    List<ExtractionCandidate> extract(String sourceText);
}
