import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { ICalCalendar } from 'ical-generator';
import path from 'path';
import fs from 'fs';

// Constants
const SPREADSHEET_ID = process.env.NEXT_PUBLIC_GOOGLE_SHEET_ID || '13-v2m0g3dr3UVo09i3qHLsMqZRyy_6zXf21AtDUtSOQ';
const ROOM_MAP: Record<number, string> = {
  2: 'D1',
  3: 'D2',
  4: 'D3',
  5: 'D4',
  6: 'E3',
  7: 'E4',
  8: 'E1',
  9: 'E2',
};

// Helper: Get Google Sheets Client
function getSheetsClient() {
  // Try loading from environment variable first
  const envCreds = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  
  if (envCreds) {
    try {
      const credentials = JSON.parse(envCreds);
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });
      return google.sheets({ version: 'v4', auth });
    } catch (e: any) {
      console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY env variable:', e);
    }
  }

  // Fallback to local file for development
  const rootPath = process.cwd();
  let keyPath = path.join(rootPath, 'ServiceAccountKey.json');
  
  // Graceful fallback for casing of file in workspace
  if (!fs.existsSync(keyPath)) {
    keyPath = path.join(rootPath, 'serviceAccountKey.json');
  }

  if (!fs.existsSync(keyPath)) {
    throw new Error(
      `Google Sheet credentials not found. Please set GOOGLE_SERVICE_ACCOUNT_KEY env variable or add ServiceAccountKey.json locally.`
    );
  }

  const credentials = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  return google.sheets({ version: 'v4', auth });
}

// Helper: Matching Logic for Abbreviations and Sections
function matchesAbbreviationAndSection(cellText: string, abbr: string, section: string): boolean {
  if (!cellText) return false;
  const text = cellText.trim();
  
  // Split by commas for cases like "GT-A, CONSULTING"
  const parts = text.split(',').map(p => p.trim());
  for (const part of parts) {
    // 1. Exact match of the abbreviation (e.g. cell "LIDA" matches LIDA:A or LIDA:B)
    if (part === abbr) return true;
    
    if (section) {
      // 3. Match specific section suffix (e.g. cell "GT-B" matches GT:B)
      if (part === `${abbr}-${section}`) return true;
      if (part.startsWith(`${abbr}-${section}`)) return true;
    } else {
      // 4. If no section chosen, match any section suffix (e.g. cell "GT-A" matches GT)
      if (part.startsWith(abbr + '-')) return true;
    }
  }

  return false;
}

