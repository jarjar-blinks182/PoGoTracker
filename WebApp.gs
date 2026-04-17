// ---- Configuration ----
var SPREADSHEET_ID = '1H4cqFR1hijxAEvLBQmNH2uZPMMLDe6vGx0t5At_DD-w';
var SHEET_NAME = 'MainPoke';
var MEGA_SHEET_NAME = 'MegaPoke';
var POKEDEX_URL = 'https://pokemondb.net/go/pokedex';
var EVOLUTION_URL = 'https://pokemondb.net/evolution';

// ---- Form Filters (edit these to control which forms are included in MainPoke) ----
var INCLUDE_BASE = true;
var INCLUDE_MEGA_PRIMAL = false; // Megas go to their own sheet
var INCLUDE_REGIONAL = true;
var REGIONAL_PREFIXES = ['Alolan', 'Galarian', 'Hisuian', 'Paldean'];
var BREED_KEYWORDS = ['Breed'];
var EXCLUDE_NAMES = ['Armored Mewtwo'];

// ============================================================

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Pokémon Tracker')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getSS_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheet_() {
  return getSS_().getSheetByName(SHEET_NAME);
}

function getMegaSheet_() {
  var ss = getSS_();
  var sheet = ss.getSheetByName(MEGA_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(MEGA_SHEET_NAME);
    sheet.getRange(1, 1).setValue('Number');
    sheet.getRange(1, 2).setValue('Name');
  }
  return sheet;
}

function ensureHeaders_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    sheet.getRange(1, 1).setValue('Number');
    sheet.getRange(1, 2).setValue('Name');
    return ['Number', 'Name'];
  }
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
}

// ============================================================
// Main sheet data
// ============================================================

function getSheetData() {
  var sheet = getSheet_();
  var headers = ensureHeaders_(sheet);
  var lastRow = sheet.getLastRow();

  var players = [];
  for (var col = 2; col < headers.length; col += 2) {
    if (headers[col]) {
      players.push({ name: headers[col], statusCol: col, priorityCol: col + 1 });
    }
  }

  var pokemon = [];
  if (lastRow > 1) {
    var data = sheet.getRange(2, 1, lastRow - 1, Math.max(headers.length, 2)).getValues();
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (!row[0] && !row[1]) continue;
      var entry = { row: i + 2, number: String(row[0]), name: String(row[1]), players: [] };
      for (var p = 0; p < players.length; p++) {
        entry.players.push({
          status: String(row[players[p].statusCol] || ''),
          priority: String(row[players[p].priorityCol] || '')
        });
      }
      pokemon.push(entry);
    }
  }

  var evoChains = fetchEvolutionChains_();
  return { players: players, pokemon: pokemon, evoChains: evoChains };
}

// ============================================================
// Mega sheet data
// ============================================================

function getMegaData() {
  var sheet = getMegaSheet_();
  var headers = ensureHeaders_(sheet);

  // Ensure mega sheet has same players as main sheet
  var mainHeaders = ensureHeaders_(getSheet_());
  var mainPlayers = [];
  for (var mc = 2; mc < mainHeaders.length; mc += 2) {
    if (mainHeaders[mc]) mainPlayers.push(mainHeaders[mc]);
  }
  var megaPlayerNames = [];
  for (var mh = 2; mh < headers.length; mh++) {
    if (headers[mh]) megaPlayerNames.push(headers[mh]);
  }
  // Add any missing players to mega sheet
  for (var mp = 0; mp < mainPlayers.length; mp++) {
    if (megaPlayerNames.indexOf(mainPlayers[mp]) === -1) {
      var nextCol = headers.length + 1;
      sheet.getRange(1, nextCol).setValue(mainPlayers[mp]);
      headers.push(mainPlayers[mp]);
    }
  }

  var lastRow = sheet.getLastRow();

  // Mega sheet: columns are Number, Name, Player1, Player2, Player3... (one col per player, no priority)
  var players = [];
  for (var col = 2; col < headers.length; col++) {
    if (headers[col]) {
      players.push({ name: headers[col], col: col });
    }
  }

  var pokemon = [];
  if (lastRow > 1) {
    var data = sheet.getRange(2, 1, lastRow - 1, Math.max(headers.length, 2)).getValues();
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (!row[0] && !row[1]) continue;
      var entry = { row: i + 2, number: String(row[0]), name: String(row[1]), players: [] };
      for (var p = 0; p < players.length; p++) {
        entry.players.push({ status: String(row[players[p].col] || '') });
      }
      pokemon.push(entry);
    }
  }

  return { players: players, pokemon: pokemon };
}

