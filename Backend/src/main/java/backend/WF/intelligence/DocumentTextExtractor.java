package backend.WF.intelligence;

import backend.WF.exception.BusinessRuleViolationException;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfReader;
import com.itextpdf.kernel.pdf.canvas.parser.PdfTextExtractor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.List;

/**
 * Turns an uploaded file into the plain text every later stage reads.
 *
 * <p>Pages are joined with a form feed ({@code \f}) so a character offset can be
 * mapped back to a page number by counting separators before it — that is what
 * lets a citation say "page 3" without storing a per-page index.
 */
@Slf4j
@Component
public class DocumentTextExtractor {

    static final char PAGE_SEPARATOR = '\f';
    private static final long MAX_BYTES = 10L * 1024 * 1024;

    public record ParsedDocument(String text, int pageCount, String checksum) {}

    public ParsedDocument parse(String fileName, String contentType, byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            throw new BusinessRuleViolationException("Uploaded document is empty");
        }
        if (bytes.length > MAX_BYTES) {
            throw new BusinessRuleViolationException(
                    "Document exceeds the 10 MB limit (" + (bytes.length / 1024 / 1024) + " MB)");
        }

        String lower = fileName == null ? "" : fileName.toLowerCase();
        boolean pdf = lower.endsWith(".pdf")
                || "application/pdf".equalsIgnoreCase(contentType);

        String text;
        int pages;
        if (pdf) {
            List<String> pageTexts = readPdfPages(bytes);
            pages = Math.max(pageTexts.size(), 1);
            text = String.join(String.valueOf(PAGE_SEPARATOR), pageTexts);
        } else {
            text = new String(bytes, StandardCharsets.UTF_8);
            pages = 1;
        }

        text = normalizeWhitespace(text);
        if (text.isBlank()) {
            throw new BusinessRuleViolationException(
                    "No readable text found in the document. Scanned images are not supported — "
                    + "upload a text-based PDF, plain text, or Markdown file.");
        }
        return new ParsedDocument(text, pages, sha256(bytes));
    }

    private List<String> readPdfPages(byte[] bytes) {
        List<String> pageTexts = new ArrayList<>();
        try (PdfReader reader = new PdfReader(new ByteArrayInputStream(bytes));
             PdfDocument pdf = new PdfDocument(reader)) {
            for (int i = 1; i <= pdf.getNumberOfPages(); i++) {
                pageTexts.add(PdfTextExtractor.getTextFromPage(pdf.getPage(i)));
            }
        } catch (Exception e) {
            throw new BusinessRuleViolationException("Could not read the PDF: " + e.getMessage());
        }
        return pageTexts;
    }

    /**
     * Collapses runs of spaces and tabs and trims trailing spaces on each line.
     * Citation offsets are taken against this normalized text, so it must be the
     * one and only form ever stored — never re-normalized afterwards.
     */
    static String normalizeWhitespace(String raw) {
        return raw.replace("\r\n", "\n")
                  .replace('\r', '\n')
                  .replaceAll("[ \t]+", " ")
                  .replaceAll(" *\n", "\n")
                  .replaceAll("\n{3,}", "\n\n")
                  .trim();
    }

    static String sha256(byte[] bytes) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder sb = new StringBuilder(64);
            for (byte b : digest) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16));
                sb.append(Character.forDigit(b & 0xF, 16));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