// Helper: Create Date Object with India Offset (+05:30)
function createDateWithTimezone(dateObj: Date, timeStr: string, offset = '+05:30'): Date {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  
  const [hours, minutes] = timeStr.split(':');
  const formattedHours = hours.padStart(2, '0');
  const formattedMinutes = minutes.padStart(2, '0');
  
  const isoStr = `${year}-${month}-${day}T${formattedHours}:${formattedMinutes}:00${offset}`;
  return new Date(isoStr);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const getCoursesParam = searchParams.get('get_courses') === 'true';
    const coursesParam = searchParams.getAll('courses');

    // 1. Initialize Sheets Client
    const sheets = getSheetsClient();

    // 2. Fetch Course Details (Course Name -> Abbreviation Map)
    const courseDetailsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "'Course Details'!A1:F100",
    });
    const courseRows = courseDetailsResponse.data.values || [];

    const abbrToNameMap: Record<string, string> = {};
    const nameToAbbrMap: Record<string, string[]> = {};
    const courseList: { name: string; abbr: string; sections?: string[]; credits?: number }[] = [];
    for (const row of courseRows) {
      if (row.length < 5) continue;
      const courseName = row[2] ? String(row[2]).trim() : '';
      const abbr = row[4] ? String(row[4]).trim() : '';
      const sectionVal = row[3] ? String(row[3]).trim() : '';
      const creditVal = row[5] ? String(row[5]).trim() : '';
      const credit = creditVal && !isNaN(parseFloat(creditVal)) ? parseFloat(creditVal) : 3;

      if (!courseName || !abbr) continue;
      if (courseName === 'Course' || abbr === 'Abbr.') continue;
      if (courseName.includes('Term IV') || abbr.includes('Term IV')) continue;

      abbrToNameMap[abbr] = courseName;
      if (!nameToAbbrMap[courseName]) {
        nameToAbbrMap[courseName] = [];
      }
      if (!nameToAbbrMap[courseName].includes(abbr)) {
        nameToAbbrMap[courseName].push(abbr);
      }

      // Parse sections
      const sections: string[] = [];
      if (/^[A-Z]+$/.test(sectionVal)) {
        sections.push(...Array.from(sectionVal));
      } else if (sectionVal && sectionVal !== '-') {
        const parts = sectionVal.split(/[,/]/).map(s => s.trim()).filter(Boolean);
        sections.push(...parts);
      }
      
      const existing = courseList.find(c => c.abbr === abbr);
      if (existing) {
        existing.sections = Array.from(new Set([...(existing.sections || []), ...sections]));
        if (credit && !existing.credits) {
          existing.credits = credit;
        }
      } else {
        courseList.push({ name: courseName, abbr, sections, credits: credit });
      }
    }

    // Sort courses alphabetically for the UI
    courseList.sort((a, b) => a.name.localeCompare(b.name));

    // If only courses list metadata requested
    if (getCoursesParam) {
      return NextResponse.json({ courses: courseList });
    }

    // 3. Map URL Course names to abbreviations and sections
    const requestedCoursesRaw = coursesParam
      .flatMap(c => c.split(','))
      .map(c => c.trim())
      .filter(Boolean);

    if (requestedCoursesRaw.length === 0) {
      return NextResponse.json({ 
        error: 'No courses specified. Please add ?courses=Course1:Section,Course2 query parameters.' 
      }, { status: 400 });
    }

    const requestedAbbrs = requestedCoursesRaw
      .map(rawCourse => {
        // Find last colon to separate name/abbr from section robustly (handles colons in names)
        const lastColonIdx = rawCourse.lastIndexOf(':');
        const nameOrAbbr = rawCourse.trim();
        let section = '';

        const resolveAbbr = (name: string): string => {
          if (abbrToNameMap[name]) return name;
          const caseInsensitiveAbbr = Object.keys(abbrToNameMap).find(k => k.toLowerCase() === name.toLowerCase());
          if (caseInsensitiveAbbr) return caseInsensitiveAbbr;

          // Search in nameToAbbrMap
          const exactMatches = nameToAbbrMap[name] || [];
          const caseInsensitiveMatches = Object.entries(nameToAbbrMap).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] || [];
          const matches = exactMatches.length > 0 ? exactMatches : caseInsensitiveMatches;

          if (matches.length > 0) {
            if (matches.length === 1) {
              return matches[0];
            }
            // Disambiguate by checking if the user search term mentions LSM, or prefer non-LSM PGP core/electives
            const containsLsm = name.toLowerCase().includes('lsm');
            const sorted = [...matches].sort((a, b) => {
              const aLsm = a.toLowerCase().includes('lsm');
              const bLsm = b.toLowerCase().includes('lsm');
              if (aLsm && !bLsm) return containsLsm ? -1 : 1;
              if (!aLsm && bLsm) return containsLsm ? 1 : -1;
              return a.length - b.length;
            });
            return sorted[0];
          }
          return '';
        };

        let abbr = resolveAbbr(nameOrAbbr);
        if (!abbr && lastColonIdx !== -1) {
          const possibleName = rawCourse.substring(0, lastColonIdx).trim();
          const possibleSection = rawCourse.substring(lastColonIdx + 1).trim();
          const possibleAbbr = resolveAbbr(possibleName);
          if (possibleAbbr) {
            abbr = possibleAbbr;
            section = possibleSection;
          }
        }

        return abbr ? { abbr, section } : null;
      })
      .filter((item): item is { abbr: string; section: string } => !!item);

    if (requestedAbbrs.length === 0) {
      return NextResponse.json({ 
        error: 'None of the specified courses could be mapped.' 
      }, { status: 400 });
    }

    // 4. Fetch Schedule Sheet (fetch full grid data to inspect cell background formats)
    const scheduleResponse = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
      ranges: ["'Term IV Schedule'!A1:J800"],
      includeGridData: true,
    });
    const sheetData = scheduleResponse.data.sheets?.[0]?.data?.[0];
    const scheduleRows = sheetData?.rowData || [];

    // Initialize iCal Calendar
    const calendar = new ICalCalendar({
      name: 'timetable',
    });

    const jsonEvents: any[] = [];
    let lastSeenDateStr = '';

    for (const row of scheduleRows) {
      if (!row.values) continue;

      const dateCellObj = row.values[0];
      const dateCell = dateCellObj && dateCellObj.formattedValue ? dateCellObj.formattedValue.trim() : '';
      if (dateCell) {
        lastSeenDateStr = dateCell;
      }

      const timeCellObj = row.values[1];
      const timeCell = timeCellObj && timeCellObj.formattedValue ? timeCellObj.formattedValue.trim() : '';
      if (!timeCell || !timeCell.includes('-')) {
        continue; // Skip rows without time range
      }

      const timeParts = timeCell.split('-');
      if (timeParts.length !== 2) continue;

      const startStr = timeParts[0].trim().replace('.', ':');
      const endStr = timeParts[1].trim().replace('.', ':');

      // Check if Date is valid
      if (!lastSeenDateStr) continue;
      const parsedDate = new Date(lastSeenDateStr);
      if (isNaN(parsedDate.getTime())) continue;

      // Construct Start & End times with GMT+05:30 offset
      const startEventDate = createDateWithTimezone(parsedDate, startStr);
      const endEventDate = createDateWithTimezone(parsedDate, endStr);

      // Scan Columns C to J (indexes 2 through 9)
      for (let colIdx = 2; colIdx <= 9; colIdx++) {
        const cell = row.values[colIdx];
        if (!cell) continue;

        const cellValue = cell.formattedValue ? cell.formattedValue.trim() : '';
        if (!cellValue) continue;

        // Check if cell background is highlighted in red (cancelled)
        const bg = cell.userEnteredFormat && cell.userEnteredFormat.backgroundColor;
        const isCancelled = bg && (bg.red || 0) > 0.8 && (bg.green || 0) < 0.2 && (bg.blue || 0) < 0.2;

        // Check each requested abbreviation
        for (const target of requestedAbbrs) {
          if (matchesAbbreviationAndSection(cellValue, target.abbr, target.section)) {
            const courseName = abbrToNameMap[target.abbr] || target.abbr;
            const room = ROOM_MAP[colIdx] || 'Unknown';
            let eventSummary = target.section 
              ? `${courseName} (${target.abbr}-${target.section})`
              : `${courseName} (${target.abbr})`;

            if (isCancelled) {
              eventSummary = `[CANCELLED] ${eventSummary}`;
            }

            // Add Event to Calendar
            calendar.createEvent({
              start: startEventDate,
              end: endEventDate,
              summary: eventSummary,
              location: isCancelled ? 'CANCELLED' : `Room ${room}`,
              description: isCancelled 
                ? `⚠️ CLASS CANCELLED\nScheduled slot: ${timeCell}\nCourse code: ${cellValue}`
                : `Scheduled slot: ${timeCell}\nCourse code: ${cellValue}\nRoom assigned: ${room}`,
            });

            jsonEvents.push({
              start: startEventDate.toISOString(),
              end: endEventDate.toISOString(),
              summary: eventSummary,
              location: isCancelled ? 'CANCELLED' : `Room ${room}`,
              description: isCancelled 
                ? `⚠️ CLASS CANCELLED\nScheduled slot: ${timeCell}\nCourse code: ${cellValue}`
                : `Scheduled slot: ${timeCell}\nCourse code: ${cellValue}\nRoom assigned: ${room}`,
              dateStr: lastSeenDateStr,
              timeSlot: timeCell,
              room,
              abbr: target.abbr,
              section: target.section,
              courseName,
              isCancelled: !!isCancelled,
            });
          }
        }
      }
    }

    // Return the JSON response if requested
    if (searchParams.get('format') === 'json') {
      jsonEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      return NextResponse.json({ events: jsonEvents });
    }

    // Return the .ics response
    return new NextResponse(calendar.toString(), {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="timetable.ics"`,
      },
    });

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ 
      error: 'Internal Server Error', 
      details: error.message || String(error) 
    }, { status: 500 });
  }
}
