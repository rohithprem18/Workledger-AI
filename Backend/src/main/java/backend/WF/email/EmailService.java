package backend.WF.email;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.Base64;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmailService {

    @Value("${resend.api-key}")
    private String apiKey;

    @Value("${resend.from}")
    private String fromAddress;

    private final RestClient restClient = RestClient.create();

    public void sendInvoiceEmail(String toEmail, String subject, String htmlBody,
                                  byte[] pdfBytes, String attachmentName) {
        Map<String, Object> payload = Map.of(
                "from", fromAddress,
                "to", List.of(toEmail),
                "subject", subject,
                "html", htmlBody,
                "attachments", List.of(Map.of(
                        "filename", attachmentName,
                        "content", Base64.getEncoder().encodeToString(pdfBytes)
                ))
        );

        try {
            restClient.post()
                    .uri("https://api.resend.com/emails")
                    .header("Authorization", "Bearer " + apiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .toBodilessEntity();
            log.info("Invoice email sent to {}", toEmail);
        } catch (Exception e) {
            log.error("Failed to send invoice email to {}: {}", toEmail, e.getMessage());
            throw new RuntimeException("Failed to send invoice email", e);
        }
    }
}
