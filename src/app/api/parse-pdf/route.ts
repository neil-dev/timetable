import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';
import { getDocumentProxy } from 'unpdf';

// Google Sheet Configurations
const SPREADSHEET_ID = process.env.NEXT_PUBLIC_GOOGLE_SHEET_ID || '13-v2m0g3dr3UVo09i3qHLsMqZRyy_6zXf21AtDUtSOQ';

// Helper: Get Sheets Client
function getSheetsClient() {
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

  const rootPath = process.cwd();
  let keyPath = path.join(rootPath, 'ServiceAccountKey.json');
  
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

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as Blob | null;

    if (!file) {
      return NextResponse.json({ error: 'No PDF file uploaded.' }, { status: 400 });
    }

    // 1. Fetch valid courses from Google Sheet
    const sheets = getSheetsClient();
    const courseDetailsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "'Course Details'!A1:F100",
    });
    const courseRows = courseDetailsResponse.data.values || [];

    const courseList: { name: string; abbr: string }[] = [];

    for (const row of courseRows) {
      if (row.length < 5) continue;
      const courseName = row[2] ? String(row[2]).trim() : '';
      const abbr = row[4] ? String(row[4]).trim() : '';

      if (!courseName || !abbr) continue;
      if (courseName === 'Course' || abbr === 'Abbr.') continue;
      if (courseName.includes('Term IV') || abbr.includes('Term IV')) continue;

      if (!courseList.some(c => c.abbr === abbr)) {
        courseList.push({ name: courseName, abbr });
      }
    }

    // 2. Read uploaded file as arrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // 3. Extract text from PDF using unpdf with Y-coordinate tracking for newlines
    const pdfProxy = await getDocumentProxy(new Uint8Array(arrayBuffer));
    let text = '';
    
    for (let i = 1; i <= pdfProxy.numPages; i++) {
      const page = await pdfProxy.getPage(i);
      const textContent = await page.getTextContent();
      
      let lastY, pageText = '';
      for (const item of textContent.items) {
        const textItem = item as any;
        const y = textItem.transform?.[5];
        if (lastY === y || !lastY) {
          pageText += textItem.str || '';
        } else {
          pageText += '\n' + (textItem.str || '');
        }
        lastY = y;
      }
      text += pageText + '\n\n';
    }

    const lines = text.split('\n').map((line: string) => line.trim()).filter(Boolean);

    // 4. Group lines into blocks using serial numbers as delimiters
    const blocks: string[] = [];
    let currentBlock: string[] = [];
    let collecting = false;

    for (const line of lines) {
      // Check if line is a digit (S.No)
      if (/^\d+$/.test(line)) {
        if (currentBlock.length > 0) {
          blocks.push(currentBlock.join(' '));
        }
        currentBlock = [];
        collecting = true;
      } else if (collecting) {
        // Stop block collection at student metadata or footer lines
        if (
          line.includes('Student Name:') || 
          line.includes('Email Id:') || 
          line.includes('Confirmed Credits:') || 
          line.includes('* Note:')
        ) {
          collecting = false;
          if (currentBlock.length > 0) {
            blocks.push(currentBlock.join(' '));
          }
          currentBlock = [];
        } else {
          currentBlock.push(line);
        }
      }
    }

    if (currentBlock.length > 0) {
      blocks.push(currentBlock.join(' '));
    }

    // 5. Fuzzy match blocks to valid course names and extract section codes
    const selections = [];

    for (const block of blocks) {
      let matchedCourse = null;
      for (const vc of courseList) {
        const name = vc.name;
        
        // Clean special chars for matching
        const cleanName = name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const cleanBlock = block.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

        if (cleanBlock.includes(cleanName) || cleanBlock.startsWith(cleanName)) {
          matchedCourse = vc;
          break;
        }

        if (cleanName.includes('dataanalytics') && cleanBlock.includes('dataanalytics')) {
          matchedCourse = vc;
          break;
        }
      }

      if (matchedCourse) {
        let section = '';
        const profIdx = block.indexOf('(Prof.');
        if (profIdx !== -1) {
          const preProf = block.substring(0, profIdx).trim();
          if (preProf.length > 0) {
            const lastChar = preProf[preProf.length - 1];
            if (/[A-Z]/.test(lastChar)) {
              section = lastChar;
            }
          }
        }

        selections.push({
          name: matchedCourse.name,
          abbr: matchedCourse.abbr,
          section
        });
      }
    }

    return NextResponse.json({ selections });

  } catch (error: any) {
    console.error('PDF Parse Route Error:', error);
    return NextResponse.json({ 
      error: 'Failed to process and parse PDF file.', 
      details: error.message || String(error) 
    }, { status: 500 });
  }
}