function markMegaDone(sheetRow, playerIndex) {
  var sheet = getMegaSheet_();
  var col = 3 + playerIndex; // 1-indexed: Number=1, Name=2, Player1=3, ...
  sheet.getRange(sheetRow, col).setValue('Done');
  return true;
}

function unmarkMegaDone(sheetRow, playerIndex) {
  var sheet = getMegaSheet_();
  var col = 3 + playerIndex;
  sheet.getRange(sheetRow, col).setValue('');
  return true;
}

// ============================================================
// Evolution chains
// ============================================================

function fetchEvolutionChains_() {
  try {
    var html = UrlFetchApp.fetch(EVOLUTION_URL).getContentText();
    var blocks = html.split('<div class="infocard-filter-block">');
    var nameToChain = {};

    for (var i = 1; i < blocks.length; i++) {
      var nameMatches = blocks[i].match(/class="ent-name"[^>]*>([^<]+)<\/a>/gi);
      if (!nameMatches) continue;
      var seen = {};
      var chain = [];
      for (var n = 0; n < nameMatches.length; n++) {
        var m = nameMatches[n].match(/>([^<]+)<\/a>/);
        if (m) {
          var name = m[1].trim();
          if (!seen[name]) { seen[name] = true; chain.push(name); }
        }
      }
      for (var c = 0; c < chain.length; c++) {
        nameToChain[chain[c]] = chain;
      }
    }
    return nameToChain;
  } catch (e) {
    return {};
  }
}

// ============================================================
// Search string (server-side, kept for compatibility)
// ============================================================

function generateSearchString(playerIndex, includePriority) {
  var sheet = getSheet_();
  var headers = ensureHeaders_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return '!traded&!shadow&!4*&!mythical&';

  var data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var statusCol = 2 + (playerIndex * 2);
  var priorityCol = statusCol + 1;
  var numbers = [];

  for (var i = 0; i < data.length; i++) {
    var status = String(data[i][statusCol] || '');
    var priority = String(data[i][priorityCol] || '').toLowerCase();
    var pokedex = String(data[i][0]);
    if (!pokedex) continue;

    if (status !== 'Done') {
      numbers.push(pokedex);
    } else if (includePriority && priority === 'x') {
      numbers.push(pokedex);
    }
  }
  return '!traded&!shadow&!4*&!mythical&' + numbers.join(',');
}

// ============================================================
// Marking actions
// ============================================================

function markAsDone(sheetRow, playerIndex) {
  var sheet = getSheet_();
  var statusCol = 2 + (playerIndex * 2) + 1;
  sheet.getRange(sheetRow, statusCol).setValue('Done');
  return true;
}

function markAsPriority(sheetRow, playerIndex) {
  var sheet = getSheet_();
  var priorityCol = 2 + (playerIndex * 2) + 2;
  sheet.getRange(sheetRow, priorityCol).setValue('x');
  return true;
}

function markMultiple(rows, playerIndex, action) {
  var sheet = getSheet_();
  for (var i = 0; i < rows.length; i++) {
    if (action === 'done') {
      sheet.getRange(rows[i], 2 + (playerIndex * 2) + 1).setValue('Done');
    } else if (action === 'priority') {
      sheet.getRange(rows[i], 2 + (playerIndex * 2) + 2).setValue('x');
    }
  }
  return true;
}

// ============================================================
// Add player — adds columns to BOTH sheets
// ============================================================

function addPlayer(playerName) {
  // Main sheet: two columns (status + priority)
  var sheet = getSheet_();
  var headers = ensureHeaders_(sheet);
  var nextCol = headers.length + 1;
  sheet.getRange(1, nextCol).setValue(playerName);
  sheet.getRange(1, nextCol + 1).setValue(playerName + ' Priority');

  // Mega sheet: one column (status only)
  var megaSheet = getMegaSheet_();
  var megaHeaders = ensureHeaders_(megaSheet);
  var megaNextCol = megaHeaders.length + 1;
  megaSheet.getRange(1, megaNextCol).setValue(playerName);

  return { name: playerName, statusCol: nextCol - 1, priorityCol: nextCol };
}

