import { useEffect, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import './Calendar.css'

const DESKTOP_HEADER = {
  left: 'prev,next today',
  center: 'title',
  right: 'timeGridWeek,timeGridDay,dayGridMonth',
}

const MOBILE_HEADER = {
  left: 'prev,next',
  center: 'title',
  right: 'timeGridDay,dayGridMonth',
}

function useIsNarrow(query = '(max-width: 640px)') {
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = (e) => setNarrow(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return narrow
}

/**
 * FullCalendar with the app's look. On a phone a seven-column week is
 * unreadable, so it opens on a single day instead.
 */
export default function Calendar({
  events = [],
  view = 'timeGridWeek',
  initialDate,
  selectable = false,
  editable = false,
  onSelectSlot,
  onEventClick,
  height = 640,
  slotMinTime = '00:00:00',
  slotMaxTime = '24:00:00',
  scrollTime = '07:00:00',
  businessHours,
  eventContent,
  headerToolbar,
}) {
  const narrow = useIsNarrow()
  const initialView = narrow && view === 'timeGridWeek' ? 'timeGridDay' : view

  return (
    <div className="wb-calendar">
      <FullCalendar
        key={`${initialView}-${initialDate ?? ''}`}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={initialView}
        initialDate={initialDate}
        headerToolbar={headerToolbar ?? (narrow ? MOBILE_HEADER : DESKTOP_HEADER)}
        events={events}
        selectable={selectable}
        editable={editable}
        selectMirror={selectable}
        select={onSelectSlot}
        eventClick={onEventClick}
        eventContent={eventContent}
        height={narrow ? Math.min(height, 560) : height}
        slotMinTime={slotMinTime}
        slotMaxTime={slotMaxTime}
        scrollTime={scrollTime}
        allDaySlot={false}
        nowIndicator
        businessHours={businessHours}
        firstDay={1}
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
      />
    </div>
  )
}
