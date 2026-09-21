import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import "./Calendar.css";

const DEFAULT_HEADER = {
  left: "prev,next today",
  center: "title",
  right: "timeGridWeek,timeGridDay,dayGridMonth",
};

export default function Calendar({
  events = [],
  view = "timeGridWeek",
  selectable = false,
  editable = false,
  onSelectSlot,
  onEventClick,
  height = 640,
  slotMinTime = "00:00:00",
  slotMaxTime = "24:00:00",
  businessHours,
  eventContent,
  headerToolbar = DEFAULT_HEADER,
}) {
  return (
    <div className="wb-calendar">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={view}
        headerToolbar={headerToolbar}
        events={events}
        selectable={selectable}
        editable={editable}
        selectMirror={selectable}
        select={onSelectSlot}
        eventClick={onEventClick}
        eventContent={eventContent}
        height={height}
        slotMinTime={slotMinTime}
        slotMaxTime={slotMaxTime}
        allDaySlot={false}
        nowIndicator
        businessHours={businessHours}
        firstDay={1}
        eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
      />
    </div>
  );
}