// ============================================================
// Import player data
// ============================================================

function importPlayerData(playerIndex, jsonData) {
  var data = JSON.parse(jsonData);

  // Import main sheet statuses
  if (data.main && data.main.length > 0) {
    var sheet = getSheet_();
    var headers = ensureHeaders_(sheet);
    var lastRow = sheet.getLastRow();
    var statusCol = 2 + (playerIndex * 2) + 1;
    var priorityCol = statusCol + 1;

    if (lastRow > 1) {
      var rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
      // Build lookup: "number|name" -> sheet row
      var rowMap = {};
      for (var i = 0; i < rows.length; i++) {
        rowMap[String(rows[i][0]) + '|' + String(rows[i][1])] = i + 2;
      }

      for (var m = 0; m < data.main.length; m++) {
        var entry = data.main[m];
        var key = String(entry.n) + '|' + String(entry.name);
        var sheetRow = rowMap[key];
        if (sheetRow) {
          if (entry.s) sheet.getRange(sheetRow, statusCol).setValue(entry.s);
          if (entry.p) sheet.getRange(sheetRow, priorityCol).setValue(entry.p);
        }
      }
    }
  }

  // Import mega sheet statuses
  if (data.mega && data.mega.length > 0) {
    var megaSheet = getMegaSheet_();
    var megaHeaders = ensureHeaders_(megaSheet);
    var megaLastRow = megaSheet.getLastRow();
    var megaCol = 3 + playerIndex; // Number=1, Name=2, Player1=3, ...

    if (megaLastRow > 1) {
      var megaRows = megaSheet.getRange(2, 1, megaLastRow - 1, 2).getValues();
      var megaRowMap = {};
      for (var j = 0; j < megaRows.length; j++) {
        megaRowMap[String(megaRows[j][0]) + '|' + String(megaRows[j][1])] = j + 2;
      }

      for (var mg = 0; mg < data.mega.length; mg++) {
        var mEntry = data.mega[mg];
        var mKey = String(mEntry.n) + '|' + String(mEntry.name);
        var mRow = megaRowMap[mKey];
        if (mRow) {
          if (mEntry.s) megaSheet.getRange(mRow, megaCol).setValue(mEntry.s);
        }
      }
    }
  }

  return { success: true, mainCount: (data.main || []).length, megaCount: (data.mega || []).length };
}

// ============================================================
// Pokedex Sync
// ============================================================

function filterEntries_(entries) {
  // Build base name per dex number (first occurrence) and count forms per number
  var baseNames = {};
  var formCounts = {};
  for (var b = 0; b < entries.length; b++) {
    var num = entries[b].number;
    if (!baseNames[num]) {
      baseNames[num] = entries[b].name;
      formCounts[num] = 0;
    }
    formCounts[num]++;
  }

  var filtered = [];
  for (var f = 0; f < entries.length; f++) {
    var e = entries[f];
    var isBase = (e.name === baseNames[e.number]);
    var hasMultipleForms = formCounts[e.number] > 1;

    var excluded = false;
    for (var ex = 0; ex < EXCLUDE_NAMES.length; ex++) {
      if (e.name.indexOf(EXCLUDE_NAMES[ex]) > -1) { excluded = true; break; }
    }
    if (excluded) continue;

    // Mega/Primal — handled by mega sheet, skip here
    if (e.name.indexOf('Mega ') === 0 || e.name.indexOf('Primal ') === 0) {
      if (INCLUDE_MEGA_PRIMAL) { filtered.push(e); }
      continue;
    }

    // Regional variants
    var isRegional = false;
    for (var rp = 0; rp < REGIONAL_PREFIXES.length; rp++) {
      if (e.name.indexOf(REGIONAL_PREFIXES[rp] + ' ') === 0) { isRegional = true; break; }
    }
    if (!isRegional) {
      for (var bk = 0; bk < BREED_KEYWORDS.length; bk++) {
        if (e.name.indexOf(BREED_KEYWORDS[bk]) > -1) { isRegional = true; break; }
      }
    }
    if (isRegional && INCLUDE_REGIONAL) { filtered.push(e); continue; }

    // Base form
    if (isBase && INCLUDE_BASE) { filtered.push(e); continue; }

    // Non-base form of a pokemon with multiple forms (e.g. Pyroar Female, Flabébé Orange Flower)
    // Include these alongside their base form
    if (hasMultipleForms && INCLUDE_BASE) { filtered.push(e); continue; }
  }
  return filtered;
}

