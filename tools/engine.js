'use strict';
const fs = require('node:fs');
const path = require('node:path');
const files = ['world', 'world_decode', 'data', 'engine_core', 'engine_sim', 'engine_dipl', 'ai', 'campaign', 'quickplay'];
const code = files.map(f => fs.readFileSync(path.join(__dirname, '../src', f + '.js'), 'utf8')).join('\n');
const api = ['newGame', 'newGameShell', 'tick', 'saveGame', 'loadGame', 'cidx', 'CTY', 'PROV', 'P', 'NC', 'UNITS', 'BLD', 'budgetFor', 'updateSupply', 'supplied', 'spawnUnit', 'killUnit', 'orderMove', 'setStance', 'campaignAttack', 'campaignDay', 'campaignTick', 'queueUnit', 'reorderQueue', 'signPact', 'breakPact', 'declareWar', 'atWar', 'areAllied', 'leaveAlliance', 'guaranteeCountry', 'previewWar', 'createTradeRoute', 'toggleEmbargo', 'requestLoan', 'taxRate', 'recalc', 'reserveTransfer', 'sendToRepair', 'recordEconomy', 'weatherAt', 'armyPower', 'routeETA', 'initCampaign', 'priceOf', 'BASE_PRICE', 'validateSave', 'trade', 'fightAt', 'campaignAutoBuy', 'portBlockaded', 'canQueue', 'stopUnits', 'settlePeace', 'unitCostFor', 'fireMissile', 'researchOptions'];
const m = { exports: {} };
new Function('module', 'exports', 'require', code + '\nmodule.exports={get G(){return G},' + api.join(',') + '};')(m, m.exports, require);
module.exports = m.exports;
