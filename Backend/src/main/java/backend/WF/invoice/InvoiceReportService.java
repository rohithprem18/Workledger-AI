package backend.WF.invoice;

import backend.WF.employee.Employee;
import backend.WF.exception.EntityNotFoundException;
import backend.WF.worklog.WorkLog;
import backend.WF.worklog.WorkLogRepository;
import backend.WF.worklog.WorkLogSegment;
import com.itextpdf.kernel.colors.ColorConstants;
import com.itextpdf.kernel.colors.DeviceRgb;
import com.itextpdf.kernel.geom.PageSize;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.element.AreaBreak;
import com.itextpdf.layout.element.Cell;
import com.itextpdf.layout.element.Paragraph;
import com.itextpdf.layout.element.Table;
import com.itextpdf.layout.element.Text;
import com.itextpdf.layout.properties.AreaBreakType;
import com.itextpdf.layout.properties.TextAlignment;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class InvoiceReportService {

    private static final DeviceRgb HEADER_BG = new DeviceRgb(30, 64, 175);
    private static final DeviceRgb ALT_BG    = new DeviceRgb(241, 245, 249);
    private static final DeviceRgb TOTAL_BG  = new DeviceRgb(15, 23, 42);
    private static final DeviceRgb LABEL_COLOR = new DeviceRgb(100, 116, 139);
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("dd MMM yyyy");
    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("HH:mm");

    private final InvoiceRepository invoiceRepository;
    private final WorkLogRepository workLogRepository;

    @Transactional(readOnly = true)
    public byte[] generateReport(UUID invoiceId) {
        Invoice invoice = invoiceRepository.findById(invoiceId)
                .orElseThrow(() -> new EntityNotFoundException("Invoice", invoiceId));

        List<WorkLog> allLogs = workLogRepository.findApprovedLogsForContractWithSegments(
                invoice.getContract().getId(), invoice.getPeriodStart(), invoice.getPeriodEnd());

        Map<Employee, List<WorkLog>> byEmployee = allLogs.stream()
                .collect(Collectors.groupingBy(WorkLog::getEmployee,
                        LinkedHashMap::new, Collectors.toList()));

        int totalMinutes = allLogs.stream().mapToInt(WorkLog::getTotalActualMinutes).sum();

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (PdfDocument pdf = new PdfDocument(new PdfWriter(baos));
             Document doc = new Document(pdf, PageSize.A4)) {

            doc.setMargins(40, 40, 40, 40);
            addSummaryPage(doc, invoice, byEmployee, totalMinutes);

            for (Map.Entry<Employee, List<WorkLog>> entry : byEmployee.entrySet()) {
                doc.add(new AreaBreak(AreaBreakType.NEXT_PAGE));
                addEmployeePage(doc, invoice, entry.getKey(), entry.getValue(), totalMinutes);
            }
        } catch (Exception e) {
            throw new RuntimeException("Failed to generate invoice PDF", e);
        }
        return baos.toByteArray();
    }

    private void addSummaryPage(Document doc, Invoice invoice,
                                Map<Employee, List<WorkLog>> byEmployee, int totalMinutes) {
        doc.add(new Paragraph("INVOICE REPORT")
                .setFontSize(22).setBold()
                .setFontColor(HEADER_BG)
                .setMarginBottom(4));

        doc.add(metaLine("Contract", invoice.getContract().getTitle()));
        doc.add(metaLine("Client", invoice.getContract().getCompany().getName()));
        doc.add(metaLine("Period",
                invoice.getPeriodStart().format(DATE_FMT) + "  to  " + invoice.getPeriodEnd().format(DATE_FMT)));
        doc.add(metaLine("Status", invoice.getStatus().name()));
        doc.add(new Paragraph(" ").setMarginBottom(12));

        Table table = new Table(new float[]{3, 1.5f, 2}).useAllAvailableWidth();
        addHeaderCell(table, "Employee");
        addHeaderCell(table, "Total Hours");
        addHeaderCell(table, "Amount (₹)");

        int rowIdx = 0;
        for (Map.Entry<Employee, List<WorkLog>> entry : byEmployee.entrySet()) {
            int empMinutes = entry.getValue().stream().mapToInt(WorkLog::getTotalActualMinutes).sum();
            BigDecimal empAmount = prorate(invoice.getTotalAmount(), empMinutes, totalMinutes);
            boolean alt = (rowIdx++ % 2 == 1);

            addDataCell(table, entry.getKey().getFullName(), alt, TextAlignment.LEFT);
            addDataCell(table, formatHours(empMinutes), alt, TextAlignment.CENTER);
            addDataCell(table, "₹ " + empAmount.toPlainString(), alt, TextAlignment.RIGHT);
        }

        Cell totalLabel = new Cell(1, 2)
                .add(new Paragraph("TOTAL").setBold().setFontColor(ColorConstants.WHITE).setFontSize(9))
                .setBackgroundColor(TOTAL_BG).setPadding(6).setTextAlignment(TextAlignment.LEFT);
        Cell totalAmt = new Cell()
                .add(new Paragraph("₹ " + invoice.getTotalAmount().toPlainString())
                        .setBold().setFontColor(ColorConstants.WHITE).setFontSize(9))
                .setBackgroundColor(TOTAL_BG).setPadding(6).setTextAlignment(TextAlignment.RIGHT);
        table.addCell(totalLabel);
        table.addCell(totalAmt);

        doc.add(table);

        doc.add(new Paragraph("Total Employees: " + byEmployee.size())
                .setFontSize(10).setFontColor(LABEL_COLOR).setMarginTop(8));
    }

    private void addEmployeePage(Document doc, Invoice invoice, Employee emp,
                                 List<WorkLog> logs, int totalMinutes) {
        int empMinutes = logs.stream().mapToInt(WorkLog::getTotalActualMinutes).sum();
        BigDecimal empAmount = prorate(invoice.getTotalAmount(), empMinutes, totalMinutes);

        doc.add(new Paragraph("TIMESHEET DETAIL")
                .setFontSize(18).setBold().setFontColor(HEADER_BG).setMarginBottom(4));

        doc.add(metaLine("Employee", emp.getFullName()));
        doc.add(metaLine("Email", emp.getEmail()));
        doc.add(metaLine("Contract", invoice.getContract().getTitle()));
        doc.add(metaLine("Period",
                invoice.getPeriodStart().format(DATE_FMT) + "  to  " + invoice.getPeriodEnd().format(DATE_FMT)));
        doc.add(new Paragraph(" ").setMarginBottom(8));

        Table table = new Table(new float[]{1.8f, 1f, 1f, 1f, 1.3f, 1.3f})
                .useAllAvailableWidth();
        addHeaderCell(table, "Date");
        addHeaderCell(table, "Start");
        addHeaderCell(table, "End");
        addHeaderCell(table, "Seg. Mins");
        addHeaderCell(table, "Total Hours");
        addHeaderCell(table, "Status");

        List<WorkLog> sorted = logs.stream()
                .sorted(Comparator.comparing(WorkLog::getWorkDate))
                .toList();

        int rowIdx = 0;
        for (WorkLog wl : sorted) {
            List<WorkLogSegment> segs = wl.getSegments();
            boolean alt = (rowIdx++ % 2 == 1);

            if (segs.isEmpty()) {
                addDataCell(table, wl.getWorkDate().format(DATE_FMT), alt, TextAlignment.LEFT);
                addDataCell(table, "—", alt, TextAlignment.CENTER);
                addDataCell(table, "—", alt, TextAlignment.CENTER);
                addDataCell(table, "—", alt, TextAlignment.CENTER);
                addDataCell(table, formatHours(wl.getTotalActualMinutes()), alt, TextAlignment.CENTER);
                addDataCell(table, wl.getStatus().name(), alt, TextAlignment.CENTER);
            } else {
                for (int i = 0; i < segs.size(); i++) {
                    WorkLogSegment seg = segs.get(i);
                    int segMins = (int) Duration.between(seg.getStartTime(), seg.getEndTime()).toMinutes();

                    addDataCell(table, i == 0 ? wl.getWorkDate().format(DATE_FMT) : "", alt, TextAlignment.LEFT);
                    addDataCell(table, seg.getStartTime().format(TIME_FMT), alt, TextAlignment.CENTER);
                    addDataCell(table, seg.getEndTime().format(TIME_FMT), alt, TextAlignment.CENTER);
                    addDataCell(table, String.valueOf(segMins), alt, TextAlignment.CENTER);
                    addDataCell(table, i == 0 ? formatHours(wl.getTotalActualMinutes()) : "", alt, TextAlignment.CENTER);
                    addDataCell(table, i == 0 ? wl.getStatus().name() : "", alt, TextAlignment.CENTER);
                }
            }
        }

        doc.add(table);

        doc.add(new Paragraph(" ").setMarginTop(10));
        doc.add(new Paragraph(
                "Total Hours: " + formatHours(empMinutes) + "    |    Amount: ₹ " + empAmount.toPlainString())
                .setBold().setFontSize(11).setFontColor(HEADER_BG));
    }

    private Paragraph metaLine(String label, String value) {
        return new Paragraph()
                .add(new Text(label + ": ").setBold().setFontSize(10))
                .add(new Text(value).setFontSize(10))
                .setMarginBottom(2);
    }

    private void addHeaderCell(Table table, String text) {
        table.addHeaderCell(new Cell()
                .add(new Paragraph(text).setBold().setFontColor(ColorConstants.WHITE).setFontSize(9))
                .setBackgroundColor(HEADER_BG).setPadding(6));
    }

    private void addDataCell(Table table, String text, boolean alt, TextAlignment align) {
        Cell cell = new Cell()
                .add(new Paragraph(text == null ? "" : text).setFontSize(9).setTextAlignment(align))
                .setPadding(5);
        if (alt) cell.setBackgroundColor(ALT_BG);
        table.addCell(cell);
    }

    private BigDecimal prorate(BigDecimal total, int empMinutes, int totalMinutes) {
        if (totalMinutes == 0) return BigDecimal.ZERO;
        return total.multiply(BigDecimal.valueOf(empMinutes))
                .divide(BigDecimal.valueOf(totalMinutes), 2, RoundingMode.HALF_UP);
    }

    private String formatHours(int minutes) {
        return String.format("%.2f h", minutes / 60.0);
    }
}