// Filter for mega/primal only
function filterMegaEntries_(entries) {
  var megas = [];
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    if (e.name.indexOf('Mega ') === 0 || e.name.indexOf('Primal ') === 0) {
      megas.push(e);
    }
  }
  return megas;
}

function parsePokedexPage_(html) {
  var entries = [];
  // Split into table rows to process one at a time
  var rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var numMatch = row.match(/infocard-cell-data">0*(\d+)<\/span>/i);
    if (!numMatch) continue;

    var nameMatch = row.match(/<a class="ent-name"[^>]*>([^<]+)<\/a>/i);
    if (!nameMatch) continue;

    var number = numMatch[1];
    var baseName = nameMatch[1].trim();

    var formMatch = row.match(/<small class="text-muted">([^<]+)<\/small>/i);
    var formName = formMatch ? formMatch[1].trim() : null;

    var name;
    if (formName) {
      name = (formName.indexOf(baseName) > -1) ? formName : baseName + ' ' + formName;
    } else {
      name = baseName;
    }
    entries.push({ number: number, name: name });
  }

  // Deduplicate by number|name
  var seen = {};
  var unique = [];
  for (var d = 0; d < entries.length; d++) {
    var key = entries[d].number + '|' + entries[d].name;
    if (!seen[key]) {
      seen[key] = true;
      unique.push(entries[d]);
    }
  }
  return unique;
}

function syncToSheet_(sheet, filtered) {
  var headers = ensureHeaders_(sheet);
  var lastRow = sheet.getLastRow();
  var numCols = Math.max(headers.length, 2);

  var existing = {};
  if (lastRow > 1) {
    var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    for (var ei = 0; ei < data.length; ei++) {
      existing[String(data[ei][0]) + '|' + String(data[ei][1])] = true;
    }
  }

  var toAdd = [];
  for (var ni = 0; ni < filtered.length; ni++) {
    var key = filtered[ni].number + '|' + filtered[ni].name;
    if (!existing[key]) toAdd.push(filtered[ni]);
  }

  if (toAdd.length > 0) {
    var newRows = [];
    for (var ai = 0; ai < toAdd.length; ai++) {
      var row = new Array(numCols);
      for (var ci = 0; ci < numCols; ci++) row[ci] = '';
      row[0] = toAdd[ai].number;
      row[1] = toAdd[ai].name;
      newRows.push(row);
    }
    var startRow = Math.max(lastRow + 1, 2);
    sheet.getRange(startRow, 1, newRows.length, numCols).setValues(newRows);

    var totalRows = sheet.getLastRow();
    if (totalRows > 1) {
      sheet.getRange(2, 1, totalRows - 1, numCols).sort([
        { column: 1, ascending: true },
        { column: 2, ascending: true }
      ]);
    }
  }

  return toAdd.length;
}

function syncPokedex() {
  var html = UrlFetchApp.fetch(POKEDEX_URL).getContentText();
  var entries = parsePokedexPage_(html);

  if (entries.length === 0) {
    return { success: false, message: 'Could not parse any pokemon from the page.' };
  }

  // Sync main sheet (no megas)
  var mainFiltered = filterEntries_(entries);
  var mainAdded = syncToSheet_(getSheet_(), mainFiltered);

  // Sync mega sheet
  var megaFiltered = filterMegaEntries_(entries);
  var megaAdded = syncToSheet_(getMegaSheet_(), megaFiltered);

  return {
    success: true,
    message: 'Main: ' + mainFiltered.length + ' filtered, ' + mainAdded + ' added. Mega: ' + megaFiltered.length + ' filtered, ' + megaAdded + ' added.',
    added: mainAdded + megaAdded
  };
}
