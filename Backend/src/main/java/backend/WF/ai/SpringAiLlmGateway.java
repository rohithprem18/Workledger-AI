package backend.WF.ai;

import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * Spring AI backed gateway. Bound to the OpenAI-compatible chat protocol, which
 * every provider worth using on a free tier speaks — Groq, Google Gemini,
 * OpenRouter and a local Ollama are all reachable by pointing
 * {@code spring.ai.openai.base-url} at them and changing the model name.
 */
@Slf4j
@Component
public class SpringAiLlmGateway implements LlmGateway {

    private final ChatClient chatClient;
    private final AiProperties properties;

    public SpringAiLlmGateway(ChatModel chatModel, AiProperties properties) {
        this.chatClient = ChatClient.builder(chatModel).build();
        this.properties = properties;
    }

    @Override
    public boolean isEnabled() {
        return properties.isEnabled();
    }

    @Override
    public String engineLabel() {
        return properties.getEngineLabel();
    }

    @Override
    public Optional<String> complete(String systemPrompt, String userPrompt) {
        if (!properties.isEnabled()) {
            return Optional.empty();
        }
        try {
            String content = chatClient.prompt()
                    .system(systemPrompt)
                    .user(userPrompt)
                    .call()
                    .content();
            return Optional.ofNullable(content).map(String::trim).filter(s -> !s.isEmpty());
        } catch (Exception e) {
            // A model failure must never fail the request that triggered it. The
            // caller falls back to its deterministic path and the run is recorded
            // as having had no model assistance.
            log.warn("Model call failed, falling back to deterministic path: {}", e.getMessage());
            return Optional.empty();
        }
    }

    @Override
    public Optional<String> completeJson(String systemPrompt, String userPrompt) {
        return complete(systemPrompt, userPrompt).map(SpringAiLlmGateway::isolateJsonObject)
                .filter(s -> !s.isBlank());
    }

    /**
     * Models routinely wrap JSON in ``` fences or bracket it with an apology.
     * Take the span from the first brace to its matching close, ignoring braces
     * that appear inside string literals.
     */
    static String isolateJsonObject(String raw) {
        int start = raw.indexOf('{');
        if (start < 0) {
            return "";
        }
        int depth = 0;
        boolean inString = false;
        boolean escaped = false;
        for (int i = start; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (escaped) {
                escaped = false;
                continue;
            }
            if (c == '\\' && inString) {
                escaped = true;
            } else if (c == '"') {
                inString = !inString;
            } else if (!inString && c == '{') {
                depth++;
            } else if (!inString && c == '}') {
                depth--;
                if (depth == 0) {
                    return raw.substring(start, i + 1);
                }
            }
        }
        return "";
    }
}
