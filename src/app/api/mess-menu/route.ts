import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';

const MENU_SHEET_ID = process.env.NEXT_PUBLIC_MENU_SHEET_ID || process.env.NEXT_PUBLIC_GOOGLE_SHEET_ID || '1W_-bGgOoSX6ewVVR3x0Z-sX87cntneXmGzPp3ruaLsM';

// Helper: Get Google Sheets Client
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
    } catch (e) {
      console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY env variable:', e);
    }
  }

  // Fallback to local file
  const rootPath = process.cwd();
  let keyPath = path.join(rootPath, 'ServiceAccountKey.json');
  if (!fs.existsSync(keyPath)) {
    keyPath = path.join(rootPath, 'serviceAccountKey.json');
  }

  if (fs.existsSync(keyPath)) {
    const credentials = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    return google.sheets({ version: 'v4', auth });
  }

  return null;
}

// Helper: check if item is non-veg
function isNonVeg(itemName: string, category: string): boolean {
  if (!itemName) return false;
  const nameLower = itemName.toLowerCase();
  const catLower = category.toLowerCase();
  
  if (nameLower.includes('eggless')) {
    return false;
  }
  
  return (
    nameLower.includes('chicken') ||
    nameLower.includes('egg') ||
    nameLower.includes('fish') ||
    nameLower.includes('mutton') ||
    nameLower.includes('prawn') ||
    nameLower.includes('beef') ||
    nameLower.includes('pork') ||
    nameLower.includes('non veg') ||
    nameLower.includes('non-veg') ||
    catLower.includes('non veg') ||
    catLower.includes('non-veg') ||
    catLower.includes('egg') ||
    catLower.includes('fish')
  );
}

// Helper: clean item strings
function cleanItem(val: any): string {
  if (val === undefined || val === null) return '';
  const valStr = String(val).trim();
  const upper = valStr.toUpperCase();
  if (upper === 'NONE' || upper === 'NULL' || upper === 'XXX' || upper === '-' || upper === '') {
    return '';
  }
  return valStr;
}

