import { Response } from 'express';
import { query } from '../lib/db';
import { AuthRequest } from '../middleware/auth.middleware';
import ICAL from 'ical.js';

interface ExportEventRow {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  is_all_day: boolean;
  location: string | null;
  ics_uid: string | null;
  updated_at: string;
}

export const importICS = async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No .ics file uploaded.' });
  }

  try {
    const icsContent = req.file.buffer.toString('utf-8');
    const jcalData = ICAL.parse(icsContent);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');

    if (vevents.length === 0) {
      return res.status(400).json({ message: 'No events found in the .ics file.' });
    }

    // Detect source from PRODID
    const prodId = comp.getFirstPropertyValue('prodid') as string || '';
    let source = 'imported';
    if (prodId.toLowerCase().includes('google')) source = 'google';
    else if (prodId.toLowerCase().includes('microsoft') || prodId.toLowerCase().includes('outlook')) source = 'outlook';
    else if (prodId.toLowerCase().includes('apple')) source = 'apple';

    const imported: any[] = [];
    const skipped: number[] = [];

    for (const vevent of vevents) {
      try {
        const event = new ICAL.Event(vevent);

        const uid = event.uid;
        const title = event.summary || 'Untitled Event';
        const description = event.description || null;
        const location = event.location || null;

        const dtstart = event.startDate;
        const dtend = event.endDate;

        if (!dtstart || !dtend) { skipped.push(vevents.indexOf(vevent)); continue; }

        const startTime = dtstart.toJSDate();
        const endTime = dtend.toJSDate();
        const isAllDay = !dtstart.isDate ? false : dtstart.isDate;

        // Skip duplicates (same uid + user)
        const dup = await query(
          `SELECT id FROM events WHERE ics_uid = $1 AND user_id = $2`,
          [uid, req.userId]
        );
        if (dup.rows.length > 0) { skipped.push(vevents.indexOf(vevent)); continue; }

        const result = await query(
          `INSERT INTO events
             (user_id, title, description, start_time, end_time, event_type, is_all_day, is_imported, ics_uid, source, location, color)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $10, $11)
           RETURNING *`,
          [
            req.userId,
            title,
            description,
            startTime,
            endTime,
            'general',
            isAllDay,
            uid || null,
            source,
            location,
            '#10b981', // green for imported events
          ]
        );
        imported.push(result.rows[0]);
      } catch {
        // skip malformed individual events
        continue;
      }
    }

    return res.status(200).json({
      message: `Imported ${imported.length} event(s). Skipped ${skipped.length} (duplicates or invalid).`,
      imported: imported.length,
      skipped: skipped.length,
      events: imported,
    });
  } catch (err) {
    console.error('importICS error:', err);
    return res.status(500).json({ message: 'Failed to parse .ics file.' });
  }
};

export const exportICS = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }

  try {
    const result = await query<ExportEventRow>(
      `SELECT id,
              title,
              description,
              start_time,
              end_time,
              is_all_day,
              location,
              ics_uid,
              updated_at
       FROM events
       WHERE user_id = $1
       ORDER BY start_time ASC`,
      [req.userId]
    );

    const calendar = new ICAL.Component(['vcalendar', [], []]);
    calendar.updatePropertyWithValue('version', '2.0');
    calendar.updatePropertyWithValue('prodid', '-//Planora//Calendar Export//EN');
    calendar.updatePropertyWithValue('calscale', 'GREGORIAN');
    calendar.updatePropertyWithValue('method', 'PUBLISH');

    for (const eventRow of result.rows) {
      const vevent = new ICAL.Component('vevent');
      calendar.addSubcomponent(vevent);

      const uid = eventRow.ics_uid || `${eventRow.id}@planora.app`;
      vevent.updatePropertyWithValue('uid', uid);
      vevent.updatePropertyWithValue('summary', eventRow.title || 'Untitled Event');

      if (eventRow.description) {
        vevent.updatePropertyWithValue('description', eventRow.description);
      }

      if (eventRow.location) {
        vevent.updatePropertyWithValue('location', eventRow.location);
      }

      const startDate = eventRow.is_all_day
        ? ICAL.Time.fromJSDate(new Date(eventRow.start_time), true)
        : ICAL.Time.fromJSDate(new Date(eventRow.start_time), false);
      const endDate = eventRow.is_all_day
        ? ICAL.Time.fromJSDate(new Date(eventRow.end_time), true)
        : ICAL.Time.fromJSDate(new Date(eventRow.end_time), false);

      vevent.addPropertyWithValue('dtstart', startDate);
      vevent.addPropertyWithValue('dtend', endDate);
      vevent.addPropertyWithValue('dtstamp', ICAL.Time.fromJSDate(new Date(eventRow.updated_at), false));
      vevent.addPropertyWithValue('last-modified', ICAL.Time.fromJSDate(new Date(eventRow.updated_at), false));
    }

    const fileName = `planora-events-${new Date().toISOString().slice(0, 10)}.ics`;
    const icsBody = calendar.toString();

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.status(200).send(icsBody);
  } catch (err) {
    console.error('exportICS error:', err);
    return res.status(500).json({ message: 'Failed to export .ics file.' });
  }
};