// Helper: read local backup messMenu.json
function getLocalBackup() {
  try {
    const backupPath = path.join(process.cwd(), 'src', 'app', 'api', 'mess-menu', 'messMenu.json');
    if (fs.existsSync(backupPath)) {
      const data = fs.readFileSync(backupPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to read local backup messMenu.json:', err);
  }
  return null;
}

export async function GET() {
  try {
    const sheets = getSheetsClient();
    if (!sheets) {
      console.warn('Sheets client not initialized. Using local fallback.');
      const localData = getLocalBackup();
      if (localData) return NextResponse.json(localData);
      throw new Error('No Sheets credentials and no local backup file found.');
    }

    // List sheet titles to find the correct one
    let targetSheetTitle = '';
    try {
      const spreadsheetMetadata = await sheets.spreadsheets.get({
        spreadsheetId: MENU_SHEET_ID,
      });
      const sheetTitles = (spreadsheetMetadata.data.sheets || []).map(s => s.properties?.title || '');
      
      // Look for a sheet containing 'Mess', 'Menu', or 'IIM'
      const matched = sheetTitles.find(t => 
        t.toLowerCase().includes('mess') || 
        t.toLowerCase().includes('menu') || 
        t.toLowerCase().includes('iim')
      );
      
      if (!matched) {
        console.warn('No sheet matching "Mess", "Menu", or "IIM" found. Using local fallback.');
        const localData = getLocalBackup();
        if (localData) return NextResponse.json(localData);
        throw new Error('No sheets matching "Mess", "Menu" or "IIM" found and no local backup.');
      }
      
      targetSheetTitle = matched;
    } catch (e) {
      console.warn('Error fetching spreadsheet sheets list. Using first tab fallback.', e);
      // Fallback to local backup since sheet query failed
      const localData = getLocalBackup();
      if (localData) return NextResponse.json(localData);
    }

    if (!targetSheetTitle) {
      const localData = getLocalBackup();
      if (localData) return NextResponse.json(localData);
      throw new Error('No sheets found in Google Spreadsheet.');
    }

    // Fetch the raw values (A1:I50 should cover the entire menu)
    const range = `'${targetSheetTitle.replace(/'/g, "''")}'!A1:I50`;
    let rows: any[][] = [];
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: MENU_SHEET_ID,
        range,
      });
      rows = response.data.values || [];
    } catch (e) {
      console.warn(`Failed to fetch spreadsheet range ${range}. Using local backup fallback.`, e);
      const localData = getLocalBackup();
      if (localData) return NextResponse.json(localData);
      throw e;
    }

    if (rows.length < 5) {
      console.warn('Sheet data too short or empty. Using local backup fallback.');
      const localData = getLocalBackup();
      if (localData) return NextResponse.json(localData);
    }

    // Process Google Sheet Rows (mimic Python openpyxl parsing)
    // 1. Get Month Title from cell A1 (index 0, 0)
    const firstCell = rows[0] && rows[0][0] ? String(rows[0][0]).trim() : '';
    const monthMatch = /Menu\s*-\s*([A-Za-z]+\s+\d{4})/i.exec(firstCell);
    const month = monthMatch ? monthMatch[1] : 'June 2026';

    // 2. Map days of week columns in row 2 (index 1)
    const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
    const headerRow = rows[1] || [];
    const daysCols: Record<string, number> = {};
    
    days.forEach(day => {
      const colIdx = headerRow.findIndex(cellVal => String(cellVal).trim().toUpperCase() === day);
      if (colIdx !== -1) {
        daysCols[day] = colIdx;
      }
    });

    // Fallback column indexes if not found in header row (Monday is column index 2/Col C usually)
    days.forEach((day, index) => {
      if (daysCols[day] === undefined) {
        daysCols[day] = index + 2;
      }
    });

    const menuData: Record<string, { breakfast: any[]; lunch: any[]; dinner: any[] }> = {};
    days.forEach(day => {
      menuData[day] = { breakfast: [], lunch: [], dinner: [] };
    });

    // Breakfast (Row 3 to 12 -> 0-indexed: index 2 to 11)
    for (let r = 2; r <= 11; r++) {
      if (r >= rows.length) break;
      const row = rows[r];
      let rowLabel = row[1] || row[0] || 'Breakfast';
      rowLabel = String(rowLabel).trim();

      days.forEach(day => {
        const colIdx = daysCols[day];
        const val = cleanItem(row[colIdx]);
        if (val) {
          menuData[day].breakfast.push({
            category: rowLabel,
            name: val,
            isNonVeg: isNonVeg(val, rowLabel)
          });
        }
      });
    }

    // Lunch (Row 14 to 27 -> 0-indexed: index 13 to 26)
    for (let r = 13; r <= 26; r++) {
      if (r >= rows.length) break;
      const row = rows[r];
      let rowLabel = row[1] || row[0] || 'Lunch';
      rowLabel = String(rowLabel).trim();

      if (rowLabel.toUpperCase() === 'EXTRAS' || rowLabel.toUpperCase() === 'LUNCH') {
        continue;
      }

      days.forEach(day => {
        const colIdx = daysCols[day];
        const val = cleanItem(row[colIdx]);
        if (val) {
          menuData[day].lunch.push({
            category: rowLabel,
            name: val,
            isNonVeg: isNonVeg(val, rowLabel)
          });
        }
      });
    }

    // Dinner (Row 32 to 43 -> 0-indexed: index 31 to 42)
    for (let r = 31; r <= 42; r++) {
      if (r >= rows.length) break;
      const row = rows[r];
      const col0 = row[0] ? String(row[0]).trim() : '';
      const col1 = row[1] ? String(row[1]).trim() : '';

      let rowLabel = col1 || col0 || 'Dinner';
      if (col0 && ['VEG', 'NON VEG', 'NON-VEG'].includes(col0.toUpperCase())) {
        rowLabel = `${col0} (${rowLabel})`;
      }

      if (rowLabel.toUpperCase() === 'EXTRAS' || rowLabel.toUpperCase() === 'DINNER') {
        continue;
      }

      days.forEach(day => {
        const colIdx = daysCols[day];
        const val = cleanItem(row[colIdx]);
        if (val) {
          menuData[day].dinner.push({
            category: rowLabel,
            name: val,
            isNonVeg: isNonVeg(val, rowLabel)
          });
        }
      });
    }

    return NextResponse.json({ month, menu: menuData });
  } catch (err: any) {
    console.error('API Mess Menu Error:', err);
    // Try to fall back to local JSON on final failure
    const localData = getLocalBackup();
    if (localData) return NextResponse.json(localData);
    
    return NextResponse.json({ 
      error: 'Failed to process mess menu', 
      details: err.message || String(err)
    }, { status: 500 });
  }
}
